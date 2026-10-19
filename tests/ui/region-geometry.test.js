import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GYEONGGI_REGIONS, GYEONGGI_DISTRICTS, PROJECTION, GEOMETRY_SOURCE, projectPoint} from '../../src/ui/region-geometry.js';
import {buildRegionGeometry} from '../../tools/build-region-geometry.mjs';
const text = readFileSync(new URL('../../public/maps/gyeonggi-regions.geojson', import.meta.url), 'utf8');
const geo = JSON.parse(text);
const all = [...GYEONGGI_REGIONS, ...GYEONGGI_DISTRICTS];
const hash = text => createHash('sha256').update(text).digest('hex');
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const insideFeature = (point, feature) => feature.geometry.coordinates.some(rings => inRing(point, rings[0]) && !rings.slice(1).some(ring => inRing(point, ring)));
const ringArea = ring => Math.abs(ring.reduce((s, [x, y], i) => i ? s + ring[i - 1][0] * y - x * ring[i - 1][1] : s, 0)) / 2;
const area = feature => feature.geometry.coordinates.reduce((sum, rings) => sum + ringArea(rings[0]) - rings.slice(1).reduce((a, ring) => a + ringArea(ring), 0), 0);

test('출처·기준일·해시와 오프라인 생성 결과가 일치한다', () => {
  assert.equal(GEOMETRY_SOURCE.boundary_as_of, '2026-10-01');
  assert.equal(GEOMETRY_SOURCE.license, 'CC-BY-4.0');
  assert.equal(GEOMETRY_SOURCE.inputSha256, hash(text));
  assert.equal(GEOMETRY_SOURCE.upstream_sha256, '843ece3a0b3429742cd4a1b699cc13987a88b5e5401f382e7fdaaa194ea5e605');
  assert.equal(buildRegionGeometry(text).moduleText, readFileSync(new URL('../../src/ui/region-geometry.js', import.meta.url), 'utf8'));
});

test('31시군·24구의 정식 코드·부모·위치가 일치하고 라벨은 자기 경계 안에 있다', () => {
  assert.equal(GYEONGGI_REGIONS.length, 31); assert.equal(GYEONGGI_DISTRICTS.length, 24);
  assert.equal(new Set(all.map(row => row.code)).size, 55);
  for (const region of all) {
    const feature = geo.features.find(row => row.properties.code === region.code);
    assert.equal(region.name, feature.properties.name);
    assert.equal(region.parentCode, feature.properties.parent_code);
    assert.ok(insideFeature(feature.properties.label_point, feature), region.name);
    if (region.level === 'district') assert.ok(insideFeature(feature.properties.label_point, geo.features.find(row => row.properties.code === region.parentCode)));
  }
});

test('구의 합은 부모 시와 같고 서울·인천을 경기도에 포함하지 않는다', () => {
  for (const city of GYEONGGI_REGIONS) {
    const children = geo.features.filter(row => row.properties.parent_code === city.code);
    if (!children.length) continue;
    const parent = geo.features.find(row => row.properties.code === city.code);
    assert.ok(Math.abs(area(parent) - children.reduce((sum, row) => sum + area(row), 0)) < 1e-9, city.name);
  }
  for (const point of [[126.978, 37.566], [126.705, 37.456]])
    assert.ok(!geo.features.some(feature => insideFeature(point, feature)), '서울·인천은 제외');
});

test('모든 경계 좌표를 삭제 없이 같은 비율로 투영하고 0.001단위 미만으로 반올림한다', () => {
  let positions = 0;
  for (const region of all) {
    const feature = geo.features.find(row => row.properties.code === region.code);
    assert.equal(region.paths.length, feature.geometry.coordinates.length);
    feature.geometry.coordinates.forEach((polygon, p) => {
      const rendered = [...region.paths[p].matchAll(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(match => [Number(match[1]), Number(match[2])]);
      const source = polygon.flat(); assert.equal(rendered.length, source.length);
      source.forEach(([lon, lat], i) => {
        const point = projectPoint(lon, lat); positions++;
        assert.ok(Math.abs(rendered[i][0] - point.x) <= 0.000501);
        assert.ok(Math.abs(rendered[i][1] - point.y) <= 0.000501);
        assert.ok(point.x >= 28 - 1e-8 && point.x <= 532 + 1e-8);
        assert.ok(point.y >= 28 - 1e-8 && point.y <= 622 + 1e-8);
      });
      for (const ring of polygon) assert.deepEqual(ring[0], ring.at(-1));
    });
  }
  assert.equal(positions, 17161);
  const base = projectPoint(127, 37), east = projectPoint(128, 37), north = projectPoint(127, 38);
  assert.ok(east.x > base.x && north.y < base.y);
  assert.ok(Math.abs((east.x - base.x) / Math.cos(PROJECTION.standardParallel * Math.PI / 180) - (base.y - north.y)) < 1e-8);
});
