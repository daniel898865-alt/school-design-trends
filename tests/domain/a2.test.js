import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSnapshot } from '../../src/data/parseSnapshot.js';
import { filterProjects } from '../../src/domain/projects.js';
import { checkBrnFormat, findSimilarFirms, summarizeFirms } from '../../src/domain/firms.js';
import { classifyBuildingAge, completedYears, summarizeBuildings } from '../../src/domain/buildings.js';
import { summarizeTopics } from '../../src/domain/topics.js';
import { exportBuildingRows, exportRows, safeCell, toCsv } from '../../src/data/export.js';

const { snapshot, errors, warnings } = parseSnapshot(readFileSync(new URL('./fixtures/a2.virtual.json', import.meta.url), 'utf8'));
const bld = (over) => ({ completion_date: null, completion_year: null, date_precision: 'unknown', status: 'in_use', ...over });

test('A2 가상 고정 자료는 오류 없이 읽힌다', () => {
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.code === 'unknown_reference' && w.message.includes('v2-firm-missing')));
});

// ---- 사무소
test('공동 당선은 사무소마다 참여 1건, 합계는 고유 사업 수와 구분', () => {
  const s = summarizeFirms(filterProjects(snapshot), snapshot);
  const f = (id) => s.firms.find((x) => x.firm_id === id);
  assert.equal(s.uniqueProjects, 5);
  assert.equal(s.participationTotal, 4); // firms에 없는 v2-firm-missing 참조는 제외
  assert.equal(s.jointProjects, 1);
  assert.equal(s.projectsWithoutFirm, 1);
  assert.equal(s.projectsWithOnlyUnresolvedFirms, 1);
  assert.equal(s.projectsWithFirm, 3);
  assert.deepEqual([f('v2-firm-001').participations, f('v2-firm-001').solo_awards, f('v2-firm-001').joint_awards], [2, 1, 1]);
  assert.equal(f('v2-firm-002').joint_awards, 1);
  assert.ok(s.notes.some((n) => n.includes('참여 당선 건수')));
});

test('firms에 없는 사무소는 참여 건수로 세지 않고 참조를 따로 보고한다', () => {
  const projects = filterProjects(snapshot);
  const s = summarizeFirms(projects, snapshot);
  assert.equal(s.firms.find((x) => x.firm_id === 'v2-firm-missing'), undefined);
  assert.deepEqual(s.unresolvedFirmRefs, [{ project_id: 'v2-project-005', firm_id: 'v2-firm-missing' }]);
  assert.ok(s.notes.some((n) => n.includes('참여 건수에서 제외')));
  // 원래 참조는 사업에 그대로 남는다
  assert.deepEqual(projects.find((p) => p.project_id === 'v2-project-005').firm_ids, ['v2-firm-missing']);
  const f1 = s.firms.find((x) => x.firm_id === 'v2-firm-001');
  assert.equal(f1.business_registration_number, null); // 이름만으로 번호를 추정하지 않음
});

test('비슷한 이름의 사무소는 합치지 않고 확인 대상으로만 표시', () => {
  assert.deepEqual(findSimilarFirms(snapshot.firms), [{ firm_ids: ['v2-firm-001', 'v2-firm-003'], matched_name: '가상건축' }]);
  const s = summarizeFirms(filterProjects(snapshot), snapshot);
  assert.ok(s.firms.find((x) => x.firm_id === 'v2-firm-001'));
  assert.ok(s.firms.find((x) => x.firm_id === 'v2-firm-003'));
  assert.equal(s.similarFirms.length, 1);
});

test('사업자등록번호 형식 검사는 실재 확인이 아님', () => {
  assert.equal(checkBrnFormat('123-45-67891'), 'format_ok');
  assert.equal(checkBrnFormat('1234567891'), 'format_ok');
  assert.equal(checkBrnFormat('123-45-67890'), 'checksum_mismatch');
  assert.equal(checkBrnFormat('123-45'), 'invalid_format');
  assert.equal(checkBrnFormat(null), null);
  const s = summarizeFirms(filterProjects(snapshot), snapshot);
  assert.equal(s.firms.find((x) => x.firm_id === 'v2-firm-002').brn_format, 'checksum_mismatch');
});

// ---- 건물 연령
test('준공일 기준 39·40·41년', () => {
  const asOf = '2026-10-17';
  assert.equal(classifyBuildingAge(bld({ completion_date: '1987-05-01', date_precision: 'day' }), asOf).status, 'under');
  assert.equal(classifyBuildingAge(bld({ completion_date: '1986-10-17', date_precision: 'day' }), asOf).minAge, 40);
  assert.equal(classifyBuildingAge(bld({ completion_date: '1986-10-17', date_precision: 'day' }), asOf).status, 'over');
  assert.equal(classifyBuildingAge(bld({ completion_date: '1985-03-01', date_precision: 'day' }), asOf).minAge, 41);
});

test('정확히 40년 되는 날과 그 하루 전', () => {
  const b = bld({ completion_date: '1986-10-17', completion_year: 1986, date_precision: 'day' });
  assert.deepEqual(classifyBuildingAge(b, '2026-10-17'), { status: 'over', minAge: 40, maxAge: 40, reason: '준공일 기준 40년', basis: 'completion_date' });
  const dayBefore = classifyBuildingAge(b, '2026-10-16');
  assert.equal(dayBefore.status, 'under');
  assert.equal(dayBefore.maxAge, 39);
});

test('준공연도만 알면 경계 연도는 uncertain', () => {
  const asOf = '2026-10-17';
  const y86 = classifyBuildingAge(bld({ completion_year: 1986, date_precision: 'year' }), asOf);
  assert.deepEqual([y86.status, y86.minAge, y86.maxAge], ['uncertain', 39, 40]);
  assert.equal(classifyBuildingAge(bld({ completion_year: 1985, date_precision: 'year' }), asOf).status, 'over');
  assert.equal(classifyBuildingAge(bld({ completion_year: 1987, date_precision: 'year' }), asOf).status, 'under');
  // 연도는 1985지만 기준일이 연초면 1985-12-31 준공 가능성 때문에 확정하지 않음
  assert.equal(classifyBuildingAge(bld({ completion_year: 1985, date_precision: 'year' }), '2025-06-30').status, 'uncertain');
  // 날짜가 있어도 정밀도가 day가 아니면 월일을 믿지 않음
  assert.equal(classifyBuildingAge(bld({ completion_date: '1986-01-01', date_precision: 'unknown' }), asOf).status, 'uncertain');
});

test('준공 정보가 없거나 모순이면 unknown — 개교일 등으로 대체하지 않음', () => {
  assert.equal(classifyBuildingAge(bld({}), '2026-10-17').status, 'unknown');
  assert.equal(classifyBuildingAge(bld({ completion_date: '1986-10-17', completion_year: 1987, date_precision: 'day' }), '2026-10-17').status, 'unknown');
  assert.equal(classifyBuildingAge(bld({ completion_date: '2027-01-01', date_precision: 'day' }), '2026-10-17').status, 'unknown');
});

test('윤일 준공과 만 나이 계산', () => {
  assert.equal(completedYears('1986-02-28', '2026-02-28'), 40);
  assert.equal(completedYears('1984-02-29', '2024-02-28'), 39);
  assert.equal(completedYears('1984-02-29', '2024-02-29'), 40);
  assert.equal(completedYears('1984-02-29', '2025-03-01'), 41);
});

test('건물 수와 학교 수를 따로 세고 철거 건물은 목록에서 분리', () => {
  const s = summarizeBuildings(snapshot);
  assert.deepEqual(s.total, { buildings: 8, schools: 3 });
  assert.deepEqual(s.byAge.over, { buildings: 5, schools: 3 });
  assert.deepEqual(s.byAge.uncertain, { buildings: 1, schools: 1 });
  assert.deepEqual(s.byAge.under, { buildings: 1, schools: 1 });
  assert.deepEqual(s.byAge.unknown, { buildings: 1, schools: 1 });
  assert.deepEqual(s.listed, { buildings: 4, schools: 3 });
  assert.equal(s.byStatusAmongOver.demolished.buildings, 1);
  assert.equal(s.byStatusAmongOver.unknown.buildings, 1);
  assert.ok(s.notes.some((n) => n.includes('안전등급')));
  assert.deepEqual(summarizeBuildings(snapshot, { regions: ['11'] }).total, { buildings: 2, schools: 1 });
});

// ---- 설계 주제
test('주제 비율은 분모·미분류를 보존하고 다중 태그를 허용', () => {
  const s = summarizeTopics(filterProjects(snapshot));
  const t = (id) => s.topics.find((x) => x.topic_id === id);
  assert.equal(s.denominator, 5);
  assert.equal(s.unclassified, 2); // 근거 없음 1 + 사전에 없는 주제만 있음 1
  assert.equal(s.multiTagProjects, 1);
  assert.equal(t('community_sharing').projects, 2);
  assert.equal(t('community_sharing').share, 0.4);
  assert.deepEqual(t('community_sharing').review_status_counts, { reviewed: 2 });
  assert.equal(t('carbon_energy').projects, 0);
  assert.ok(s.evidenceIssues.some((i) => i.code === 'unknown_topic'));
  assert.ok(s.evidenceIssues.some((i) => i.code === 'missing_evidence_note'));
  assert.ok(s.notes[0].includes('100%'));
  assert.deepEqual(s.byYear.map((y) => [y.year, y.denominator]), [['2024', 1], ['2025', 2], ['2026', 2]]);
});

test('다중 태그만 있으면 비율 합이 100%를 넘는다', () => {
  const one = filterProjects(snapshot, { regions: ['11'], schoolLevels: ['elementary'] }).filter((p) => p.project_id === 'v2-project-001');
  const s = summarizeTopics(one);
  assert.ok(s.topics.reduce((n, t) => n + t.share, 0) > 1);
});

// ---- 내보내기
test('내보내기는 화면 필터와 같은 조건과 메타데이터를 쓴다', () => {
  const filters = { regions: ['11'], months: 36, dateBasis: 'award_date' };
  const out = exportRows(snapshot, filters);
  assert.deepEqual(out.rows.map((r) => r.project_id), filterProjects(snapshot, filters).map((p) => p.project_id));
  assert.equal(out.metadata.is_demo, true);
  assert.ok(out.metadata.demo_label.includes('가상'));
  assert.equal(out.metadata.data_as_of, '2026-10-17');
  assert.equal(out.metadata.window, '(2023-10-17, 2026-10-17]');
  assert.equal(out.metadata.row_count, 2);
  assert.equal(out.rows[0].is_demo, 'true');
  assert.equal(out.rows[0].firm_names, '가상건축 (주) | 가상디자인건축사사무소');
  assert.equal(out.rows[0].source_urls, 'https://example.com/v2-001');
  assert.equal(out.rows[1].topic_ids, ''); // 사전에 없는 주제는 주제 집계와 같이 제외
});

test('CSV는 수식으로 해석될 문자열을 무력화하고 따옴표를 처리', () => {
  for (const s of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) assert.ok(safeCell(s).startsWith("'"), s);
  assert.equal(safeCell('가상'), '가상');
  assert.equal(safeCell(-1), '-1'); // 숫자는 그대로
  assert.equal(safeCell(null), '');
  const csv = toCsv(exportRows(snapshot));
  assert.ok(csv.startsWith('﻿is_demo,true\r\n'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://example.invalid"",""가상"")"`));
  assert.ok(csv.includes("'+1 가상 자료"));
  assert.ok(!/\r\n=|,=/.test(csv));
  assert.ok(csv.includes('가상 자료,사업 ID,사업명'));
});

test('건물 내보내기도 판정과 근거를 함께 담는다', () => {
  const out = exportBuildingRows(snapshot);
  const row = out.rows.find((r) => r.building_id === 'v2-bld-year-1986');
  assert.deepEqual([row.age_status, row.age_range], ['uncertain', '39~40']);
  assert.equal(out.rows.find((r) => r.building_id === 'v2-bld-unknown').age_range, null);
  assert.equal(out.metadata.threshold, 40);
  assert.equal(out.metadata.is_demo, true);
  assert.ok(toCsv(out).includes('40년 판정'));
});

// ---- #9~#11 기준 회귀: 끊어진 참조·잘못된 타입·형식 오류
test('공동 당선에 끊어진 사무소 참조가 섞여도 확인된 사무소만 참여로 센다', () => {
  const projects = [{ project_id: 'x1', firm_ids: ['v2-firm-001', 'gone'] }];
  const s = summarizeFirms(projects, snapshot);
  assert.equal(s.participationTotal, 1);
  assert.equal(s.jointProjects, 1); // 사업 기록상 공동 당선
  assert.equal(s.firms[0].joint_awards, 1);
  assert.equal(s.projectsWithFirm, 1);
  assert.deepEqual(s.unresolvedFirmRefs, [{ project_id: 'x1', firm_id: 'gone' }]);
});

test('건물 연령: 잘못된 타입·형식은 예외 없이 unknown', () => {
  const asOf = '2026-10-17';
  for (const b of [
    { completion_date: '1986-10-17\n', date_precision: 'day' },
    { completion_date: '1986/10/17', date_precision: 'day' },
    { completion_date: { toString: null }, date_precision: 'day' },
    { completion_year: '1986', date_precision: 'year' },
    { completion_year: 1986.5, date_precision: 'year' },
    { completion_year: true },
    null,
  ]) {
    assert.equal(classifyBuildingAge(b, asOf).status, 'unknown', JSON.stringify(b));
  }
});

test('건물이 가리키는 학교가 없으면 건물 수에는 남기고 학교 수에서는 뺀다', () => {
  const s = summarizeBuildings({
    ...snapshot,
    buildings: [...snapshot.buildings, { ...snapshot.buildings[1], building_id: 'v2-bld-orphan', school_id: 'no-school' }],
  }, { regions: null });
  assert.deepEqual(s.total, { buildings: 9, schools: 3 });
  assert.deepEqual(s.unresolvedSchoolBuildingIds, ['v2-bld-orphan']);
  assert.ok(s.notes.some((n) => n.includes('학교 수에서 제외')));
});

test('주제 근거 출처가 sources에 없으면 출처 수에서 빼고 보고한다', () => {
  const projects = filterProjects({
    ...snapshot,
    projects: [{
      ...snapshot.projects[1],
      topic_evidence: [
        { topic_id: 'flexible_learning', source_id: 'no-source', evidence_note: '가상', review_status: 'draft' },
        'not-an-object',
      ],
    }],
  });
  const s = summarizeTopics(projects);
  const t = s.topics.find((x) => x.topic_id === 'flexible_learning');
  assert.equal(t.projects, 1);
  assert.deepEqual(t.source_ids, []);
  assert.ok(s.evidenceIssues.some((i) => i.code === 'unknown_evidence_source'));
  assert.ok(s.evidenceIssues.some((i) => i.code === 'invalid_evidence'));
});
