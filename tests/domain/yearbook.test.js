import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseSnapshot } from '../../src/data/parseSnapshot.js';
import { filterProjects, summarizeProjects } from '../../src/domain/projects.js';
import { filterProjectsByYearbookYear, summarizeByYearbookYear, yearbookYear } from '../../src/domain/yearbook.js';

const project = (id, over = {}) => ({
  project_id: id, title: `가상 ${id}`, school_ids: [], region_code: '41', school_level: 'high', project_type: 'new',
  competition_date: null, award_date: null, completion_date: null, firm_ids: [], source_ids: ['s1'], summary: null,
  topic_evidence: [], images: [], ...over,
});
const { snapshot } = parseSnapshot({
  schema_version: '0.1', is_demo: true, as_of: '2026-10-17', generated_at: null,
  schools: [], buildings: [], firms: [],
  sources: [{ source_id: 's1', source_type: 'competition', title: '가상 작품집', publisher: '가상', url: null, published_at: null, retrieved_at: null, rights_note: null, verification_status: 'demo' }],
  projects: [
    project('a', { award_year: 2023 }),
    project('b', { award_year: 2023, school_level: 'elementary', project_type: 'extension' }),
    project('c', { award_year: 2024, region_code: '11' }),
    project('d', { award_year: '2025' }),
    project('e', { award_year: null }),
    project('f', { award_year: 'abc' }),
    project('g', { award_year: 2025.5 }),
    project('h'),
  ],
  coverage: { scope: '테스트', source_status: 'demo', limitations: [] },
});

test('수록연도는 정수(또는 네 자리 숫자 문자열)만 인정한다', () => {
  assert.equal(yearbookYear({ award_year: 2023 }), 2023);
  assert.equal(yearbookYear({ award_year: ' 2025 ' }), 2025);
  for (const v of [null, undefined, 'abc', 2025.5, 999, 10000, '25', {}]) assert.equal(yearbookYear({ award_year: v }), null, String(v));
});

test('연도별 조회: 연도 없는 자료는 어느 연도에도 넣지 않고 따로 보고', () => {
  const all = filterProjectsByYearbookYear(snapshot);
  assert.deepEqual(all.map((p) => p.project_id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(all.meta.excluded_unknown_year_ids, ['e', 'f', 'g', 'h']);
  const s = summarizeByYearbookYear(all);
  assert.deepEqual(s.byYear.map((y) => [y.year, y.projects]), [[2023, 2], [2024, 1], [2025, 1]]);
  assert.equal(s.unknownYear.projects, 4);
  assert.equal(s.total, 8);
  assert.equal(s.withYear, 4);
  assert.deepEqual(s.byYear[0].byType, { new: 1, extension: 1 });
  assert.ok(s.notes.some((n) => n.includes('실제 당선일·준공일이 아님')));
  assert.ok(s.notes.some((n) => n.includes('미확인 4건')));
});

test('특정 연도와 다른 필터를 함께 쓴다', () => {
  const y23 = filterProjectsByYearbookYear(snapshot, { years: [2023] });
  assert.deepEqual(y23.map((p) => p.project_id), ['a', 'b']);
  assert.equal(y23.meta.excluded_out_of_range, 2);
  assert.equal(filterProjectsByYearbookYear(snapshot, { years: [2023], schoolLevels: ['high'] }).length, 1);
  assert.deepEqual(filterProjectsByYearbookYear(snapshot, { regions: ['11'] }).map((p) => p.project_id), ['c']);
  const empty = summarizeByYearbookYear(filterProjectsByYearbookYear(snapshot, { years: [2022] }));
  assert.deepEqual(empty.byYear, [{ year: 2022, projects: 0, articles: 0, byType: {}, bySchoolLevel: {} }]); // 빈 연도도 0으로 표시
  assert.throws(() => filterProjectsByYearbookYear(snapshot, { years: '2023' }));
});

test('수록연도는 날짜로 바꾸지 않고 기존 날짜 조회는 그대로', () => {
  const all = filterProjectsByYearbookYear(snapshot);
  assert.ok(all.every((p) => p.award_date === null && p.completion_date === null && p.basis_date === undefined));
  const byDate = filterProjects(snapshot, { dateBasis: 'award_date' });
  assert.equal(byDate.length, 0);
  assert.equal(byDate.meta.excluded_unknown_dates, 8);
  const s = summarizeProjects(all); // 기존 요약 함수와 함께 쓸 수 있음
  assert.equal(s.uniqueProjects, 4);
  assert.deepEqual(s.byMonth, []);
  assert.equal(s.date_basis, 'yearbook_year');
});

const REAL = new URL('../../data/goe-annual.snapshot.json', import.meta.url);
test('작품집 당선작 166건: 2023 42 · 2024 69 · 2025 55', { skip: !existsSync(REAL) && '데이터 파일 없음' }, () => {
  const { snapshot: real, errors } = parseSnapshot(readFileSync(REAL, 'utf8'));
  assert.deepEqual(errors, []);
  const s = summarizeByYearbookYear(filterProjectsByYearbookYear(real));
  assert.deepEqual(s.byYear.map((y) => [y.year, y.projects]), [[2023, 42], [2024, 69], [2025, 55]]);
  assert.equal(s.unknownYear.projects, 0);
  assert.equal(s.total, 166);
  assert.equal(real.projects.filter((p) => p.award_date !== null).length, 0); // 당선일을 채우지 않음
});
