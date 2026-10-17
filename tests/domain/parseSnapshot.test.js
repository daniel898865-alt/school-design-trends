import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshot } from '../../src/data/parseSnapshot.js';
import { parseCsv, recordsFromCsv } from '../../src/data/csv.js';
import { addMonths, recentWindow, toDateOnly, windowMonths } from '../../src/domain/dates.js';
import { normalizeRegion, normalizeSchoolLevel } from '../../src/data/normalize.js';

const base = (over = {}) => ({
  schema_version: '0.1', is_demo: true, as_of: '2026-10-17', generated_at: null,
  schools: [], buildings: [], projects: [], sources: [], firms: [],
  coverage: { scope: '테스트', source_status: 'not_collected', limitations: [] },
  ...over,
});
const project = (over = {}) => ({
  project_id: 'p1', title: '가상 사업', school_ids: [], region_code: null, school_level: 'unknown', project_type: null,
  competition_date: null, award_date: null, completion_date: null, firm_ids: [], source_ids: [], summary: null,
  topic_evidence: [], images: [], ...over,
});
const codes = (list) => list.map((x) => x.code);

test('JSON 형식 오류를 보고한다', () => {
  const r = parseSnapshot('{ "is_demo": true,');
  assert.equal(r.snapshot, null);
  assert.deepEqual(codes(r.errors), ['invalid_json']);
});

test('필수 메타데이터 누락은 오류, 배열 누락은 경고와 빈 배열', () => {
  const { snapshot, errors, warnings } = parseSnapshot({ as_of: '2026-13-01' });
  assert.ok(codes(errors).includes('missing_field')); // is_demo
  assert.ok(codes(errors).includes('invalid_date')); // as_of
  assert.equal(snapshot.as_of, null);
  assert.equal(snapshot.is_demo, null);
  assert.deepEqual(snapshot.projects, []);
  assert.ok(warnings.some((w) => w.path === 'projects' && w.code === 'missing_field'));
  assert.ok(warnings.some((w) => w.path === 'coverage'));
});

test('누락 필드는 0이나 임의 값이 아닌 null·[]·unknown으로 둔다', () => {
  const { snapshot, warnings } = parseSnapshot(base({ projects: [{ project_id: 'p1', title: '가상' }] }));
  const p = snapshot.projects[0];
  assert.equal(p.award_date, null);
  assert.equal(p.region_code, null);
  assert.equal(p.school_level, 'unknown');
  assert.deepEqual(p.source_ids, []);
  assert.ok(warnings.filter((w) => w.code === 'missing_field' && w.id === 'p1').length >= 10);
});

test('잘못된 날짜·식별자 누락·형식 오류', () => {
  const { snapshot, errors } = parseSnapshot(base({
    projects: [project({ award_date: '2026/03/10' }), project({ project_id: '' }), project({ project_id: 'p2', source_ids: 's1' })],
  }));
  assert.equal(snapshot.projects.length, 2);
  assert.equal(snapshot.projects[0].award_date, null);
  assert.equal(snapshot.projects[0]._raw.award_date, '2026/03/10'); // 원본 보존
  assert.deepEqual(codes(errors).sort(), ['invalid_date', 'invalid_type', 'missing_id']);
});

test('같은 project_id는 합치고 값이 다르면 오류', () => {
  const { snapshot, errors, warnings } = parseSnapshot(base({
    projects: [project({ award_date: '2026-03-10', source_ids: ['a'] }), project({ award_date: '2026-03-11', source_ids: ['b'] })],
    sources: [{ source_id: 'a' }, { source_id: 'b' }],
  }));
  assert.equal(snapshot.projects.length, 1);
  assert.deepEqual(snapshot.projects[0].source_ids, ['a', 'b']);
  assert.equal(snapshot.projects[0].award_date, '2026-03-10');
  assert.ok(codes(errors).includes('duplicate_conflict'));
  assert.ok(codes(warnings).includes('merged_duplicate_project'));
});

test('이름만 같은 사업은 자동으로 합치지 않는다', () => {
  const { snapshot, warnings } = parseSnapshot(base({
    projects: [project({ project_id: 'p1', title: '가상 증축' }), project({ project_id: 'p2', title: '가상  증축' })],
  }));
  assert.equal(snapshot.projects.length, 2);
  assert.ok(codes(warnings).includes('possible_duplicate_project'));
});

test('다른 종류의 중복 식별자: 같으면 경고, 다르면 오류', () => {
  const school = { school_id: 's1', name: '가상', official_code: null, school_level: 'high', region_code: '11', region_name: null, address: null, source_ids: [] };
  const same = parseSnapshot(base({ schools: [school, { ...school }] }));
  assert.ok(codes(same.warnings).includes('duplicate_identical'));
  const diff = parseSnapshot(base({ schools: [school, { ...school, name: '다른 가상' }] }));
  assert.ok(codes(diff.errors).includes('duplicate_id'));
  assert.equal(diff.snapshot.schools[0].name, '가상');
});

test('없는 대상을 가리키는 연결은 경고', () => {
  const { warnings } = parseSnapshot(base({ projects: [project({ school_ids: ['없는학교'] })] }));
  assert.ok(warnings.some((w) => w.code === 'unknown_reference' && w.message.includes('없는학교')));
});

test('지역 코드·이름 정규화', () => {
  assert.equal(normalizeRegion('11', null).code, '11');
  assert.equal(normalizeRegion(11, null).code, '11');
  assert.equal(normalizeRegion(null, '서울 특별시').code, '11');
  assert.equal(normalizeRegion('45', null).code, '52');
  assert.equal(normalizeRegion('99', null).code, null);
  const conflict = normalizeRegion('11', '부산');
  assert.equal(conflict.code, null);
  assert.equal(conflict.conflict, true);
  assert.equal(normalizeRegion(null, '광주시').code, null); // 경기 광주시와 겹쳐 판단하지 않음
});

test('학교급 정규화: 통합학교는 combined, 모르는 값은 unknown', () => {
  assert.equal(normalizeSchoolLevel('초등학교').value, 'elementary');
  assert.equal(normalizeSchoolLevel('초·중 통합학교').value, 'combined'); // 공백·가운뎃점 무시
  assert.equal(normalizeSchoolLevel('초중학교').value, 'unknown'); // 별칭 목록에 없는 표기는 추정하지 않음
  assert.equal(normalizeSchoolLevel('high').value, 'high');
  assert.equal(normalizeSchoolLevel('특수학교').value, 'unknown');
  assert.equal(normalizeSchoolLevel(null).value, 'unknown');
});

test('링크는 http/https만, 사업자번호는 문자열만 보존', () => {
  const { snapshot, warnings, errors } = parseSnapshot(base({
    sources: [{ source_id: 's1', url: 'javascript:alert(1)' }, { source_id: 's2', url: 'https://example.com/a' }],
    firms: [{ firm_id: 'f1', business_registration_number: 1234567890 }, { firm_id: 'f2', business_registration_number: '123-45' }],
  }));
  assert.equal(snapshot.sources[0].url, null);
  assert.equal(snapshot.sources[1].url, 'https://example.com/a');
  assert.ok(codes(warnings).includes('unsafe_url'));
  assert.equal(snapshot.firms[0].business_registration_number, null);
  assert.ok(codes(errors).includes('invalid_type'));
  assert.equal(snapshot.firms[1].business_registration_number, '123-45');
  assert.ok(codes(warnings).includes('brn_format'));
});

test('CSV: 따옴표·쉼표·줄바꿈·목록 필드', () => {
  const { rows } = parseCsv('a,b\r\n"x, y","줄\n바꿈"\r\n"따옴표 ""안""",\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', '줄\n바꿈'], ['따옴표 "안"', '']]);
  const csv = '﻿project_id,title,school_ids,award_date,region_code\np1,"가상, 사업",s1; s2,2026-03-10,서울\np2,빈 칸,,,\n';
  const { records, errors } = recordsFromCsv(csv, 'projects');
  assert.deepEqual(errors, []);
  assert.deepEqual(records[0].school_ids, ['s1', 's2']);
  assert.equal(records[0].title, '가상, 사업');
  assert.equal(records[1].award_date, null);
  assert.deepEqual(records[1].school_ids, []);
  const { snapshot } = parseSnapshot(base({ projects: records }));
  assert.equal(snapshot.projects[0].region_code, null); // region_code 칸에 이름을 적으면 코드로 보지 않음
});

test('CSV: 열 개수 오류와 식별자 열 누락', () => {
  assert.ok(codes(recordsFromCsv('project_id,title\np1\n', 'projects').errors).includes('csv_column_count'));
  assert.ok(codes(recordsFromCsv('title\n가상\n', 'projects').errors).includes('missing_id'));
});

test('날짜 계산: 달 이동·기간·월 목록', () => {
  assert.equal(addMonths('2026-10-17', -36), '2023-10-17');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonths('2024-02-29', -12), '2023-02-28');
  assert.deepEqual(recentWindow('2026-10-17', 36), { start: '2023-10-17', end: '2026-10-17', startExclusive: true, endInclusive: true });
  assert.equal(toDateOnly('2026-05-02T09:00:00+09:00'), '2026-05-02');
  assert.equal(toDateOnly('2026-02-30'), null);
  const months = windowMonths({ start: '2026-01-31', end: '2026-03-31' });
  assert.deepEqual(months.map((m) => [m.month, m.partial]), [['2026-02', false], ['2026-03', false]]);
});
