import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, UNKNOWN_REGION_LABEL } from '../../src/data/normalize.js';
import { regionMapEntries } from '../../src/ui/region-map.js';

const entry = (rows, code) => regionMapEntries(rows).find(item => item.code === code);

test('지도 선택 목록은 공통 규격의 17개 시도와 지역 미확인 항목을 빠짐없이 보존한다', () => {
  const result = regionMapEntries([]);
  assert.equal(REGIONS.length, 17);
  assert.deepEqual(result.map(item => item.code), [...REGIONS.map(region => region.code), 'unknown']);
  assert.equal(new Set(result.map(item => item.code)).size, 18);
  for (const region of REGIONS) assert.equal(result.find(item => item.code === region.code).label, region.name);
  assert.equal(result.at(-1).label, UNKNOWN_REGION_LABEL);
});

test('명시된 0건과 누락된 집계를 구분하며 비어 있는 지역을 0으로 채우지 않는다', () => {
  const rows = [{ code: '11', label: '서울특별시', count: 0 }, { code: '41', count: 7 }];
  assert.deepEqual([entry(rows, '11').count, entry(rows, '11').hasData, entry(rows, '11').status], [0, true, 'available']);
  assert.deepEqual([entry(rows, '26').count, entry(rows, '26').hasData, entry(rows, '26').status], [null, false, 'missing']);
  assert.equal(entry(rows, '41').count, 7);
});

test('미확인 지역 집계는 시도 집계와 독립적으로 유지한다', () => {
  const rows = [{ code: 'unknown', count: 3 }, { code: '11', count: 2 }];
  assert.equal(entry(rows, 'unknown').count, 3);
  assert.equal(entry(rows, '11').count, 2);
  assert.equal(entry(rows, '51').count, null);
});

test('중복 집계행과 유효하지 않은 건수는 임의 합산·형변환하지 않는다', () => {
  for (const invalid of [null, undefined, '', '3', -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const selected = entry([{ code: '11', count: invalid }], '11');
    assert.equal(selected.count, null);
    assert.equal(selected.status, 'invalid');
  }
  const duplicate = entry([{ code: '11', count: 2 }, { code: '11', count: 3 }], '11');
  assert.equal(duplicate.count, null);
  assert.equal(duplicate.status, 'duplicate');
});

test('입력의 임의 이름·미지원 코드를 화면의 시도 정의나 집계로 사용하지 않는다', () => {
  const rows = [null, {}, { code: '<script>', count: 4 }, { code: '42', count: 9 }, { code: '11', label: '<img onerror=alert(1)>', count: 1 }];
  assert.equal(entry(rows, '11').label, '서울특별시');
  assert.equal(entry(rows, '51').count, null, '이전 지역코드 변환은 공통 정규화 모듈의 책임');
  assert.equal(regionMapEntries(rows).length, 18);
});

test('입력 집계값을 변경하지 않고 다지역 참여 건수를 그대로 보존한다', () => {
  const rows = Object.freeze([Object.freeze({ code: '11', count: 2 }), Object.freeze({ code: '41', count: 2 })]);
  const before = JSON.stringify(rows);
  const result = regionMapEntries(rows);
  assert.equal(result.find(item => item.code === '11').count, 2);
  assert.equal(result.find(item => item.code === '41').count, 2);
  assert.equal(JSON.stringify(rows), before);
  for (const value of [null, undefined, {}]) assert.ok(regionMapEntries(value).every(item => !item.hasData));
});
