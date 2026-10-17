import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDemoProvider, validateDemoSnapshot} from '../../src/ui/demo-provider.js';

const fixture = JSON.parse(readFileSync(new URL('../../public/demo.snapshot.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(fixture);
const provider = createDemoProvider(fixture);
const sum = (items) => items.reduce((total, item) => total + item.count, 0);
function datesFixture(dates) {
  const snapshot = copy();
  snapshot.projects = dates.map((date, index) => ({
    ...structuredClone(snapshot.projects[0]), project_id: `boundary-${index}`,
    award_date: date, competition_date: date,
  }));
  return createDemoProvider(snapshot);
}

test('fixture validates and clearly distinguishes 12 supplied from 11 dated projects', () => {
  assert.deepEqual(validateDemoSnapshot(fixture), {valid: true, errors: []});
  assert.equal(fixture.projects.length, 12);
  assert.deepEqual(provider.select().summary,
    {projects: 11, sources: 13, schools: 11, firms: 5, excludedUnknownDates: 1, unclassifiedProjects: 1});
  assert.equal(provider.select().metadata.is_demo, true);
  assert.ok(fixture.projects.every((p) => p.title.includes('가상')));
  assert.ok(fixture.firms.every((f) => f.business_registration_number === null));
});

test('region, level and monthly charts have the same distinct project denominator', () => {
  const result = provider.select();
  assert.deepEqual(result.byRegion, [
    {label: '서울특별시', count: 3}, {label: '경기도', count: 2},
    {label: '인천광역시', count: 2}, {label: '부산광역시', count: 2},
    {label: '제주특별자치도', count: 2},
  ]);
  assert.equal(sum(result.byRegion), 11);
  assert.equal(sum(result.byLevel), 11);
  assert.equal(sum(result.byMonth), 11);
  assert.equal(result.byLevel.find((i) => i.label === '통합학교').count, 2);
  assert.equal(result.byLevel.find((i) => i.label === '초등학교').count, 4);
  assert.equal(result.byMonth[0].label, '2023-10');
  assert.equal(result.byMonth.at(-1).label, '2026-10');
  assert.equal(result.byMonth.find((i) => i.label === '2026-10').count, 0);
});

test('all sections and export respond to the same region, level and topic filters', () => {
  const filters = {region: '11', schoolLevel: 'elementary', topic: 'outdoor'};
  const result = provider.select(filters);
  assert.deepEqual(result.projects.map((p) => p.project_id), ['demo-project-001']);
  assert.deepEqual(result.summary, {projects: 1, sources: 2, schools: 1, firms: 1, excludedUnknownDates: 0, unclassifiedProjects: 0});
  assert.equal(sum(result.byRegion), 1);
  assert.equal(result.buildings.length, 1);
  assert.equal(result.firms.length, 1);
  assert.equal(result.firms[0].firm_id, 'demo-firm-001');
  assert.equal(provider.exportRows(filters).rows.length, 1);
  assert.deepEqual(provider.exportRows(filters).metadata.filters, result.metadata.filters);
});

test('search covers school and firm names without treating text as HTML or a regex', () => {
  assert.deepEqual(provider.select({query: '이음'}).projects.map((p) => p.project_id),
    ['demo-project-002', 'demo-project-007', 'demo-project-011']);
  assert.equal(provider.select({query: '가상 테라스고등학교'}).summary.projects, 1);
  assert.equal(provider.select({query: '.*'}).summary.projects, 0);
  const snapshot = copy();
  snapshot.projects[0].title = '<img src=x onerror=alert(1)>';
  const untrusted = createDemoProvider(snapshot).select({query: '<img'});
  assert.equal(untrusted.projects[0].title, '<img src=x onerror=alert(1)>');
});

test('no matching records means zero charts, no firms or buildings, and no export rows', () => {
  const filters = {query: '전혀없는가상사례ZZZ'};
  const result = provider.select(filters);
  assert.equal(result.empty, true);
  assert.deepEqual(result.summary, {projects: 0, sources: 0, schools: 0, firms: 0, excludedUnknownDates: 0, unclassifiedProjects: 0});
  assert.equal(sum(result.byRegion) + sum(result.byLevel) + sum(result.byMonth) + sum(result.topics), 0);
  assert.equal(result.buildings.length, 0);
  assert.equal(result.firms.length, 0);
  assert.equal(provider.exportRows(filters).rows.length, 0);
  assert.deepEqual(provider.exportRows(filters).metadata.sources, []);
  assert.equal(provider.exportRows(filters).metadata.source_context.snapshot_source_count, 14);
});

test('unknown date diagnostics obey non-date filters and never substitute competition dates', () => {
  assert.equal(provider.select({region: '41'}).summary.excludedUnknownDates, 1);
  assert.equal(provider.select({region: '11'}).summary.excludedUnknownDates, 0);
  const snapshot = copy();
  snapshot.projects[11].competition_date = '2026-09-01';
  const local = createDemoProvider(snapshot);
  assert.equal(local.select().summary.projects, 11);
  assert.equal(local.select({dateBasis: 'competition_date'}).summary.projects, 12);
  assert.equal(local.select({dateBasis: 'competition_date'}).summary.excludedUnknownDates, 0);
});

test('rolling window excludes exact lower bound, includes upper bound and excludes future dates', () => {
  const local = datesFixture(['2023-10-17', '2023-10-18', '2026-10-17', '2026-10-18', null]);
  const result = local.select({asOf: '2026-10-17', months: 36});
  assert.deepEqual(result.projects.map((p) => p.project_id), ['boundary-2', 'boundary-1']);
  assert.equal(result.summary.excludedUnknownDates, 1);
  assert.equal(result.summary.schools, 1);
  assert.equal(result.summary.sources, 2);
});

test('month subtraction clamps leap-year February rather than overflowing into March', () => {
  const local = datesFixture(['2024-02-29', '2024-03-01', '2024-03-31', '2024-04-01']);
  assert.deepEqual(local.select({asOf: '2024-03-31', months: 1}).projects.map((p) => p.project_id),
    ['boundary-2', 'boundary-1']);
  assert.deepEqual(local.select({asOf: '2024-03-31', months: 1}).byMonth, [{label: '2024-03', count: 2}]);
});

test('month subtraction clamps non-leap February at day 28', () => {
  const local = datesFixture(['2025-02-28', '2025-03-01', '2025-03-31']);
  assert.deepEqual(local.select({asOf: '2025-03-31', months: 1}).projects.map((p) => p.project_id),
    ['boundary-2', 'boundary-1']);
});

test('building age separates exact 40, 39, 41, year uncertainty and inactive records', () => {
  const buildings = new Map(provider.select().buildings.map((b) => [b.building_id, b]));
  const age = (suffix) => buildings.get(`demo-building-${suffix}`);
  assert.equal(age('001').age_status, 'eligible');
  assert.equal(age('001').age_label, '40년');
  assert.equal(age('002').age_status, 'under');
  assert.equal(age('002').age_label, '39년');
  assert.equal(age('003').age_status, 'uncertain');
  assert.equal(age('003').age_label, '39–40년 · 월일 미확인');
  assert.equal(age('004').age_label, '41년');
  assert.equal(age('005').age_status, 'inactive');
  assert.equal(age('006').age_status, 'unknown');
  assert.equal(age('007').age_status, 'eligible');
  assert.equal(age('009').age_status, 'inactive');
  assert.equal(age('010').age_status, 'unknown');
  assert.equal(provider.select({asOf: '2026-12-31'}).buildings.find((b) => b.building_id.endsWith('003')).age_status, 'eligible');
});

test('joint firms are participation counts, not a partition of project totals', () => {
  const selected = provider.select();
  assert.equal(selected.firms.reduce((n, f) => n + f.project_count, 0), 14);
  assert.equal(selected.summary.projects, 11);
  const joint = provider.select({query: '동네를 잇는 도서관'});
  assert.equal(joint.firms.length, 2);
  assert.ok(joint.firms.every((f) => f.project_count === 1));
});

test('multiple topic evidence rows do not count one project twice within a topic', () => {
  const snapshot = copy();
  snapshot.projects[0].topic_evidence.push({...snapshot.projects[0].topic_evidence[0]});
  const result = createDemoProvider(snapshot).select();
  assert.equal(result.topics.find((t) => t.id === 'outdoor').count, 5);
  assert.ok(sum(result.topics) > result.summary.projects);
});

test('export rows follow selection order and include explicit demo and query metadata', () => {
  const filters = {region: '41'};
  const selected = provider.select(filters);
  const exported = provider.exportRows(filters);
  assert.deepEqual(exported.rows.map((r) => r.project_id), selected.projects.map((p) => p.project_id));
  assert.equal(exported.rows.length, 2);
  assert.ok(exported.rows.every((r) => r.is_demo === true && r.as_of === '2026-10-17'));
  assert.ok(exported.rows.every((r) => typeof r.firm_names === 'string' && r.source_urls === ''));
  assert.deepEqual(exported.columns.map((c) => c.key), Object.keys(exported.rows[0]));
  assert.equal(exported.metadata.date_basis, 'award_date');
  assert.equal(exported.metadata.filters.region, '41');
  assert.equal(exported.metadata.sources.length, 2);
  assert.equal(exported.metadata.sources[0].source_id, 'demo-source-002');
  assert.equal(exported.metadata.sources[0].url, null);
});

test('rejects real data, missing markers, real identifiers and unverified source claims', () => {
  for (const mutate of [
    (s) => { s.is_demo = false; }, (s) => { delete s.is_demo; },
    (s) => { s.firms[0].business_registration_number = '1234567890'; },
    (s) => { s.sources[0].verification_status = 'verified'; },
  ]) {
    const snapshot = copy(); mutate(snapshot);
    assert.equal(validateDemoSnapshot(snapshot).valid, false);
    assert.throws(() => createDemoProvider(snapshot));
  }
});

test('competition-date export preserves both raw dates and the selected basis when award date is missing', () => {
  const snapshot = copy();
  snapshot.projects[11].competition_date = '2026-09-01';
  const local = createDemoProvider(snapshot);
  const filters = {dateBasis: 'competition_date', query: '당선일 확인 대기 사례'};
  const selected = local.select(filters);
  const exported = local.exportRows(filters);
  assert.equal(selected.summary.projects, 1);
  assert.equal(exported.rows.length, 1);
  assert.equal(exported.rows[0].award_date, '');
  assert.equal(exported.rows[0].competition_date, '2026-09-01');
  assert.equal(exported.rows[0].event_date, '2026-09-01');
  assert.equal(exported.rows[0].event_date_basis, 'competition_date');
  assert.equal(exported.metadata.date_basis, 'competition_date');
  assert.deepEqual(exported.columns.map((c) => c.key), Object.keys(exported.rows[0]));
  assert.equal(local.exportRows({...filters, dateBasis: 'award_date'}).rows.length, 0);
});

test('query date does not replace snapshot source date or generation timestamp', () => {
  const filters = {asOf: '2027-10-17'};
  for (const result of [provider.select(filters), provider.exportRows(filters)]) {
    assert.equal(result.metadata.as_of, '2027-10-17');
    assert.equal(result.metadata.snapshot_as_of, '2026-10-17');
    assert.equal(result.metadata.snapshot_generated_at, '2026-10-17T00:00:00+09:00');
    assert.equal(result.metadata.filters.asOf, '2027-10-17');
  }
});

test('rejects duplicate ids, broken references and malformed nested objects', () => {
  for (const mutate of [
    (s) => { s.projects[1].project_id = s.projects[0].project_id; },
    (s) => { s.projects[0].school_ids = ['missing']; },
    (s) => { s.projects[0].source_ids.push(s.projects[0].source_ids[0]); },
    (s) => { s.projects[0].images = [null]; },
    (s) => { s.projects[0].topic_evidence[0].source_id = 'missing'; },
    (s) => { s.schools[0].school_level = '__proto__'; },
    (s) => { s.projects[0].title = 'x'.repeat(301); },
    (s) => { s.projects = Array.from({length: 1001}, () => s.projects[0]); },
  ]) {
    const snapshot = copy(); mutate(snapshot);
    assert.equal(validateDemoSnapshot(snapshot).valid, false);
  }
});

test('rejects impossible calendar dates and inconsistent date precision', () => {
  for (const mutate of [
    (s) => { s.projects[0].award_date = '2026-02-29'; },
    (s) => { s.projects[0].award_date = '2026-04-31'; },
    (s) => { s.buildings[0].completion_year = 1985; },
    (s) => { s.buildings[0].date_precision = 'year'; },
    (s) => { s.buildings[2].completion_date = '1986-01-01'; },
    (s) => { s.buildings[5].completion_year = 1980; },
    (s) => { s.generated_at = '2026-02-31T00:00:00Z'; },
  ]) {
    const snapshot = copy(); mutate(snapshot);
    assert.equal(validateDemoSnapshot(snapshot).valid, false);
  }
});

test('invalid filters fail visibly instead of silently changing the requested range', () => {
  for (const filters of [
    {asOf: '2026-02-31'}, {months: 0}, {months: 1.5}, {months: 121},
    {dateBasis: 'published_at'}, {region: 'xx'}, {schoolLevel: '__proto__'},
    {topic: '__proto__'}, {query: 'x'.repeat(201)},
  ]) assert.throws(() => provider.select(filters));
});

test('input is not mutated and caller changes after construction do not affect the provider', () => {
  const snapshot = copy();
  const original = JSON.stringify(snapshot);
  const local = createDemoProvider(snapshot);
  local.select({region: '11'});
  local.exportRows();
  assert.equal(JSON.stringify(snapshot), original);
  snapshot.projects[0].title = 'changed externally';
  assert.notEqual(local.snapshot.projects[0].title, snapshot.projects[0].title);
});

test('the original single-record contract fixture can still be opened', () => {
  const original = JSON.parse(readFileSync(new URL('../../data/examples/snapshot.demo.json', import.meta.url), 'utf8'));
  const local = createDemoProvider(original);
  assert.equal(local.select().summary.projects, 1);
  assert.equal(local.select().summary.unclassifiedProjects, 1);
  assert.equal(local.select().buildings[0].age_status, 'eligible');
});
