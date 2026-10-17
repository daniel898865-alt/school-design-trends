import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordsFromCsv } from '../../src/data/csv.js';
import { parseSnapshot } from '../../src/data/parseSnapshot.js';
import { toDateOnly } from '../../src/domain/dates.js';
import { filterProjects, summarizeProjects } from '../../src/domain/projects.js';

const snapshotBase = (overrides = {}) => ({
  schema_version: '0.1', is_demo: true, as_of: '2026-10-17', generated_at: null,
  schools: [], buildings: [], projects: [], sources: [], firms: [],
  coverage: { scope: '가상 회귀검증', source_status: 'not_collected', limitations: [] },
  ...overrides,
});

test('중복 CSV 날짜 머리글은 값을 덮어쓰지 않고 입력 전체를 제외한다', () => {
  const csv = 'project_id,award_date,award_date\np1,2026-03-10,2025-01-01\np2,2026-04-01,2025-02-01\n';
  const result = recordsFromCsv(csv, 'projects');
  assert.deepEqual(result.records, []);
  assert.ok(result.errors.some(error => error.code === 'csv_duplicate_header' && error.message.includes('award_date')));
  const { snapshot } = parseSnapshot(snapshotBase({ projects: result.records }));
  assert.equal(summarizeProjects(filterProjects(snapshot)).uniqueProjects, 0);
});

test('CSV 머리글 앞뒤 공백 제거 후 식별자·목록·추가 열의 중복도 거부한다', () => {
  for (const csv of [
    'project_id, project_id \np1,p2\n',
    'project_id,source_ids, source_ids \np1,s1,s2\n',
    'project_id,custom, custom \np1,a,b\n',
  ]) {
    const result = recordsFromCsv(csv, 'projects');
    assert.deepEqual(result.records, [], csv);
    assert.ok(result.errors.some(error => error.code === 'csv_duplicate_header'), csv);
  }
});

test('고유한 CSV 머리글과 날짜 열은 그대로 읽는다', () => {
  const result = recordsFromCsv('project_id, competition_date ,award_date\np1,2026-02-10,2026-03-10\n', 'projects');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.records, [{ project_id: 'p1', competition_date: '2026-02-10', award_date: '2026-03-10' }]);
});

test('날짜·현지 시각·Z·오프셋·소수 초에서 기재된 날짜를 유지한다', () => {
  const values = [
    '2026-10-17', '2026-10-17T09:00', '2026-10-17T09:00:59',
    '2026-10-17T09:00:00.123456', '2026-10-17T09:00Z',
    '2026-10-17T09:00:00.123Z', '2026-10-17T09:00+09:00',
    '2026-10-17T09:00:00+09:00', '2026-01-01T00:30:00+09:00',
    '2026-12-31T23:30:00-12:00', '2024-02-29T23:59:59-00:00',
  ];
  for (const value of values) assert.equal(toDateOnly(value), value.slice(0, 10), value);
});

test('잘못된 시분초·오프셋 범위와 시각 뒤 쓰레기 문자열은 거부한다', () => {
  const invalid = [
    '2026-10-17T99:99', '2026-10-17T09:00garbage',
    '2026-10-17T24:00', '2026-10-17T09:60', '2026-10-17T09:00:60',
    '2026-10-17T09:00:00.', '2026-10-17T09:00.123',
    '2026-10-17T09:00+24:00', '2026-10-17T09:00-01:60',
    '2026-10-17T09:00+09', '2026-10-17T09:00+0900',
    '2026-10-17T09:00Zgarbage', '2026-10-17T09:00Z+09:00',
    '2026-10-17T9:00', '2026-10-17T09:0',
    '2026-02-30T09:00:00Z', '2026-13-01T09:00:00Z',
    '2026-10-17T09:00:00\n', '2026-10-17T09:00:00 ', '2026-10-17\n',
    null, 20261017,
  ];
  for (const value of invalid) assert.equal(toDateOnly(value), null, String(value));
});

test('Snapshot은 잘못된 게시 시각을 결측으로 진단하고 원래 값을 보존한다', () => {
  const invalid = '2026-03-10T09:00garbage';
  const result = parseSnapshot(snapshotBase({
    generated_at: '2026-10-17T99:99',
    sources: [{
      source_id: 's1', source_type: 'news', title: '가상 기사', publisher: '검증',
      url: null, published_at: invalid, retrieved_at: null,
      rights_note: '가상', verification_status: 'demo',
    }],
  }));
  assert.equal(result.snapshot.generated_at, null);
  assert.equal(result.snapshot.sources[0].published_at, null);
  assert.equal(result.snapshot.sources[0]._raw.published_at, invalid);
  assert.ok(result.errors.some(error => error.code === 'invalid_datetime' && error.path === 'sources[0].published_at'));
  assert.ok(result.warnings.some(warning => warning.code === 'invalid_datetime' && warning.path === 'generated_at'));
});
