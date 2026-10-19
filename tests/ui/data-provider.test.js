import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDataProvider} from '../../src/ui/data-provider.js';
import {filterProjects, summarizeProjects} from '../../src/domain/projects.js';
import {summarizeFirms} from '../../src/domain/firms.js';
import {summarizeBuildings} from '../../src/domain/buildings.js';
import {summarizeTopics} from '../../src/domain/topics.js';
import {exportRows as sharedExportRows} from '../../src/data/export.js';
import {serializeCsv, serializeMarkdown} from '../../src/ui/export.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const legacy = () => read('../../public/demo.snapshot.json');
const a1 = () => read('../domain/fixtures/a1.virtual.json');
const a2 = () => read('../domain/fixtures/a2.virtual.json');
test('작품집 설계자 표기는 사무소 ID가 없어도 검색과 내보내기에 함께 반영한다', () => {
  const provider = createDataProvider(read('../../data/goe-annual.snapshot.json'));
  const filters = {dateBasis:'award_year',year:'2024',query:'누아건축사사무소'};
  const view = provider.select(filters);
  assert.ok(view.projects.some(p => p.project_id === 'goe-2024-482'));
  assert.ok(view.projects.every(p => p.designers.some(d => d.firm.includes('누아건축사사무소'))));
  assert.deepEqual(provider.exportRows(filters).rows.map(p => p.project_id), view.projects.map(p => p.project_id));
  assert.equal(view.summary.firms, 0, '표기를 검색해도 사무소 식별자 연결을 만들지 않는다');
});
const fixtures = [
  ['UI', legacy, 11, 13, 11],
  ['A1', a1, 7, 8, 5],
  ['A2', a2, 5, 5, 3],
  ['original', () => read('../../data/examples/snapshot.demo.json'), 1, 1, 1],
];

for (const [name, fixture, count, sources, schools] of fixtures) {
  test(`${name} fixture uses shared A1/A2 project, firm, topic and export results`, () => {
    const provider = createDataProvider(JSON.stringify(fixture()));
    const view = provider.select();
    assert.equal(view.summary.projects, count);
    assert.equal(view.summary.sources, sources);
    assert.equal(view.summary.schools, schools);
    const domainProjects = filterProjects(provider.snapshot);
    const domain = summarizeProjects(domainProjects);
    const firms = summarizeFirms(domainProjects, provider.snapshot);
    const topics = summarizeTopics(domainProjects);
    assert.deepEqual(view.projects.map((p) => p.project_id), domainProjects.map((p) => p.project_id));
    assert.equal(view.summary.projects, domain.uniqueProjects);
    assert.deepEqual(view.firms.map((f) => [f.firm_id, f.project_count]), firms.firms.map((f) => [f.firm_id, f.participations]));
    assert.deepEqual(view.topics.map((t) => [t.id, t.count]), topics.topics.map((t) => [t.topic_id, t.projects]));
    assert.equal(view.summary.unclassifiedProjects, topics.unclassified);
    assert.deepEqual(provider.exportRows().rows, sharedExportRows(provider.snapshot).rows);
    assert.deepEqual(provider.exportRows().columns, sharedExportRows(provider.snapshot).columns);
  });
}

test('A1 duplicate normalization, missing region/type and ISO publication dates remain usable', () => {
  const provider = createDataProvider(a1());
  assert.equal(provider.snapshot.projects.length, 9);
  assert.ok(provider.warnings.some((w) => w.code === 'merged_duplicate_project'));
  assert.ok(provider.warnings.every((w) => typeof w.path === 'string' && typeof w.message === 'string'));
  const project = provider.snapshot.projects.find((p) => p.project_id === 'v-project-001');
  assert.equal(project.source_ids.length, 2);
  assert.equal(project._raw.length, 2);
  assert.equal(provider.snapshot.sources.find((s) => s.source_id === 'v-src-news-001').published_at, '2026-05-02T09:00:00+09:00');
  assert.equal(provider.select({region: 'unknown'}).summary.projects, 1);
  assert.equal(provider.select({region: 'unknown'}).projects[0].project_type, null);
  assert.equal(provider.select({region: 'unknown'}).projects[0].region_name, '지역 미확인');
});

test('multi-region participation and region filters use A1 rather than the single project region', () => {
  const provider = createDataProvider(a1());
  assert.equal(provider.select().summary.projects, 7);
  assert.equal(provider.select().summary.regionParticipations, 8);
  assert.equal(provider.select().summary.multiRegionProjects, 1);
  const view = provider.select({region: '28'});
  assert.deepEqual(view.projects.map((p) => p.project_id), ['v-project-009']);
  assert.match(view.projects[0].region_name, /경기도/);
  assert.match(view.projects[0].region_name, /인천광역시/);
  assert.deepEqual(view.byRegion.filter((r) => r.count).map((r) => [r.code, r.count]), [['28', 1], ['41', 1]]);
  assert.equal(provider.exportRows({region: '28'}).rows.length, 1);
});

test('legacy topic aliases are explicit, canonical in options, and preserved in original _raw', () => {
  const input = legacy();
  const before = JSON.stringify(input);
  const provider = createDataProvider(input);
  const project = provider.snapshot.projects[0];
  assert.equal(project.topic_evidence[0].topic_id, 'outdoor_learning');
  assert.equal(project._raw.topic_evidence[0].topic_id, 'outdoor');
  assert.equal(JSON.stringify(input), before);
  assert.equal(provider.warnings.filter((w) => w.code === 'topic_alias').length, 1);
  assert.equal(provider.warnings.find((w) => w.code === 'topic_alias').level, 'info');
  assert.ok(provider.options.topics.some((t) => t.value === 'community_sharing'));
  assert.ok(!provider.options.topics.some((t) => t.value === 'shared'));
  assert.equal(provider.select({topic: 'outdoor_learning'}).summary.projects, 5);
  assert.equal(provider.select().projects[0].topic_evidence[0].topic_label, '외부학습공간');
});

test('search, school level, region, topic and dates select identical display and export IDs', () => {
  const cases = [
    {query: '이음'}, {region: '11', schoolLevel: 'elementary', topic: 'outdoor_learning'},
    {months: 12}, {dateBasis: 'competition_date'}, {dateBasis: 'published_at', query: '가상'},
    {query: 'ZZZ조건없음'}, {topic: 'unclassified'},
  ];
  for (const [, fixture] of fixtures) {
    const provider = createDataProvider(fixture());
    for (const filters of cases) {
      const selected = provider.select(filters);
      const exported = provider.exportRows(filters);
      assert.deepEqual(exported.rows.map((r) => r.project_id), selected.projects.map((p) => p.project_id));
      assert.equal(exported.rows.length, selected.summary.projects);
      assert.deepEqual(exported.metadata.filters, selected.metadata.filters);
      assert.equal(exported.metadata.row_count, selected.summary.projects);
    }
  }
  const provider = createDataProvider(legacy());
  assert.equal(provider.select({query: '이음'}).summary.projects, 3);
  assert.equal(provider.select({region: '11', schoolLevel: 'elementary', topic: 'outdoor_learning'}).summary.projects, 1);
});

test('published_at uses source dates and counts the same project in each publication month', () => {
  const provider = createDataProvider(a1());
  const filters = {dateBasis: 'published_at', query: '가람초 증축'};
  const view = provider.select(filters);
  assert.equal(view.summary.projects, 1);
  assert.equal(view.summary.sources, 2);
  assert.equal(view.projects[0].basis_date, '2026-04-01');
  assert.equal(view.projects[0].award_date, '2026-03-10');
  assert.deepEqual(view.byMonth.filter((r) => r.count).map((r) => [r.label, r.count, r.articles]),
    [['2026-04', 1, 1], ['2026-05', 1, 1]]);
  assert.equal(provider.exportRows(filters).rows[0].basis_date, '2026-04-01');
  assert.ok(view.notes.some((note) => note.includes('달마다')));
});

test('A2 classifies building ages; adapter only maps age and occupancy labels', () => {
  const provider = createDataProvider(a2());
  const view = provider.select();
  const map = new Map(view.buildings.map((b) => [b.building_id, b]));
  for (const [id, status, age] of [
    ['v2-bld-39', 'under', '39년'], ['v2-bld-40', 'eligible', '40년'],
    ['v2-bld-41', 'eligible', '41년'], ['v2-bld-year-1986', 'uncertain', '39–40년 · 월일 미확인'],
    ['v2-bld-demolished', 'inactive', '56년'], ['v2-bld-unknown', 'unknown', '준공 정보 미확인'],
  ]) { assert.equal(map.get(id).age_status, status); assert.equal(map.get(id).age_label, age); }
  assert.equal(map.get('v2-bld-year-1985').status, 'unknown');
  assert.equal(map.get('v2-bld-year-1985').age_status, 'eligible');
  const shared = summarizeBuildings(provider.snapshot);
  assert.deepEqual(view.buildings.map((b) => [b.building_id, b.domain_age_status, b.min_age, b.max_age]),
    shared.rows.map((b) => [b.building_id, b.age_status, b.min_age, b.max_age]));
  assert.deepEqual(provider.select({query: '노을초'}).buildings.map((b) => b.building_id), ['v2-bld-40', 'v2-bld-second']);
  assert.equal(provider.select({query: '없는학교ZZZ'}).buildings.length, 0);
});

test('A2 evidence warnings and missing firm references stay visible without inventing data', () => {
  const provider = createDataProvider(a2());
  assert.ok(provider.warnings.some((w) => w.code === 'unknown_reference'));
  assert.ok(provider.warnings.some((w) => w.code === 'unknown_topic'));
  assert.ok(provider.warnings.some((w) => w.code === 'missing_evidence_note'));
  const view = provider.select();
  assert.equal(view.summary.unclassifiedProjects, 2);
  assert.equal(view.summary.firms, 3);
  assert.equal(view.summary.unknownFirms, 1);
  assert.equal(view.summary.unresolvedFirmReferences, 1);
  assert.equal(view.summary.projectsWithOnlyUnresolvedFirms, 1);
  assert.ok(view.firms.every((firm) => firm.known_firm === true));
  assert.equal(view.firms.find((f) => f.firm_id === 'v2-firm-missing'), undefined);
  assert.deepEqual(view.unresolvedFirmRefs, [{project_id: 'v2-project-005', firm_id: 'v2-firm-missing'}]);
  assert.equal(view.firms.find((f) => f.firm_id === 'v2-firm-001').project_count, 2);
  assert.deepEqual(provider.select({topic: 'unclassified'}).projects.map((p) => p.project_id), ['v2-project-003', 'v2-project-004']);
  assert.deepEqual(provider.exportRows({topic: 'unclassified'}).rows.map((p) => p.project_id), ['v2-project-003', 'v2-project-004']);
});

test('parser errors are blocked before normalized nulls could become a smaller successful view', () => {
  const input = legacy();
  input.projects[0].award_date = '2026-02-31';
  assert.throws(() => createDataProvider(input), (error) => {
    assert.ok(error.errors.some((e) => e.code === 'invalid_date' && e.path === 'projects[0].award_date'));
    assert.equal(error.diagnostics, error.errors);
    return true;
  });
  assert.throws(() => createDataProvider('{broken'), (e) => e.errors[0].code === 'invalid_json');
  const duplicate = a1();
  duplicate.projects[1].award_date = '2026-03-11';
  assert.throws(() => createDataProvider(duplicate), (e) => e.errors.some((d) => d.code === 'duplicate_conflict'));
});

test('unsupported versions, invalid screen fields and invalid filters are rejected', () => {
  for (const mutate of [
    (s) => { s.schema_version = '2'; },
    (s) => { s.projects[0].images[0].alt_text = {html: 'bad type'}; },
  ]) { const input = legacy(); mutate(input); assert.throws(() => createDataProvider(input)); }
  const provider = createDataProvider(a1());
  for (const filters of [{region: 'XX'}, {schoolLevel: '__proto__'}, {topic: '__proto__'},
    {dateBasis: 'not_a_date'}, {asOf: '2026-02-31'}, {months: 0}, {months: 121}, {query: null}])
    assert.throws(() => provider.select(filters));
});

test('real Snapshot input keeps its actual provenance instead of being relabeled demo', () => {
  const input = a1();
  input.is_demo = false;
  const provider = createDataProvider(input);
  assert.equal(provider.snapshot.is_demo, false);
  assert.equal(provider.select().metadata.is_demo, false);
  assert.equal(provider.exportRows().metadata.demo_label, null);
  assert.ok(provider.exportRows().rows.every((row) => row.is_demo === 'false'));
});

test('empty export retains provenance and separates query date from snapshot freshness', () => {
  const provider = createDataProvider(a2());
  const filters = {query: '없는학교ZZZ', asOf: '2027-10-17'};
  for (const value of [provider.select(filters), provider.exportRows(filters)]) {
    assert.equal(value.metadata.as_of, '2027-10-17');
    assert.equal(value.metadata.snapshot_as_of, '2026-10-17');
    assert.equal(value.metadata.snapshot_generated_at, '2026-10-17T00:00:00+09:00');
    assert.deepEqual(value.metadata.source_ids, []);
    assert.equal(value.metadata.source_context.snapshot_source_count, 6);
    assert.equal(value.metadata.is_demo, true);
  }
  assert.equal(provider.exportRows(filters).rows.length, 0);
  assert.equal(provider.select(filters).empty, true);
});

test('imported text remains data and existing serializers preserve formula/markup protection', () => {
  const input = a2();
  input.projects[0].summary = '<img src=x onerror=alert(1)>';
  input.sources[0].url = 'javascript:alert(1)';
  const provider = createDataProvider(input);
  assert.equal(provider.select().projects[0].summary, '<img src=x onerror=alert(1)>');
  assert.equal(provider.snapshot.sources[0].url, null);
  assert.ok(provider.warnings.some((w) => w.code === 'unsafe_url'));
  const exported = provider.exportRows();
  assert.match(serializeCsv(exported), /'=HYPERLINK/);
  assert.match(serializeMarkdown(exported), /&lt;img/);
  assert.doesNotMatch(serializeMarkdown(exported), /<img/);
});

test('caller and exposed snapshot mutations cannot desynchronize lookup and export data', () => {
  const input = legacy();
  const provider = createDataProvider(input);
  const originalTitle = provider.snapshot.projects[0].title;
  input.projects[0].title = '외부 변경';
  assert.equal(provider.snapshot.projects[0].title, originalTitle);
  assert.throws(() => { provider.snapshot.projects[0].title = '노출 객체 변경'; }, TypeError);
  assert.throws(() => { provider.snapshot.projects[0]._raw.topic_evidence[0].topic_id = 'external'; }, TypeError);
  assert.equal(provider.select().projects[0].title, originalTitle);
  assert.equal(provider.exportRows().rows[0].title, originalTitle);
});

test('unresolved firm IDs and per-project references stay separate from confirmed firms and participations', () => {
  const input = a2();
  input.projects[0].firm_ids.push('v2-firm-missing');
  input.projects[4].firm_ids.push('missing-second');
  const provider = createDataProvider(input);
  const view = provider.select();
  assert.equal(view.summary.firms, 3);
  assert.equal(view.summary.unknownFirms, 2);
  assert.equal(view.summary.unresolvedFirmReferences, 3);
  assert.equal(view.summary.projectsWithOnlyUnresolvedFirms, 1);
  assert.equal(view.firms.reduce((count, firm) => count + firm.project_count, 0), 4);
  const onlyMissing = provider.select({query: '사무소 정보 없는 당선'});
  assert.equal(onlyMissing.summary.projects, 1);
  assert.equal(onlyMissing.summary.firms, 0);
  assert.equal(onlyMissing.firms.length, 0);
  assert.equal(onlyMissing.summary.unknownFirms, 2);
  assert.equal(onlyMissing.summary.unresolvedFirmReferences, 2);
  assert.equal(provider.exportRows({query: '사무소 정보 없는 당선'}).rows.length, 1);
  assert.match(onlyMissing.projects[0].firm_names[0], /미확인/);
});

test('topic source validation receives A1 source metadata and warns even for undated projects', () => {
  const input = a2();
  input.projects[0].topic_evidence[0].source_id = 'nonexistent-evidence-source';
  input.projects[4].award_date = null;
  input.projects[4].topic_evidence[0].source_id = 'undated-missing-source';
  const provider = createDataProvider(input);
  assert.equal(provider.warnings.filter((w) => w.code === 'unknown_evidence_source').length, 2);
  const view = provider.select();
  assert.equal(view.summary.projects, 4);
  const topic = view.topics.find((row) => row.id === 'community_sharing');
  assert.equal(topic.count, 1);
  assert.deepEqual(topic.source_ids, []);
  assert.ok(view.topicSummary.evidenceIssues.some((issue) => issue.code === 'unknown_evidence_source'));
  assert.equal(view.diagnostics.filter((issue) => issue.code === 'unknown_evidence_source').length, 2);
});
