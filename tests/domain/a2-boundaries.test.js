import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSnapshot } from '../../src/data/parseSnapshot.js';
import { parseCsv } from '../../src/data/csv.js';
import { exportBuildingRows, exportRows, safeCell, toCsv } from '../../src/data/export.js';
import { classifyBuildingAge, completedYears, summarizeBuildings } from '../../src/domain/buildings.js';
import { filterProjects } from '../../src/domain/projects.js';
import { summarizeTopics } from '../../src/domain/topics.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/a2.virtual.json', import.meta.url), 'utf8'));
const rawFixture = () => structuredClone(fixture);
const building = (overrides = {}) => ({ completion_date: null, completion_year: null, date_precision: 'year', ...overrides });

test('파서가 허용한 작은·음수 준공연도는 연령 판정 중단 대신 unknown으로 남긴다', () => {
  for (const year of [1, 0, -1, 999, 10000]) {
    const input = rawFixture();
    input.buildings[0].completion_date = null;
    input.buildings[0].completion_year = year;
    input.buildings[0].date_precision = 'year';
    const parsed = parseSnapshot(input);
    assert.deepEqual(parsed.errors, []);
    const summary = summarizeBuildings(parsed.snapshot);
    const row = summary.rows.find((item) => item.building_id === input.buildings[0].building_id);
    assert.equal(row.age_status, 'unknown');
    assert.equal(row.min_age, null);
    assert.equal(row.max_age, null);
    assert.equal(row.listed, false);
    assert.equal(exportBuildingRows(parsed.snapshot).rows.length, input.buildings.length);
  }
});

test('잘못된 날짜·연도 타입은 날짜 계산 전에 unknown으로 분리한다', () => {
  for (const completion_date of ['1986-02-30', '1986/10/17', '', { toString: null }]) {
    const result = classifyBuildingAge(building({ completion_date, date_precision: 'day' }), '2026-10-17');
    assert.equal(result.status, 'unknown');
    assert.equal(result.minAge, null);
  }
  for (const completion_year of [1986.5, '1986', { toString: null }, []]) {
    assert.equal(classifyBuildingAge(building({ completion_year }), '2026-10-17').status, 'unknown');
  }
  assert.throws(() => completedYears(null, '2026-10-17'), /유효한 YYYY-MM-DD/);
  assert.equal(classifyBuildingAge(building({ completion_year: 1986 }), '2026-10-17').status, 'uncertain');
});

test('학교 레코드 없는 건물도 표시하되 모든 학교 수에서 제외한다', () => {
  const input = rawFixture();
  input.schools = [];
  const parsed = parseSnapshot(input);
  assert.ok(parsed.warnings.some((warning) => warning.code === 'unknown_reference'));
  const summary = summarizeBuildings(parsed.snapshot);
  assert.equal(summary.total.buildings, input.buildings.length);
  assert.equal(summary.listed.buildings, 4);
  assert.equal(summary.total.schools, 0);
  assert.equal(summary.listed.schools, 0);
  assert.ok(Object.values(summary.byAge).every((count) => count.schools === 0));
  assert.ok(Object.values(summary.byStatusAmongOver).every((count) => count.schools === 0));
  assert.ok(summary.rows.every((row) => row.school_name === null));
  assert.ok(summary.notes.some((note) => note.includes('학교 수에서 제외')));
});

test('검토 상태의 특수 키도 숫자로 세고 잘못된 상태 객체는 unknown으로 보고한다', () => {
  const statuses = ['__proto__', 'constructor', 'toString', '__proto__', { toString: null }, []];
  const input = rawFixture();
  input.projects = [input.projects[0]];
  input.projects[0].topic_evidence = statuses.map((review_status) => ({
    topic_id: 'community_sharing', source_id: 'v2-src-001', evidence_note: '가상 근거', review_status,
  }));
  const parsed = parseSnapshot(JSON.stringify(input));
  assert.deepEqual(parsed.errors, []);
  const summary = summarizeTopics(filterProjects(parsed.snapshot));
  const counts = summary.topics.find((topic) => topic.topic_id === 'community_sharing').review_status_counts;
  assert.equal(Object.getPrototypeOf(counts), Object.prototype);
  assert.equal(Object.hasOwn(counts, '__proto__'), true);
  assert.equal(counts.__proto__, 2);
  assert.equal(counts.constructor, 1);
  assert.equal(counts.toString, 1);
  assert.equal(counts.unknown, 2);
  assert.ok(Object.values(counts).every(Number.isInteger));
  assert.equal(summary.evidenceIssues.filter((issue) => issue.code === 'invalid_review_status').length, 2);
  assert.equal(summary.denominator, 1);
  assert.equal(summary.topics[0].projects, 1);
  assert.equal(summary.topics[0].share, 1);
  assert.deepEqual(summary.byYear[0].topics[0].review_status_counts, counts);
});

test('공백·BOM·줄바꿈 앞 CSV 수식은 본문·머리글·메타데이터에서 모두 무력화한다', () => {
  const values = ['  =1+1', '\uFEFF=1', ' \tformula', '\n=1', ' \r=1', '  @SUM(A1)', ' +1', ' -1'];
  const payload = { columns: [{ key: 'value', label: '  =COLUMN()' }],
    rows: values.map((value) => ({ value })), metadata: { note: '\n=METADATA()' } };
  const { rows, errors } = parseCsv(toCsv(payload, { bom: false }));
  assert.deepEqual(errors, []);
  assert.deepEqual(rows[0], ['note', "'\n=METADATA()"]);
  assert.deepEqual(rows[1], ["'  =COLUMN()"]);
  assert.deepEqual(rows.slice(2).map((row) => row[0]), values.map((value) => `'${value}`));
  assert.equal(safeCell(-3), '-3');
  assert.equal(safeCell('가상 학교'), '가상 학교');
});

test('CSV 보강 후에도 선택한 사업과 메타데이터의 범위가 유지된다', () => {
  const parsed = parseSnapshot(rawFixture());
  const filters = { regions: ['11'], dateBasis: 'award_date', months: 12 };
  const selected = filterProjects(parsed.snapshot, filters);
  const output = exportRows(parsed.snapshot, filters);
  assert.deepEqual(output.rows.map((row) => row.project_id), selected.map((row) => row.project_id));
  assert.equal(output.metadata.row_count, selected.length);
  assert.equal(output.metadata.date_basis, filters.dateBasis);
  assert.equal(output.metadata.data_as_of, fixture.as_of);
  assert.equal(output.metadata.query_as_of, fixture.as_of);
  assert.deepEqual(output.metadata.filters.regions, filters.regions);
  const csv = parseCsv(toCsv(output, { preamble: false, bom: false }));
  assert.deepEqual(csv.errors, []);
  assert.equal(csv.rows.length, selected.length + 1);
});
