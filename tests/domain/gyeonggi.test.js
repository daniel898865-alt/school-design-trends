import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GYEONGGI_CITIES, resolveGyeonggiLocation, filterGyeonggiProjects, summarizeGyeonggiProjects} from '../../src/domain/gyeonggi.js';

const project = (id, location, region_code = '41') => ({project_id: id, region_code, metrics: {location}});

test('경기도는 31시군·8개 구 설치 시·24일반구로 나뉜다', () => {
  assert.equal(GYEONGGI_CITIES.length, 31);
  assert.equal(GYEONGGI_CITIES.filter(row => row.districts.length).length, 8);
  assert.equal(GYEONGGI_CITIES.flatMap(row => row.districts).length, 24);
  assert.deepEqual(GYEONGGI_CITIES.find(row => row.name === '화성시').districts.map(row => row.name), ['만세구', '효행구', '병점구', '동탄구']);
});

test('주소 맨 앞의 정식 시군·구를 연결하고 공백만 정규화한다', () => {
  for (const address of ['수원시 장안구 영화동 107', ' 경기도  수원시   장안구 영화동 107 ', '경기 수원시 장안구 영화동', '수원시장안구 영화동']) {
    const result = resolveGyeonggiLocation(project('a', address));
    assert.equal(result.cityCode, '41110'); assert.equal(result.districtCode, '41111');
    assert.equal(result.status, 'district');
  }
  assert.equal(resolveGyeonggiLocation(project('a', '양평군 용문면 용문로437')).cityCode, '41830');
});

test('학교 이름·길 이름·부분 문자열로 시군이나 구를 추정하지 않는다', () => {
  for (const address of ['', null, '미상', '수원시청 인근', '성남시립학교', '수원시정로 10'])
    assert.equal(resolveGyeonggiLocation(project('a', address)).cityCode, null);
  assert.equal(resolveGyeonggiLocation({...project('a', ''), title: '수원시 장안구 학교'}).cityCode, null);
  const old = resolveGyeonggiLocation(project('a', '화성시 산척동 740'));
  assert.equal(old.cityCode, '41590'); assert.equal(old.districtCode, null); assert.equal(old.status, 'unknown_district');
  assert.equal(resolveGyeonggiLocation(project('a', '안산시 선부광장서로 59')).districtCode, null);
});

test('다른 시도는 제외하고 경기 코드와 주소의 충돌은 시군 미확인으로 남긴다', () => {
  const rows = [project('a', '광주광역시 북구 용봉동', '29'), project('b', '서울특별시 종로구', '41'),
    project('c', '광주시 고산동', '41'), project('d', '', null), project('e', '광주시 고산동', '11')];
  assert.deepEqual(filterGyeonggiProjects(rows).map(row => row.project_id), ['b', 'c']);
  const summary = summarizeGyeonggiProjects(rows);
  assert.equal(summary.excludedOutsideCount, 2); assert.equal(summary.excludedUnknownScopeCount, 1);
  assert.equal(summary.unknownCityCount, 1);
  assert.deepEqual(filterGyeonggiProjects(rows, {city: 'unknown'}).map(row => row.project_id), ['b']);
  const conflict = resolveGyeonggiLocation(rows[1]);
  assert.equal(conflict.scope, 'gyeonggi'); assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.cityCode, null); assert.equal(conflict.location, '서울특별시 종로구');
  const outsideConflict = resolveGyeonggiLocation(project('f', '경기도 광주시 고산동', '11'));
  assert.equal(outsideConflict.scope, 'outside'); assert.equal(outsideConflict.status, 'conflict');
});

test('시·구 미확인과 다른 시의 구 선택을 구분한다', () => {
  const rows = [project('a', '수원시 장안구 영화동'), project('b', '수원시 영통구 이의동'),
    project('c', '수원시 어느 곳'), project('d', ''), project('e', '화성시 산척동')];
  assert.deepEqual(filterGyeonggiProjects(rows, {city: '41110'}).map(p => p.project_id), ['a', 'b', 'c']);
  assert.deepEqual(filterGyeonggiProjects(rows, {city: '41110', district: 'unknown'}).map(p => p.project_id), ['c']);
  assert.deepEqual(filterGyeonggiProjects(rows, {city: '41110', district: '41111'}).map(p => p.project_id), ['a']);
  assert.deepEqual(filterGyeonggiProjects(rows, {city: 'unknown'}).map(p => p.project_id), ['d']);
  assert.throws(() => filterGyeonggiProjects(rows, {city: '41110', district: '41131'}), RangeError);
  assert.throws(() => filterGyeonggiProjects(rows, {city: 'unknown', district: 'unknown'}), RangeError);
  assert.throws(() => filterGyeonggiProjects(rows, {city: '41'}), RangeError);
});

test('부모 시 건수에 구 미기재도 포함하고 중복 사업은 다시 세지 않는다', () => {
  const a = project('a', '수원시 장안구');
  const rows = [a, a, project('b', '수원시 영통구'), project('c', '수원시 영화동'), project('d', '')];
  const result = summarizeGyeonggiProjects(rows, {city: '41110'});
  assert.equal(result.total, 4);
  assert.equal(result.cities.find(row => row.code === '41110').count, 3);
  assert.equal(result.unknownCityCount, 1); assert.equal(result.unknownDistrictCount, 1);
  assert.equal(result.districts.reduce((n, row) => n + row.count, 0), 3);
});

test('필터는 입력을 변경하지 않고 기존 공통 집계 메타데이터를 보존한다', () => {
  const a = Object.freeze(project('a', '수원시 장안구'));
  const rows = [a]; rows.meta = Object.freeze({query_as_of: '2026-10-19'}); Object.freeze(rows);
  const result = filterGyeonggiProjects(rows, {city: '41110'});
  assert.equal(result[0], a); assert.equal(result.meta, rows.meta);
});

test('실제 166건은 시군으로 보존되고 구 누락은 독립된 미확인으로 남는다', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../../data/goe-annual.snapshot.json', import.meta.url), 'utf8'));
  const result = summarizeGyeonggiProjects(snapshot.projects);
  assert.equal(result.total, 166); assert.equal(result.unknownCityCount, 0);
  assert.equal(result.cities.reduce((n, row) => n + row.count, 0), 166);
  const hwaseong = summarizeGyeonggiProjects(snapshot.projects, {city: '41590'});
  assert.equal(hwaseong.cities.find(row => row.code === '41590').count, 10);
  assert.equal(hwaseong.unknownDistrictCount, 10, '2023~2025 옛주소를 2026 신설구로 임의 역산하지 않음');
});
