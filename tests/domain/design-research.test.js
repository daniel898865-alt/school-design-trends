import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  NUMERIC_TOLERANCE, resultToMarkdown, searchCandidates, summarizeYearTrends, validateDirections, validateResult,
} from '../../src/domain/design-research.js';

// 가상 사업(실제 학교 아님)
const p = (id, over = {}) => ({
  project_id: id, title: `가상${id}`, award_year: 2025, facility_kind: 'school', school_level: 'high', project_type: 'new',
  summary: '가상 요약', concept_title: null, jury_notes: [], design_tags: [], firm_ids: [], data_issues: [],
  metrics: { location: `가상시 ${id}동`, site_area: 10000, gross_floor_area: 12000, floors_above: 5 }, ...over,
});
const input = p('in', { title: '가상입력고', summary: '입력 요약', metrics: { location: '가상시 입력동', site_area: 10000, gross_floor_area: 12000, floors_above: 6 } });
const query = {
  exclude_ids: ['in'], required: { facility_kind: 'school' },
  preferred: { school_level: 'high', project_type: 'new', facility_kind: 'school', site_area: 10000, gross_floor_area: 12000, floors_above: 6 },
  keywords: [{ id: 'open', label: '주민개방', patterns: ['주민', '개방'] }], limit: 10,
};
const status = (c, key) => c.criteria.find((x) => x.key === key)?.status;
const find = (res, id) => res.candidates.find((c) => c.project_id === id);

test('입력 사업 자체와 같은 사업의 중복 자료를 후보에서 제외한다', () => {
  const dup = p('dup', { title: '가상입력고등학교' });                      // 같은 이름
  const sameLoc = p('sameloc', { metrics: { ...input.metrics } });          // 같은 위치·같은 학교급
  const res = searchCandidates([input, dup, sameLoc, p('a')], query);
  assert.deepEqual(res.excluded.map((e) => [e.project_id, e.reason]).sort(), [['dup', 'same_project_duplicate'], ['in', 'input_project'], ['sameloc', 'same_project_duplicate']]);
  assert.deepEqual(res.candidates.map((c) => c.project_id), ['a']);
});

test('같은 위치라도 학교급·이름이 다르면 제외하지 않고 이상 징후로 알린다', () => {
  const odd = p('odd', { title: '다른학교', school_level: 'middle', metrics: { ...input.metrics } });
  const res = searchCandidates([input, odd], query);
  assert.ok(res.candidates.some((c) => c.project_id === 'odd'));
  assert.equal(res.anomalies[0].kind, 'same_location_different_project');
});

test('존재하지 않는 제외 ID는 이상 징후로 알린다', () => {
  const res = searchCandidates([p('a')], { ...query, exclude_ids: ['없는사업'] });
  assert.equal(res.anomalies[0].kind, 'exclude_id_not_found');
  assert.equal(res.candidates.length, 1);
});

test('정보 없음과 명시적 불일치를 구분한다', () => {
  const res = searchCandidates([input,
    p('mid', { school_level: 'middle' }),
    p('unk', { school_level: 'unknown', metrics: { location: null, site_area: null, gross_floor_area: null, floors_above: null } }),
    p('far', { metrics: { location: 'x', site_area: 3000, gross_floor_area: 12000, floors_above: 3 } })], query);
  assert.equal(status(find(res, 'mid'), 'school_level'), 'mismatch');
  assert.equal(status(find(res, 'unk'), 'school_level'), 'no_information');
  assert.equal(status(find(res, 'unk'), 'site_area'), 'no_information');
  assert.equal(find(res, 'unk').counts.mismatch, 0);
  assert.equal(status(find(res, 'far'), 'site_area'), 'numeric_difference'); // 수치가 달라도 불일치가 아니다
  assert.equal(status(find(res, 'far'), 'floors_above'), 'numeric_difference');
  assert.equal(find(res, 'far').counts.mismatch, 0);
});

test('필수 조건이 있어도 정보 없음(미확인) 사업은 걸러 내지 않는다', () => {
  const res = searchCandidates([input, p('kg', { facility_kind: 'kindergarten' }), p('unk', { facility_kind: 'unknown' })], query);
  assert.deepEqual(res.candidates.map((c) => c.project_id), ['unk']);
  assert.equal(res.required_excluded.count, 1);
});

test('태그가 없는 2024년 사례를 불일치로 처리하지 않고 요약·심사평으로 찾는다', () => {
  const y24 = p('y24', { award_year: 2024, design_tags: [], summary: '주민 개방 마당' });
  const res = searchCandidates([input, y24], query);
  const c = find(res, 'y24');
  assert.equal(status(c, 'keyword:open'), 'match');
  assert.equal(c.design_tags_assigned, false);
  assert.equal(c.counts.mismatch, 0);
});

test('키워드 언급이 없거나 글이 없는 것은 불일치가 아니라 정보 없음이다', () => {
  const res = searchCandidates([input, p('nomention', { summary: '채광 계획' }), p('notext', { summary: null })], query);
  assert.equal(status(find(res, 'nomention'), 'keyword:open'), 'no_information');
  assert.equal(find(res, 'nomention').criteria.find((x) => x.key === 'keyword:open').detail, 'text_without_mention');
  assert.equal(find(res, 'notext').criteria.find((x) => x.key === 'keyword:open').detail, 'no_text');
});

test('심사평 분석 제외 사례의 심사평은 키워드 검색에 쓰지 않는다', () => {
  const ex = p('ex', { summary: '채광', jury_notes: [{ note: '주민 개방' }], data_issues: ['심사평 분석 제외: 귀속 미확인'] });
  const res = searchCandidates([input, ex], query);
  assert.equal(status(find(res, 'ex'), 'keyword:open'), 'no_information');
  assert.equal(find(res, 'ex').jury_excluded, true);
});

test('점수·순위 필드를 만들지 않고 태그를 근거로 쓰지 않는다', () => {
  const tagged = p('tagged', { summary: '채광', design_tags: ['community_open'] });
  const res = searchCandidates([input, tagged], query);
  const text = JSON.stringify(res);
  assert.ok(!/"(score|rank|ranking|similarity)"/i.test(text));
  assert.equal(status(find(res, 'tagged'), 'keyword:open'), 'no_information'); // 태그가 있어도 부합이 아니다
  assert.equal(find(res, 'tagged').design_tags_assigned, true);
  assert.equal(NUMERIC_TOLERANCE.ratio, 0.85);
});

test('summarizeYearTrends: 연도별 건수·시설 구분·정보 없음·태그 미부여', () => {
  const projects = [
    p('a', { award_year: 2023, design_tags: ['x'], firm_ids: ['f'] }),
    p('b', { award_year: 2023, facility_kind: 'housing', metrics: null }),
    p('c', { award_year: 2024, project_type: 'redesign', metrics: { site_area: null, gross_floor_area: 5000, floors_above: 4 } }),
    p('d', { award_year: '2025', school_level: 'unknown' }),
    p('e', { award_year: 2030 }),
    p('f', { award_year: null }),
  ];
  const t = summarizeYearTrends(projects);
  const y = (year) => t.years.find((x) => x.year === year);
  assert.deepEqual(t.years.map((x) => x.total), [2, 1, 1]);
  assert.equal(t.unknown_year, 2);
  assert.equal(y(2023).school_n, 1); assert.equal(y(2023).other_n, 1);
  assert.equal(y(2023).facility.housing, 1);
  assert.equal(y(2023).metrics.site_area.n, 1); // 청사·사택은 규모 집계에서 제외
  assert.equal(y(2024).metrics.site_area.missing, 1); assert.equal(y(2024).metrics.site_area.median, null);
  assert.equal(y(2024).by_type.redesign, 1);
  assert.equal(y(2025).by_level.unknown, 1);
  assert.equal(y(2024).info.design_tags.coverage, 'none');          // 0건이 아니라 미부여
  assert.equal(y(2023).info.design_tags.coverage, 'partial');
  assert.ok(t.notes.some((n) => n.includes('실제 당선일')));
});

// ── 결과 JSON 검증 ──
const REAL_DEMO = new URL('../../public/design-research/demo-result.json', import.meta.url);
const demo = () => JSON.parse(readFileSync(REAL_DEMO, 'utf8'));

test('시연 result.json은 필수 항목 검증을 통과하고 Markdown으로 변환된다', () => {
  const result = demo();
  const check = validateResult(result);
  assert.deepEqual(check.errors, []);
  assert.equal(result.status.review, 'ai_draft_human_review_pending');
  assert.ok(!result.candidates.some((c) => c.project_id === result.input.excluded_project_id)); // 입력 사업은 후보에 없음
  const md = resultToMarkdown(result);
  for (const need of ['사람 검수 전', '수록', '공통 비교표', '조건부 설계 제안', '확인하지 못한 사항', '정보 없음']) assert.ok(md.includes(need), need);
  assert.ok(!md.includes('data/private'));
});

test('결과 JSON 검증: 필수 항목 누락과 잘못된 값을 거부한다', () => {
  const bad = (mutate) => { const r = demo(); mutate(r); return validateResult(r); };
  assert.equal(validateResult(null).ok, false);
  assert.equal(validateResult({}).ok, false);
  assert.equal(bad((r) => { delete r.unconfirmed; }).ok, false);
  assert.equal(bad((r) => { delete r.exclusions; }).ok, false);
  assert.equal(bad((r) => { r.version = '9.9'; }).ok, false);
  assert.equal(bad((r) => { r.status.review = 'human_verified'; }).ok, false);                  // 사람 검수 완료로 표시 금지
  assert.equal(bad((r) => { r.status.notices = ['안내']; }).ok, false);                          // 검수 전 문구 필수
  assert.equal(bad((r) => { r.status.year_basis_notice = '2025년'; }).ok, false);                // 수록 기준 명시 필수
  assert.equal(bad((r) => { r.run.steps[0].basis = 'copied'; }).ok, false);                      // 새 판독/재사용 구분 필수
  assert.equal(bad((r) => { r.input.page_count = 9; }).ok, false);                               // 쪽 수와 구성표 행 수 불일치
  assert.equal(bad((r) => { r.selected.push('없는후보'); }).ok, false);
  assert.equal(bad((r) => { r.candidates.push({ project_id: r.input.excluded_project_id, reason: 'x', info_missing: [] }); }).ok, false); // 입력 사업이 후보에 포함
  assert.equal(bad((r) => { r.comparison.rows[0].values['goe-2023-162'].status = 'similar'; }).ok, false);
  assert.equal(bad((r) => { r.comparison.rows[0].values['goe-2023-162'] = { status: 'mismatch', note: '다름' }; }).ok, false); // 근거 없는 불일치
  assert.equal(bad((r) => { delete r.comparison.rows[0].values['goe-2024-116']; }).ok, false);
  assert.equal(bad((r) => { r.merits_burdens[0].burden = ''; }).ok, false);                      // 장점만 쓰기 금지
  assert.equal(bad((r) => { r.proposals[0].conditions = ''; }).ok, false);
  assert.equal(bad((r) => { r.evidence[0].basis = 'unknown'; }).ok, false);
});

test('결과 JSON 검증: 점수·순위 필드와 내부 경로를 거부한다', () => {
  const r1 = demo(); r1.candidates[0].score = 0.9;
  assert.ok(validateResult(r1).errors.some((e) => e.message.includes('점수')));
  const r2 = demo(); r2.rank = 1;
  assert.equal(validateResult(r2).ok, false);
  const r3 = demo(); r3.input.label = 'C:\\Users\\누군가\\input.pdf';
  assert.ok(validateResult(r3).errors.some((e) => e.message.includes('경로')));
  const r4 = demo(); r4.run.steps[2].note = 'data/private/design-research/x';
  assert.equal(validateResult(r4).ok, false);
});

test('명시적 불일치는 출처가 있으면 허용한다', () => {
  const r = demo(); r.comparison.rows[0].values['goe-2023-162'] = { status: 'mismatch', note: '반대 내용 기재', source: '2023 p.162' };
  assert.equal(validateResult(r).ok, true);
});

test('향후 설계 방향 자료: 관찰·해석·적용 조건·반대 근거가 모두 있고 예측 완료 표현이 없다', () => {
  const REAL = new URL('../../public/design-research/directions.json', import.meta.url);
  const d = JSON.parse(readFileSync(REAL, 'utf8'));
  assert.deepEqual(validateDirections(d).errors, []);
  const bad = (mutate) => { const x = JSON.parse(JSON.stringify(d)); mutate(x); return validateDirections(x); };
  assert.equal(bad((x) => { x.directions[0].counter_or_unconfirmed = ''; }).ok, false);
  assert.equal(bad((x) => { x.directions[0].case_ids = ['없는사례']; }).ok, false);
  assert.equal(bad((x) => { x.directions[0].interpretation = '미래 동향을 예측 완료했다'; }).ok, false);
  assert.equal(bad((x) => { x.review = 'human_verified'; }).ok, false);
  assert.ok(d.directions.every((x) => x.evidence_cases === x.case_ids.length));
});

test('실제 자료: 연도별 42·69·55건, 2024년 태그·사무소 미부여, 학교 외 시설 분리', { skip: !existsSync(new URL('../../data/goe-annual.snapshot.json', import.meta.url)) && '데이터 파일 없음' }, () => {
  const snapshot = JSON.parse(readFileSync(new URL('../../data/goe-annual.snapshot.json', import.meta.url), 'utf8'));
  const t = summarizeYearTrends(snapshot.projects);
  assert.deepEqual(t.years.map((y) => y.total), [42, 69, 55]);
  assert.equal(t.counted, 166); assert.equal(t.unknown_year, 0);
  assert.equal(t.years[1].info.design_tags.coverage, 'none');
  assert.equal(t.years[1].info.firm_links.coverage, 'none');
  for (const y of t.years) { assert.equal(y.school_n + y.other_n, y.total); assert.equal(y.metrics.site_area.n + y.metrics.site_area.missing, y.school_n); }
  // 검색 도구: 입력 사업(동탄12고)을 후보에서 제외
  const res = searchCandidates(snapshot.projects, { exclude_ids: ['goe-2025-068'], preferred: { school_level: 'high', project_type: 'new', facility_kind: 'school' }, limit: 200 });
  assert.ok(!res.candidates.some((c) => c.project_id === 'goe-2025-068'));
  assert.ok(res.candidates.some((c) => c.award_year === 2024 && !c.design_tags_assigned && c.counts.mismatch === 0));
  assert.ok(res.anomalies.some((a) => a.project_id === 'goe-2025-124'));
});
