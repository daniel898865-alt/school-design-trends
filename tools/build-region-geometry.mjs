/** Offline Gyeonggi GeoJSON -> SVG; node tools/build-region-geometry.mjs [--check]. */
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import definitions from '../rules/gyeonggi.json' with {type: 'json'};

const INPUT_URL = new URL('../public/maps/gyeonggi-regions.geojson', import.meta.url);
const OUTPUT_URL = new URL('../src/ui/region-geometry.js', import.meta.url);
const WIDTH = 560, HEIGHT = 650, PADDING = 28, STANDARD_PARALLEL = 37.5, PRECISION = 3;
const COS_LATITUDE = Math.cos(STANDARD_PARALLEL * Math.PI / 180);
const hash = value => createHash('sha256').update(value).digest('hex');

export function buildRegionGeometry(inputText) {
  const input = JSON.parse(inputText);
  if (input?.type !== 'FeatureCollection' || input.features?.length !== 55)
    throw new Error('Expected 31 Gyeonggi cities/counties and 24 general districts');
  if (input.source?.boundary_as_of !== '2026-10-01' || input.source?.license !== 'CC-BY-4.0')
    throw new Error('Unexpected boundary vintage or license; review before updating');
  const expected = definitions.cities.flatMap(city => [
    {code: city.code, name: city.name, level: 'city', parent: '41'},
    ...city.districts.map(row => ({code: row.code, name: row.name, level: 'district', parent: city.code})),
  ]);
  const byCode = new Map();
  const points = [];
  let polygons = 0, rings = 0;
  const bounds = {west: Infinity, south: Infinity, east: -Infinity, north: -Infinity};
  for (const feature of input.features) {
    const p = feature?.properties;
    const definition = expected.find(row => row.code === p?.code);
    if (!definition || p.name !== definition.name || p.level !== definition.level || p.parent_code !== definition.parent || byCode.has(p.code))
      throw new Error('Missing, duplicate or mismatched administrative definition');
    if (feature.geometry?.type !== 'MultiPolygon' || !feature.geometry.coordinates.length)
      throw new Error('Expected nonempty MultiPolygon');
    for (const polygon of feature.geometry.coordinates) {
      polygons++;
      if (!polygon.length) throw new Error('Empty polygon');
      for (const ring of polygon) {
        rings++;
        if (ring.length < 4 || String(ring[0]) !== String(ring.at(-1))) throw new Error('Unclosed polygon ring');
        for (const point of ring) {
          if (point.length !== 2 || !point.every(Number.isFinite) || point[0] < 125 || point[0] > 129 || point[1] < 36 || point[1] > 39)
            throw new Error('Invalid Gyeonggi coordinate');
          const [lon, lat] = point;
          bounds.west = Math.min(bounds.west, lon); bounds.east = Math.max(bounds.east, lon);
          bounds.south = Math.min(bounds.south, lat); bounds.north = Math.max(bounds.north, lat);
          points.push(point);
        }
      }
    }
    if (!Array.isArray(p.label_point) || p.label_point.length !== 2 || !p.label_point.every(Number.isFinite)) throw new Error('Missing label reference');
    byCode.set(p.code, feature);
  }
  const projectedBounds = {minX: bounds.west * COS_LATITUDE, maxX: bounds.east * COS_LATITUDE, minY: -bounds.north, maxY: -bounds.south};
  const spanX = projectedBounds.maxX - projectedBounds.minX, spanY = projectedBounds.maxY - projectedBounds.minY;
  const scale = Math.min((WIDTH - 2 * PADDING) / spanX, (HEIGHT - 2 * PADDING) / spanY);
  const projection = {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, width: WIDTH, height: HEIGHT, padding: PADDING,
    standardParallel: STANDARD_PARALLEL, cosLatitude: COS_LATITUDE, bounds, projectedBounds, scale,
    offsetX: (WIDTH - spanX * scale) / 2, offsetY: (HEIGHT - spanY * scale) / 2};
  const project = (lon, lat) => ({x: projection.offsetX + (lon * COS_LATITUDE - projectedBounds.minX) * scale,
    y: projection.offsetY + (-lat - projectedBounds.minY) * scale});
  const number = value => Number(value.toFixed(PRECISION));
  const regions = [...byCode.values()].map(feature => {
    const p = feature.properties;
    const positions = feature.geometry.coordinates.flat(2).map(([lon, lat]) => project(lon, lat));
    return {code: p.code, name: p.name, level: p.level, parentCode: p.parent_code,
      labelPoint: project(...p.label_point),
      bounds: {x: Math.min(...positions.map(p => p.x)), y: Math.min(...positions.map(p => p.y)),
        width: Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x)),
        height: Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y))},
      paths: feature.geometry.coordinates.map(polygon => polygon.map(ring => ring.map(([lon, lat], i) => {
        const {x, y} = project(lon, lat); return `${i ? 'L' : 'M'}${number(x)},${number(y)}`;
      }).join('') + 'Z').join(''))};
  });
  const source = {...input.source, inputSha256: hash(inputText), geometrySha256: hash(JSON.stringify(input.features.map(f => f.geometry))),
    cityCount: 31, districtCount: 24};
  const moduleText = '// Generated by tools/build-region-geometry.mjs; do not edit paths manually.\n'
    + '// Gyeonggi 2026-10-01; SGIS / vuski/admdongkor, CC BY 4.0 + KOGL Type 1. See docs/MAP_SOURCE.md.\n'
    + `export const GEOMETRY_SOURCE = Object.freeze(${JSON.stringify(source, null, 2)});\n\n`
    + `export const PROJECTION = Object.freeze(${JSON.stringify(projection, null, 2)});\n\n`
    + `const geometries = ${JSON.stringify(regions, null, 2)};\n`
    + 'for (const item of geometries) { Object.freeze(item.paths); Object.freeze(item.bounds); Object.freeze(item.labelPoint); Object.freeze(item); }\n'
    + "export const GYEONGGI_REGIONS = Object.freeze(geometries.filter(item => item.level === 'city'));\n"
    + "export const GYEONGGI_DISTRICTS = Object.freeze(geometries.filter(item => item.level === 'district'));\n\n"
    + 'export function projectPoint(lon, lat) {\n'
    + "  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new TypeError('Expected WGS84 longitude and latitude');\n"
    + '  return {x: PROJECTION.offsetX + (lon * PROJECTION.cosLatitude - PROJECTION.projectedBounds.minX) * PROJECTION.scale,\n'
    + '    y: PROJECTION.offsetY + (-lat - PROJECTION.projectedBounds.minY) * PROJECTION.scale};\n}\n';
  return {moduleText, report: {cities: 31, districts: 24, polygons, rings, positions: points.length,
    inputSha256: source.inputSha256, moduleSha256: hash(moduleText), sourceBytes: Buffer.byteLength(inputText), moduleBytes: Buffer.byteLength(moduleText)}};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node tools/build-region-geometry.mjs [--check]');
  const {moduleText, report} = buildRegionGeometry(readFileSync(INPUT_URL, 'utf8'));
  if (process.argv.includes('--check')) {
    if (readFileSync(OUTPUT_URL, 'utf8') !== moduleText) throw new Error('Generated geometry differs');
  } else writeFileSync(OUTPUT_URL, moduleText, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}
