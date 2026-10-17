import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSnapshot } from '../../src/data/parseSnapshot.js';
import { filterProjects, summarizeProjects } from '../../src/domain/projects.js';

const fixture = readFileSync(new URL('./fixtures/a1.virtual.json', import.meta.url), 'utf8');
const { snapshot, errors, warnings } = parseSnapshot(fixture);

const region = (summary, code) => summary.byRegion.find((r) => r.region_code === code);
const level = (summary, value) => summary.bySchoolLevel.find((r) => r.school_level === value);

test('가상 고정 자료는 오류 없이 읽힌다', () => {
  assert.deepEqual(errors, []);
  assert.equal(snapshot.projects.length, 9);
  assert.ok(warnings.some((w) => w.code === 'merged_duplicate_project' && w.id === 'v-project-001'));
});

test('같은 사업의 기사 2건은 사업 1건·기사 2건', () => {
  const p = snapshot.projects.find((x) => x.project_id === 'v-project-001');
  assert.deepEqual(p.source_ids, ['v-src-mag-001', 'v-src-news-001']);
  assert.equal(p.competition_date, '2026-01-05');
  const s = summarizeProjects(filterProjects(snapshot, { regions: ['11'], schoolLevels: ['elementary'] }));
  assert.equal(s.uniqueProjects, 2); // 증축 1건 + 같은 학교 별도 체육관 사업 1건
  assert.equal(s.uniqueArticles, 3);
  assert.equal(s.uniqueSchools, 1);
});

test('당선일 기준 최근 36개월: (2023-10-17, 2026-10-17]', () => {
  const projects = filterProjects(snapshot, { dateBasis: 'award_date' });
  const ids = projects.map((p) => p.project_id).sort();
  assert.deepEqual(ids, ['v-project-001', 'v-project-002', 'v-project-003', 'v-project-004', 'v-project-007', 'v-project-008', 'v-project-009']);
  assert.equal(projects.meta.window.start, '2023-10-17');
  assert.equal(projects.meta.excluded_unknown_dates, 1); // v-project-005
  assert.deepEqual(projects.meta.excluded_unknown_date_ids, ['v-project-005']);
  assert.equal(projects.meta.excluded_out_of_range, 1); // v-project-006: 시작일 당일은 제외
  assert.equal(projects.meta.query_as_of, '2026-10-17');
  assert.equal(projects.meta.data_as_of, '2026-10-17');
});

test('시도·학교급 집계: 통합학교와 지역 미확인은 별도 범주', () => {
  const s = summarizeProjects(filterProjects(snapshot));
  assert.equal(s.uniqueProjects, 7);
  assert.equal(s.uniqueArticles, 8);
  assert.equal(region(s, '11').projects, 2);
  assert.equal(region(s, '11').articles, 3);
  assert.equal(region(s, '26').projects, 1); // 이름 "부산"만 있던 학교의 사업
  assert.equal(region(s, '41').projects, 2);
  assert.equal(region(s, '28').projects, 1); // 두 시도에 걸친 사업
  assert.equal(region(s, '51').projects, 1); // 이전 코드 42 → 51
  assert.equal(region(s, 'unknown').projects, 1);
  assert.equal(s.regionParticipations, 8);
  assert.equal(s.multiRegionProjects, 1);
  assert.ok(s.notes.some((n) => n.includes('시도별 합계')));
  assert.equal(level(s, 'elementary').projects, 3);
  assert.equal(level(s, 'middle').projects, 1);
  assert.equal(level(s, 'high').projects, 2);
  assert.equal(level(s, 'combined').projects, 1);
  assert.equal(s.excludedUnknownDates, 1);
});

test('월별 집계는 빈 달을 0으로 남기고 걸친 달을 partial로 표시', () => {
  const s = summarizeProjects(filterProjects(snapshot));
  assert.equal(s.byMonth.length, 37); // 2023-10(18일~) ... 2026-10(~17일)
  assert.deepEqual(s.byMonth[0], { month: '2023-10', from: '2023-10-18', to: '2023-10-31', partial: true, projects: 1, articles: 1 });
  assert.equal(s.byMonth.at(-1).partial, true);
  assert.equal(s.byMonth.at(-1).projects, 1);
  const march = s.byMonth.find((m) => m.month === '2026-03');
  assert.deepEqual([march.projects, march.articles], [1, 2]);
  assert.equal(s.byMonth.find((m) => m.month === '2024-06').projects, 0);
  assert.equal(s.byMonth.reduce((n, m) => n + m.projects, 0), 7);
});

test('기사 게시일 기준은 당선일을 대신 쓰지 않는다', () => {
  const projects = filterProjects(snapshot, { dateBasis: 'published_at' });
  const ids = projects.map((p) => p.project_id).sort();
  assert.ok(ids.includes('v-project-005')); // 당선일은 없지만 기사 게시일 있음
  assert.ok(!ids.includes('v-project-008')); // 당선일은 있지만 기사 게시일 없음
  assert.equal(projects.meta.excluded_unknown_dates, 1);
  assert.equal(projects.meta.excluded_out_of_range, 1);
  const s = summarizeProjects(projects);
  assert.equal(s.uniqueArticles, 8);
  const may = s.byMonth.find((m) => m.month === '2026-05'); // 날짜·시각 형식 게시일
  assert.deepEqual([may.projects, may.articles], [1, 1]);
});

test('지역 미확인과 미분류 주제 필터', () => {
  assert.deepEqual(filterProjects(snapshot, { regions: ['unknown'] }).map((p) => p.project_id), ['v-project-004']);
  assert.equal(filterProjects(snapshot, { topics: ['unclassified'] }).length, 7);
  assert.equal(filterProjects(snapshot, { topics: ['community'] }).length, 0);
});

test('개월 수를 바꾸면 기간도 바뀐다', () => {
  const projects = filterProjects(snapshot, { months: 12 });
  assert.equal(projects.meta.window.start, '2025-10-17');
  assert.deepEqual(projects.map((p) => p.project_id).sort(), ['v-project-001', 'v-project-004', 'v-project-008', 'v-project-009']);
});

test('잘못된 조회 조건은 오류', () => {
  assert.throws(() => filterProjects(snapshot, { dateBasis: 'completion_date' }));
  assert.throws(() => filterProjects(snapshot, { asOf: '2026-02-30' }));
});

test('예시 Snapshot(data/examples)도 읽고 집계된다', () => {
  const demo = parseSnapshot(readFileSync(new URL('../../data/examples/snapshot.demo.json', import.meta.url), 'utf8'));
  assert.deepEqual(demo.errors, []);
  const s = summarizeProjects(filterProjects(demo.snapshot));
  assert.equal(s.is_demo, true);
  assert.equal(s.uniqueProjects, 1);
  assert.equal(region(s, '11').projects, 1);
  assert.ok(s.notes[0].includes('가상'));
});
