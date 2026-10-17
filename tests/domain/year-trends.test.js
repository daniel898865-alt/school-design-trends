import test from 'node:test';
import assert from 'node:assert/strict';
import {filterProjects, DATE_BASES} from '../../src/domain/projects.js';
import {summarizeYearTrends} from '../../src/domain/year-trends.js';

// Small fixed, entirely synthetic records keep expected yearly counts inspectable.
function fixture() {
  const rows = [
    ['before-window', '2023-10-17', []],
    ['start-window', '2023-10-18', ['community_sharing']],
    ['2024-start', '2024-01-01', ['community_sharing', 'outdoor_learning']],
    ['2024-end', '2024-12-31', ['community_sharing']],
    ['2025-first', '2025-02-01', ['outdoor_learning']],
    ['2025-unclassified', '2025-07-01', []],
    ['2026-boundary', '2026-10-17', ['outdoor_learning']],
    ['future', '2026-10-18', []],
    ['missing', null, ['community_sharing']],
  ];
  const source = (id, published_at = '2026-04-01') => ({source_id: id,
    title: `가상 ${id}`, source_type: 'competition', url: null, published_at});
  return {
    schema_version: '0.1', is_demo: true, as_of: '2026-10-17',
    generated_at: '2026-10-17T00:00:00+09:00',
    coverage: {scope: '연도 검증용 가상 사례', source_status: 'demo', limitations: []},
    schools: [{school_id: 'school', name: '가상 학교', region_code: '11', school_level: 'elementary'}],
    buildings: [{school_id: 'school', completion_date: '1980-01-01'}],
    firms: [], sources: [source('s1'), source('s2', '2025-01-05')],
    projects: rows.map(([project_id, completion_date, topics]) => ({
      project_id, title: `가상 ${project_id}`, school_ids: ['school'], region_code: '11', school_level: 'elementary',
      firm_ids: [], source_ids: ['s1'], summary: '검증을 위한 가상 자료', images: [],
      completion_date, award_date: '2025-03-01', competition_date: '2024-11-01',
      topic_evidence: topics.map((topic_id) => ({topic_id, source_id: 's1', evidence_note: '가상 근거', review_status: 'demo'})),
    })),
  };
}

function selected(snapshot = fixture(), dateBasis = 'completion_date') {
  const projects = filterProjects(snapshot, {dateBasis});
  return {projects, result: summarizeYearTrends(projects, snapshot)};
}

test('completion dates are accepted without borrowing award dates or building completion dates', () => {
  assert.ok(DATE_BASES.includes('completion_date'));
  const {projects, result} = selected();
  assert.equal(projects.length, 6);
  assert.equal(result.project_count, 6);
  assert.equal(result.excluded_unknown_dates, 1);
  assert.ok(!projects.some((p) => p.project_id === 'missing'));
  assert.ok(!projects.some((p) => p.project_id === 'before-window'));
  assert.ok(!projects.some((p) => p.project_id === 'future'));
  assert.equal(result.date_basis, 'completion_date');
  assert.equal(result.date_basis_label, '사업 준공일');
});

test('calendar-year boundaries and partial periods have exact explicit intervals', () => {
  const {result} = selected();
  assert.deepEqual(result.years.map((y) => [y.year, y.project_count]), [['2023', 1], ['2024', 2], ['2025', 2], ['2026', 1]]);
  assert.deepEqual(result.years.map((y) => [y.from, y.to, y.partial]), [
    ['2023-10-18', '2023-12-31', true], ['2024-01-01', '2024-12-31', false],
    ['2025-01-01', '2025-12-31', false], ['2026-01-01', '2026-10-17', true],
  ]);
  assert.equal(result.years.reduce((sum, year) => sum + year.project_count, 0), 6);
});

test('keywords use unique projects, the yearly denominator and separate unclassified/multiple tags', () => {
  const snapshot = fixture();
  snapshot.projects.find((p) => p.project_id === '2024-start').topic_evidence.push({
    topic_id: 'community_sharing', source_id: 's2', evidence_note: '같은 사업 다른 근거', review_status: 'draft',
  });
  const {result} = selected(snapshot);
  const y2024 = result.years.find((y) => y.year === '2024');
  assert.equal(y2024.project_count, 2);
  assert.equal(y2024.multiTagProjects, 1);
  assert.equal(y2024.unclassified, 0);
  assert.equal(y2024.topics.find((t) => t.topic_id === 'community_sharing').projects, 2);
  assert.equal(y2024.topics.find((t) => t.topic_id === 'community_sharing').share, 1);
  assert.equal(y2024.topics.find((t) => t.topic_id === 'outdoor_learning').share, 0.5);
  assert.equal(result.years.find((y) => y.year === '2025').unclassified, 1);
});

test('duplicate project IDs cannot inflate year totals or representatives', () => {
  const snapshot = fixture();
  const projects = filterProjects(snapshot, {dateBasis: 'completion_date'});
  projects.push(structuredClone(projects.find((p) => p.project_id === '2024-start')));
  const result = summarizeYearTrends(projects, snapshot);
  assert.equal(result.project_count, 6);
  assert.deepEqual(result.duplicate_ids, ['2024-start']);
  assert.equal(result.years.find((y) => y.year === '2024').project_count, 2);
  assert.deepEqual(result.years.find((y) => y.year === '2024').representative_ids, ['2024-end', '2024-start']);
});

test('comparison uses the immediately previous complete year and refuses partial annual comparisons', () => {
  const {result} = selected();
  const y2025 = result.years.find((y) => y.year === '2025');
  assert.equal(y2025.comparison.status, 'available');
  assert.equal(y2025.comparison.previous_year, '2024');
  assert.equal(y2025.comparison.project_delta, 0);
  assert.equal(y2025.comparison.topic_changes.find((t) => t.topic_id === 'community_sharing').percentage_point_change, -100);
  assert.equal(y2025.comparison.topic_changes.find((t) => t.topic_id === 'outdoor_learning').percentage_point_change, 0);
  assert.equal(y2025.comparison.small_sample, true);
  assert.equal(result.years.find((y) => y.year === '2024').comparison.status, 'partial_period');
  assert.equal(result.years.find((y) => y.year === '2026').comparison.status, 'partial_period');
  assert.equal(result.years.find((y) => y.year === '2026').comparison.project_delta, null);
});

test('a missing middle year stays zero and is never replaced by a more distant comparison year', () => {
  const snapshot = fixture();
  snapshot.projects = snapshot.projects.filter((p) => !p.project_id.startsWith('2025'));
  const {result} = selected(snapshot);
  assert.equal(result.years.find((y) => y.year === '2025').project_count, 0);
  assert.equal(result.years.find((y) => y.year === '2026').comparison.status, 'no_previous_data');
  assert.deepEqual(result.years.find((y) => y.year === '2026').comparison.topic_changes, []);
});

test('all completion dates missing produces an honest empty state and pending outlook', () => {
  const snapshot = fixture();
  snapshot.projects.forEach((p) => { p.completion_date = null; });
  const {result} = selected(snapshot);
  assert.equal(result.project_count, 0);
  assert.equal(result.excluded_unknown_dates, 9);
  assert.equal(result.outlook_status, 'awaiting_review');
  assert.ok(result.years.every((year) => year.project_count === 0 && year.outlook.hypotheses.length === 0));
  assert.equal(result.years.length, 4);
});

test('a view array with removed meta restores source checks and retains query/snapshot provenance', () => {
  const snapshot = fixture();
  snapshot.projects.find((p) => p.project_id === '2024-start').topic_evidence[0].source_id = 'missing-source';
  const projects = filterProjects(snapshot, {dateBasis: 'completion_date', asOf: '2027-10-17'});
  const detached = [...projects];
  const result = summarizeYearTrends(detached, snapshot, {
    dateBasis: 'completion_date', asOf: '2027-10-17', months: 36, excludedUnknownDates: 1,
  });
  assert.equal(result.query_as_of, '2027-10-17');
  assert.equal(result.data_as_of, '2026-10-17');
  // 2024-start is outside this new window; test an included missing source too.
  snapshot.projects.find((p) => p.project_id === '2025-first').topic_evidence[0].source_id = 'missing-source';
  const next = summarizeYearTrends([...filterProjects(snapshot, {dateBasis: 'completion_date'})], snapshot,
    {dateBasis: 'completion_date', asOf: snapshot.as_of, months: 36, excludedUnknownDates: 1});
  const y2025 = next.years.find((y) => y.year === '2025');
  assert.ok(y2025.evidence_issues.some((issue) => issue.code === 'unknown_evidence_source'));
  assert.deepEqual(y2025.topics.find((topic) => topic.topic_id === 'outdoor_learning').source_ids, []);
});

test('wrong basis dates are rejected instead of relabeling awards as completion', () => {
  const snapshot = fixture();
  const awardProjects = filterProjects(snapshot, {dateBasis: 'award_date'});
  const result = summarizeYearTrends(awardProjects, snapshot, {dateBasis: 'completion_date'});
  assert.equal(result.project_count, 0);
  assert.equal(result.mismatched_basis_ids.length, 9);
  const missing = [{...awardProjects[0], basis_date: null}];
  const another = summarizeYearTrends(missing, snapshot, {dateBasis: 'completion_date'});
  assert.equal(another.excluded_unknown_dates, 1);
  assert.deepEqual(another.missing_basis_ids, ['before-window']);
});

test('published-at attribution uses the first in-window article and is explicitly described', () => {
  const snapshot = fixture();
  snapshot.projects = [snapshot.projects[2]];
  snapshot.projects[0].source_ids = ['s1', 's2'];
  const {projects, result} = selected(snapshot, 'published_at');
  assert.equal(projects[0].basis_date, '2025-01-05');
  assert.equal(result.years.find((year) => year.year === '2025').project_count, 1);
  assert.equal(result.years.find((year) => year.year === '2026').project_count, 0);
  assert.equal(result.project_count, 1);
  assert.ok(result.notes.some((note) => note.includes('최초 연결 기사')));
});

test('outlook contains questions, actual linked evidence and unreviewed fields, never a fabricated forecast', () => {
  const {result} = selected();
  const year = result.years.find((y) => y.year === '2024');
  assert.equal(year.outlook.status, 'awaiting_review');
  assert.equal(year.outlook.is_demo, true);
  assert.ok(year.outlook.hypotheses.length > 0);
  for (const hypothesis of year.outlook.hypotheses) {
    assert.equal(hypothesis.reviewer, null);
    assert.equal(hypothesis.reviewed_at, null);
    assert.ok(hypothesis.evidence_project_ids.every((id) => year.project_ids.includes(id)));
    assert.match(hypothesis.question, /검토한다/);
    assert.ok(hypothesis.required_evidence && hypothesis.assumption && hypothesis.alternative);
  }
});
