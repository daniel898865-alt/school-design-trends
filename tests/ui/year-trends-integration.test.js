import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDataProvider} from '../../src/ui/data-provider.js';
import {summarizeYearTrends} from '../../src/domain/year-trends.js';
import {serializeCsv} from '../../src/ui/export.js';

const fixture = JSON.parse(readFileSync(new URL('../../public/demo.snapshot.json', import.meta.url), 'utf8'));
const provider = createDataProvider(fixture);
const dated = new Map([
  ['demo-project-006', '2026-09-15'], ['demo-project-007', '2026-06-30'],
  ['demo-project-008', '2026-02-20'], ['demo-project-009', '2025-10-10'],
  ['demo-project-010', '2025-05-30'], ['demo-project-011', '2024-12-20'],
]);
function yearly(view) {
  return summarizeYearTrends(view.projects, provider.snapshot, {
    dateBasis: view.metadata.date_basis, asOf: view.metadata.as_of,
    months: view.metadata.months, excludedUnknownDates: view.summary.excludedUnknownDates,
  });
}

test('exactly six explicit fictional completion dates are supplied and six remain unknown', () => {
  assert.equal(fixture.is_demo, true);
  assert.equal(fixture.projects.length, 12);
  assert.equal(fixture.projects.filter((p) => p.completion_date === null).length, 6);
  for (const project of fixture.projects) {
    assert.equal(project.completion_date, dated.get(project.project_id) ?? null);
    if (project.completion_date) assert.ok(project.award_date < project.completion_date);
  }
  assert.ok(fixture.coverage.limitations.some((note) => note.includes('준공일 6건') && note.includes('가상')));
});

const realInput = JSON.parse(readFileSync(new URL('../../data/goe-annual.snapshot.json', import.meta.url), 'utf8'));

test('real yearbook selection and export retain all166 or the same69 in2024 without fabricated dates', () => {
  const actual = createDataProvider(realInput);
  const all = actual.select();
  assert.equal(actual.defaultDateBasis, 'award_year');
  assert.equal(all.summary.projects, 166);
  assert.deepEqual(all.byYear.map((row) => [row.year, row.count]), [['2023', 42], ['2024', 69], ['2025', 55]]);
  assert.deepEqual(all.byMonth, []);
  assert.equal(all.metadata.months, null);
  assert.equal(all.metadata.window, null);
  assert.equal(all.metadata.is_demo, false);
  assert.equal(all.summary.dataIssueProjects, realInput.projects.filter((p) => p.data_issues.length).length);
  const filters = {year: '2024'};
  const view = actual.select(filters), exported = actual.exportRows(filters);
  assert.equal(view.summary.projects, 69);
  assert.equal(exported.rows.length, 69);
  assert.deepEqual(exported.rows.map((p) => p.project_id), view.projects.map((p) => p.project_id));
  assert.ok(exported.rows.every((row) => row.award_year === 2024 && row.award_date === null && row.basis_date === null && row.is_demo === 'false'));
  assert.equal(exported.metadata.selected_year, '2024');
  assert.equal(exported.metadata.row_count, 69);
  assert.ok(exported.metadata.coverage_limitations.some((note) => note.includes('초안')));
  const csv = serializeCsv(exported);
  for (const project of view.projects) assert.ok(csv.includes(project.project_id));
  assert.ok(!csv.includes(realInput.projects.find((p) => p.award_year === 2023).project_id));
  const datedView = actual.select({dateBasis: 'award_date'});
  assert.equal(datedView.summary.projects, 0);
  assert.equal(datedView.summary.excludedUnknownDates, 166);
  assert.equal(datedView.summary.excludedUnknownYears, undefined);
});

test('real filters and exports agree on year, query, region, school level and missing classification', () => {
  const actual = createDataProvider(realInput);
  for (const filters of [{year: '2024', query: '초'}, {year: '2023', topic: 'outdoor_learning'},
    {year: '2025', schoolLevel: 'high'}, {year: '2024', topic: 'unclassified'}, {region: '11'}, {query: '없는항목ZZZ'}]) {
    const view = actual.select(filters), exported = actual.exportRows(filters);
    assert.deepEqual(exported.rows.map((p) => p.project_id), view.projects.map((p) => p.project_id), JSON.stringify(filters));
    assert.equal(exported.metadata.row_count, view.summary.projects);
  }
  assert.equal(actual.select({year: '2024', topic: 'unclassified'}).summary.projects, 69);
  assert.equal(actual.snapshot.projects.find((p) => p.project_id === 'goe-2024-482').school_level, 'unknown');
  assert.throws(() => actual.select({year: '2099'}));
});

test('yearbook trends mark2024 topic information unavailable and never use it as0% incidence', () => {
  const actual = createDataProvider(realInput);
  const view = actual.select();
  const trends = summarizeYearTrends(view.projects, actual.snapshot, {dateBasis: 'award_year'});
  assert.equal(trends.project_count, 166);
  assert.equal(trends.window, null);
  assert.equal(trends.months, null);
  assert.ok(trends.years.every((row) => row.from === null && row.to === null && row.precision === 'yearbook'));
  const middle = trends.years.find((row) => row.year === '2024');
  assert.equal(middle.project_count, 69);
  assert.equal(middle.unclassified, 69);
  assert.equal(middle.topic_data_status, 'unavailable');
  assert.ok(middle.topics.every((topic) => topic.share === null));
  assert.deepEqual(middle.comparison.topic_changes, []);
  const last = trends.years.find((row) => row.year === '2025');
  assert.equal(last.comparison.topic_status, 'missing_topic_data');
  assert.deepEqual(last.comparison.topic_changes, []);
  assert.ok(last.draft_topic_projects > 0);
  assert.ok(last.topics.some((topic) => topic.review_status_counts.draft_ai > 0));
  const empty = summarizeYearTrends([], actual.snapshot, {dateBasis: 'award_year', year: '2024'});
  assert.deepEqual(empty.years.map((row) => [row.year, row.project_count]), [['2024', 0]]);
  assert.equal(empty.years[0].topic_data_status, 'unavailable');
});

test('completion view, yearly facts and shared export agree on six cases and six missing dates', () => {
  const filters = {dateBasis: 'completion_date'};
  const view = provider.select(filters);
  const trends = yearly(view);
  const exported = provider.exportRows(filters);
  assert.equal(view.summary.projects, 6);
  assert.equal(view.summary.excludedUnknownDates, 6);
  assert.equal(trends.project_count, 6);
  assert.equal(trends.excluded_unknown_dates, 6);
  assert.deepEqual(trends.years.map((year) => [year.year, year.project_count]),
    [['2023', 0], ['2024', 1], ['2025', 2], ['2026', 3]]);
  assert.deepEqual(exported.rows.map((row) => row.project_id), [...dated.keys()]);
  assert.equal(exported.metadata.excluded_unknown_dates, 6);
  assert.equal(exported.metadata.date_basis, 'completion_date');
  assert.equal(exported.metadata.row_count, 6);
  assert.equal(trends.outlook_status, 'awaiting_review');
});

test('default award view remains eleven cases and retains raw completion dates independently', () => {
  const view = provider.select();
  const exported = provider.exportRows();
  assert.equal(view.summary.projects, 11);
  assert.equal(view.summary.excludedUnknownDates, 1);
  assert.equal(exported.rows.length, 11);
  assert.ok(exported.columns.some((column) => column.key === 'completion_date' && column.label === '사업 준공일'));
  const row = exported.rows.find((p) => p.project_id === 'demo-project-006');
  assert.equal(row.basis_date, '2025-07-21');
  assert.equal(row.award_date, '2025-07-21');
  assert.equal(row.competition_date, '2025-07-01');
  assert.equal(row.completion_date, '2026-09-15');
  assert.equal(exported.rows.find((p) => p.project_id === 'demo-project-001').completion_date, null);
  assert.equal(yearly(view).project_count, 11);
});

test('all four date bases preserve global filters across yearly cards and exported rows', () => {
  const bases = ['completion_date', 'award_date', 'competition_date', 'published_at'];
  const filters = [{}, {months: 12}, {region: '11'}, {schoolLevel: 'high'},
    {topic: 'carbon_energy'}, {query: '운동장'}, {query: '매칭없음ZZZ'}, {asOf: '2026-12-31'}];
  for (const dateBasis of bases) for (const filter of filters) {
    const conditions = {...filter, dateBasis};
    const view = provider.select(conditions);
    const exported = provider.exportRows(conditions);
    const trends = yearly(view);
    const label = JSON.stringify(conditions);
    assert.equal(trends.project_count, view.summary.projects, label);
    assert.equal(exported.rows.length, view.summary.projects, label);
    assert.equal(trends.excluded_unknown_dates, view.summary.excludedUnknownDates, label);
    assert.deepEqual(exported.rows.map((row) => row.project_id), view.projects.map((p) => p.project_id), label);
    assert.deepEqual(trends.years.flatMap((year) => year.project_ids).sort(),
      view.projects.map((p) => p.project_id).sort(), label);
    for (const row of exported.rows) {
      assert.equal(row.completion_date, dated.get(row.project_id) ?? null, label);
      assert.equal(row.basis_date, view.projects.find((p) => p.project_id === row.project_id).basis_date, label);
    }
    assert.equal(exported.metadata.as_of, view.metadata.as_of, label);
    assert.equal(exported.metadata.snapshot_as_of, fixture.as_of, label);
  }
  assert.equal(provider.select({dateBasis: 'completion_date', months: 12}).summary.projects, 3);
  assert.equal(provider.select({dateBasis: 'completion_date', region: '11'}).summary.projects, 2);
});
