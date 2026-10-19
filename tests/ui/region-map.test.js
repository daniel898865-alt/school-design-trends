import test from 'node:test';
import assert from 'node:assert/strict';
import {GYEONGGI_CITIES} from '../../src/domain/gyeonggi.js';
import {GYEONGGI_REGIONS} from '../../src/ui/region-geometry.js';
import {regionMapEntries, regionPopupPosition, regionMapViewport} from '../../src/ui/region-map.js';
const entry = (rows, code) => regionMapEntries(rows).find(item => item.code === code);

test('시군31개와 미확인, 선택시 일반구만 별도로 표시한다', () => {
  assert.deepEqual(regionMapEntries([]).map(row => row.code), [...GYEONGGI_CITIES.map(row => row.code), 'unknown']);
  assert.deepEqual(regionMapEntries([], '41110').map(row => row.code), ['41111', '41113', '41115', '41117', 'unknown']);
  assert.equal(regionMapEntries([], '41590').length, 5);
});

test('0건·미제공·잘못된 건수·중복 행은 서로 구분한다', () => {
  assert.equal(entry([{code: '41110', count: 0}], '41110').status, 'available');
  assert.equal(entry([], '41110').count, null);
  for (const value of [null, '', '3', -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(entry([{code: '41110', count: value}], '41110').status, 'invalid');
  assert.equal(entry([{code: '41110', count: 1}, {code: '41110', count: 2}], '41110').status, 'duplicate');
});

test('임의 이름이나 미지원 코드를 지도 표기에 사용하지 않는다', () => {
  const rows = Object.freeze([Object.freeze({code: '41110', label: '<img onerror=alert(1)>', count: 2}), {code: '11', count: 9}]);
  assert.equal(entry(rows, '41110').label, '수원시');
  assert.equal(entry(rows, '41110').count, 2);
  assert.equal(regionMapEntries(rows).length, 32);
  assert.equal(regionMapEntries([{code: 'unknown', count: 3}], '41110').at(-1).label, '구 미확인');
});

test('시 확대는 실제 경계를 모두 포함하고 종횡비를 유지한다', () => {
  for (const city of GYEONGGI_REGIONS) {
    const viewport = regionMapViewport(city.code);
    assert.ok(Math.abs(viewport.width / viewport.height - 560 / 650) < 1e-12);
    assert.ok(viewport.x < city.bounds.x && viewport.y < city.bounds.y);
    assert.ok(viewport.x + viewport.width > city.bounds.x + city.bounds.width);
    assert.ok(viewport.y + viewport.height > city.bounds.y + city.bounds.height);
  }
  assert.deepEqual(regionMapViewport(), {x: 0, y: 0, width: 560, height: 650});
});

test('팝업은 큰 지도와 최소 폭의 모서리에서도 표시 영역을 벗어나지 않는다', () => {
  for (const size of [{width: 560, height: 650, popupWidth: 216, popupHeight: 160}, {width: 200, height: 200 * 650 / 560, popupWidth: 184, popupHeight: 180}]) {
    for (const x of [0, size.width / 2, size.width]) for (const y of [0, size.height / 2, size.height]) {
      const point = regionPopupPosition({...size, x, y});
      assert.ok(point.left >= 8 && point.left + size.popupWidth <= size.width - 8);
      assert.ok(point.top >= 8 && point.top + size.popupHeight <= size.height - 8);
    }
  }
});
