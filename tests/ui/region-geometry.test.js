import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {REGIONS} from '../../src/data/normalize.js';
import {GEOMETRY_SOURCE, KOREA_REGIONS, KOREA_PATHS, PROJECTION, projectPoint} from '../../src/ui/region-geometry.js';

const input = readFileSync(new URL('../../public/maps/south-korea-regions.geojson', import.meta.url), 'utf8');
const collection = JSON.parse(input);
const featurePolygons = (feature) => feature.geometry.type === 'Polygon'
  ? [feature.geometry.coordinates] : feature.geometry.coordinates;
const features = new Map(collection.features.map((feature) => [feature.properties.code, feature]));
const polygons = collection.features.flatMap(featurePolygons);
const sourcePoints = polygons.flat(2);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (tolerance ${tolerance})`);

function bounds(points) {
  const result = {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity};
  for (const [x, y] of points) {
    result.minX = Math.min(result.minX, x); result.maxX = Math.max(result.maxX, x);
    result.minY = Math.min(result.minY, y); result.maxY = Math.max(result.maxY, y);
  }
  return result;
}

// Parse the emitted SVG rather than regenerating it with the production builder.
function pathRings(path) {
  const commands = path.match(/[ML][^MLZ]+|Z/g) ?? [];
  assert.equal(commands.join(''), path, 'SVG 경로에 해석하지 못한 문자가 없어야 함');
  const rings = [];
  let ring = null;
  for (const command of commands) {
    if (command === 'Z') {
      assert.ok(ring?.length >= 4, '각 도형은 네 좌표 이상인 닫힌 고리여야 함');
      assert.deepEqual(ring.at(-1), ring[0], '원본의 닫힘 좌표를 보존해야 함');
      rings.push(ring);
      ring = null;
      continue;
    }
    if (command[0] === 'M') {
      assert.equal(ring, null, '이전 고리를 닫은 뒤 새 고리를 시작해야 함');
      ring = [];
    } else assert.ok(ring, '선분 앞에 시작점이 있어야 함');
    const point = command.slice(1).split(',').map(Number);
    assert.equal(point.length, 2);
    assert.ok(point.every(Number.isFinite), 'SVG 좌표는 유한한 숫자여야 함');
    ring.push(point);
  }
  assert.equal(ring, null, '마지막 고리도 Z로 닫혀 있어야 함');
  return rings;
}

test('2026년 4월 경계의 17개 코드·이름이 집계 기준과 정확히 일치한다', () => {
  assert.equal(collection.type, 'FeatureCollection');
  assert.equal(collection.features.length, 17);
  assert.equal(features.size, 17, '중복된 시도 feature가 없어야 함');
  assert.equal(KOREA_REGIONS.length, 17);
  assert.equal(new Set(KOREA_REGIONS.map((region) => region.code)).size, 17);
  assert.deepEqual([...features.keys()].sort(), REGIONS.map((region) => region.code).sort());
  assert.deepEqual(KOREA_REGIONS.map((region) => region.code).sort(), [...features.keys()].sort());
  for (const {code, name} of REGIONS) {
    const feature = features.get(code);
    assert.equal(feature.type, 'Feature');
    assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
    assert.equal(feature.properties.name, name);
    assert.equal(feature.properties.source_code, code);
    assert.equal(feature.properties.source_name, name);
    assert.equal(feature.properties.source_code_field, 'sido');
    assert.equal(feature.properties.cross_check_field, 'adm_cd2 first two digits');
    assert.equal(KOREA_REGIONS.find((region) => region.code === code).name, name);
  }
  assert.equal(collection.source.boundary_as_of, '2026-04-01');
  assert.equal(GEOMETRY_SOURCE.boundaryAsOf, collection.source.boundary_as_of);
  assert.equal(GEOMETRY_SOURCE.classificationBasis, collection.source.classification_basis);
});

test('가공한 공개 경계와 생성 모듈의 출처·좌표 지문이 일치한다', () => {
  assert.equal(polygons.length, 1115);
  assert.equal(polygons.flat().length, 1128, '내부 구멍도 보존한 고리 수');
  assert.equal(sourcePoints.length, 25679);
  assert.equal(collection.source.upstream_commit, 'dd1881663fcabc69b81393604e91ebf3a4202e9a');
  assert.equal(collection.source.upstream_sha256, '90da81444f68b9a5b0bd5762f84bc6a8a9a702750c20223d52b1c5114cf7b0b1');
  // This fingerprint pins the dissolved/simplified display geometry, not the raw
  // administrative-dong boundaries. No further vertices may vanish in SVG export.
  assert.equal(sha256(JSON.stringify(collection.features.map((feature) => feature.geometry))),
    '6ca86b3a65c9dd22fb07dae76d2b361bf96525d2dde588422831513931739154');
  assert.equal(GEOMETRY_SOURCE.geometrySha256,
    sha256(JSON.stringify(collection.features.map((feature) => feature.geometry))));
  assert.equal(GEOMETRY_SOURCE.inputSha256, sha256(input));
  assert.equal(GEOMETRY_SOURCE.upstreamCommit, collection.source.upstream_commit);
  assert.equal(GEOMETRY_SOURCE.upstreamSha256, collection.source.upstream_sha256);
  const extent = bounds(sourcePoints);
  assert.ok(extent.minX > 124 && extent.minX < 125);
  assert.ok(extent.maxX > 131 && extent.maxX < 132);
  assert.ok(extent.minY > 33 && extent.minY < 34);
  assert.ok(extent.maxY > 38 && extent.maxY < 39);
  assert.deepEqual(PROJECTION.bounds, {
    west: extent.minX, east: extent.maxX, south: extent.minY, north: extent.maxY,
  });
});

test('시도별 SVG 도형은 모두 닫히며 공개 경계의 고리·좌표를 빠짐없이 보존한다', () => {
  assert.equal(KOREA_PATHS.length, polygons.length);
  assert.deepEqual(KOREA_PATHS, KOREA_REGIONS.flatMap((region) => region.paths));
  let positions = 0;
  for (const region of KOREA_REGIONS) {
    const source = featurePolygons(features.get(region.code));
    const rendered = region.paths.map(pathRings);
    assert.equal(rendered.length, source.length, `${region.code}의 도형 수`);
    for (let p = 0; p < source.length; p++) {
      assert.equal(rendered[p].length, source[p].length, `${region.code} 도형 ${p}의 고리 수`);
      for (let r = 0; r < source[p].length; r++) {
        assert.equal(rendered[p][r].length, source[p][r].length, `${region.code} 도형 ${p}, 고리 ${r}의 좌표 수`);
        positions += rendered[p][r].length;
      }
    }
  }
  assert.equal(positions, sourcePoints.length);
});

test('모든 원본 좌표와 SVG 좌표는 같은 위치로 투영되고 캔버스 여백 안에 남는다', () => {
  for (const region of KOREA_REGIONS) {
    const source = featurePolygons(features.get(region.code));
    for (let p = 0; p < source.length; p++) {
      const rendered = pathRings(region.paths[p]);
      source[p].forEach((ring, r) => ring.forEach(([lon, lat], i) => {
        const {x, y} = projectPoint(lon, lat);
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
        assert.ok(x >= PROJECTION.padding - 1e-8 && x <= PROJECTION.width - PROJECTION.padding + 1e-8);
        assert.ok(y >= PROJECTION.padding - 1e-8 && y <= PROJECTION.height - PROJECTION.padding + 1e-8);
        // Generated paths retain three decimal places; the error must stay subpixel.
        near(rendered[r][i][0], x, 0.000501);
        near(rendered[r][i][1], y, 0.000501);
      }));
    }
  }
});

test('동쪽은 오른쪽·북쪽은 위쪽이며 두 축에 같은 축척을 적용한다', () => {
  const base = projectPoint(127, 36);
  const east = projectPoint(128, 36);
  const north = projectPoint(127, 37);
  assert.ok(east.x > base.x);
  assert.ok(north.y < base.y);
  near(east.y, base.y);
  near(north.x, base.x);
  // Longitude is shortened at the documented 36° standard parallel; after that
  // correction the map must not stretch one screen axis independently.
  const longitudeCorrection = Math.cos(36 * Math.PI / 180);
  near((east.x - base.x) / longitudeCorrection, base.y - north.y);
  const other = projectPoint(125, 34);
  near(projectPoint(126, 34).x - other.x, east.x - base.x);
  near(other.y - projectPoint(125, 35).y, base.y - north.y);
  const extent = bounds(sourcePoints);
  const center = projectPoint((extent.minX + extent.maxX) / 2, (extent.minY + extent.maxY) / 2);
  near(center.x, PROJECTION.width / 2);
  near(center.y, PROJECTION.height / 2);
});

test('제주 본섬은 남서쪽 상대 위치를 유지하고 동쪽의 작은 섬 도형도 남는다', () => {
  const items = KOREA_REGIONS.flatMap((region) => featurePolygons(features.get(region.code)).map((rings, index) => ({
    code: region.code, path: region.paths[index], extent: bounds(rings.flat()),
  })));
  const area = ({extent}) => (extent.maxX - extent.minX) * (extent.maxY - extent.minY);
  const largest = (rows) => rows.reduce((a, b) => area(a) > area(b) ? a : b);
  const mainland = largest(items.filter((item) => item.code !== '50'));
  const jeju = largest(items.filter((item) => item.code === '50'));
  const easternIslands = items.filter(({extent}) => extent.minX > 130);
  assert.ok(easternIslands.length >= 2);
  assert.ok(easternIslands.every((item) => item.code === '47'), '동쪽 섬도 경상북도와 연결');
  const pixelBounds = ({path}) => bounds(pathRings(path).flat());
  const landPixels = pixelBounds(mainland);
  const jejuPixels = pixelBounds(jeju);
  assert.ok(jejuPixels.minY > landPixels.maxY, '제주를 본토 옆 별도 삽입도로 옮기지 않음');
  assert.ok((jejuPixels.minX + jejuPixels.maxX) / 2 < (landPixels.minX + landPixels.maxX) / 2);
  for (const island of easternIslands) {
    const pixels = pixelBounds(island);
    assert.ok(pixels.minX > landPixels.maxX, '동쪽 섬을 누락하거나 본토 안쪽으로 옮기지 않음');
    assert.ok(pixels.maxX > pixels.minX && pixels.maxY > pixels.minY, '작은 섬도 반올림 후 면적 범위를 유지');
  }
});
