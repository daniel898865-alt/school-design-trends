/** Offline, dependency-free ADM1 GeoJSON -> SVG; node tools/build-region-geometry.mjs [--check]. */
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const INPUT_URL = new URL('../public/maps/south-korea-regions.geojson', import.meta.url);
const OUTPUT_URL = new URL('../src/ui/region-geometry.js', import.meta.url);
const WIDTH = 560, HEIGHT = 650, PADDING = 28, STANDARD_PARALLEL = 36, PRECISION = 3;
const COS_LATITUDE = Math.cos(STANDARD_PARALLEL * Math.PI / 180);
const EXPECTED_REGIONS = [
  ['11', '서울특별시'], ['26', '부산광역시'], ['27', '대구광역시'], ['28', '인천광역시'],
  ['29', '광주광역시'], ['30', '대전광역시'], ['31', '울산광역시'], ['36', '세종특별자치시'],
  ['41', '경기도'], ['51', '강원특별자치도'], ['43', '충청북도'], ['44', '충청남도'],
  ['52', '전북특별자치도'], ['46', '전라남도'], ['47', '경상북도'], ['48', '경상남도'], ['50', '제주특별자치도'],
];
const hash = (value) => createHash('sha256').update(value).digest('hex');

/** Importable for independent checks. GeoJSON remains data, never executable source. */
export function buildRegionGeometry(inputText) {
  const input = JSON.parse(inputText);
  if (input?.type !== 'FeatureCollection' || !Array.isArray(input.features) || input.features.length !== 17)
    throw new Error('Expected the 17-region boundary FeatureCollection.');
  if (input.source?.boundary_as_of !== '2026-04-01' || input.source?.license !== 'CC-BY-4.0')
    throw new Error('Unexpected boundary vintage or data license; review the source before updating.');
  const byCode = new Map();
  for (const feature of input.features) {
    const p = feature?.properties;
    if (feature?.type !== 'Feature' || !p || byCode.has(p.code)) throw new Error('Missing or duplicate region code.');
    byCode.set(p.code, feature);
  }
  const points = [];
  let polygons = 0, rings = 0;
  const bounds = {west: Infinity, south: Infinity, east: -Infinity, north: -Infinity};
  const regionStats = [];
  const ordered = EXPECTED_REGIONS.map(([code, name]) => {
    const feature = byCode.get(code), p = feature?.properties;
    if (p?.name !== name || p.source_code !== code || p.source_name !== name || p.source_code_field !== 'sido')
      throw new Error(`Region code/name or source mapping mismatch: ${code}.`);
    if (feature.geometry?.type !== 'MultiPolygon' || !Array.isArray(feature.geometry.coordinates) || !feature.geometry.coordinates.length)
      throw new Error(`Missing MultiPolygon geometry for ${code}.`);
    const stats = {code, name, polygons: feature.geometry.coordinates.length, rings: 0, positions: 0};
    for (const polygon of feature.geometry.coordinates) {
      if (!Array.isArray(polygon) || !polygon.length) throw new Error('Empty polygon.');
      polygons++;
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4) throw new Error('A ring needs at least four positions.');
        for (const point of ring) {
          if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
              || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error('Invalid WGS84 longitude/latitude position.');
          const [lon, lat] = point;
          bounds.west = Math.min(bounds.west, lon); bounds.east = Math.max(bounds.east, lon);
          bounds.south = Math.min(bounds.south, lat); bounds.north = Math.max(bounds.north, lat);
          points.push(point); stats.positions++;
        }
        if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new Error('Polygon ring is not closed.');
        rings++; stats.rings++;
      }
    }
    regionStats.push(stats);
    return feature;
  });
  const projectedBounds = {minX: bounds.west * COS_LATITUDE, maxX: bounds.east * COS_LATITUDE, minY: -bounds.north, maxY: -bounds.south};
  const spanX = projectedBounds.maxX - projectedBounds.minX, spanY = projectedBounds.maxY - projectedBounds.minY;
  if (!(spanX > 0 && spanY > 0)) throw new Error('Region extent must have positive width and height.');
  const scale = Math.min((WIDTH - 2 * PADDING) / spanX, (HEIGHT - 2 * PADDING) / spanY);
  const projection = {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`, width: WIDTH, height: HEIGHT, padding: PADDING,
    standardParallel: STANDARD_PARALLEL, cosLatitude: COS_LATITUDE, bounds, projectedBounds, scale,
    offsetX: (WIDTH - spanX * scale) / 2, offsetY: (HEIGHT - spanY * scale) / 2,
  };
  const project = (lon, lat) => ({
    x: projection.offsetX + (lon * COS_LATITUDE - projectedBounds.minX) * scale,
    y: projection.offsetY + (-lat - projectedBounds.minY) * scale,
  });
  const number = (value) => String(Number(value.toFixed(PRECISION)));
  const regions = ordered.map((feature) => ({
    code: feature.properties.code, name: feature.properties.name,
    paths: feature.geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(([lon, lat], i) => {
      const {x, y} = project(lon, lat);
      return `${i === 0 ? 'M' : 'L'}${number(x)},${number(y)}`;
    }).join('') + 'Z').join('')),
  }));
  const pixelBounds = {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity};
  let maxRoundingError = 0;
  for (const [lon, lat] of points) {
    const {x, y} = project(lon, lat);
    if (x < PADDING - 1e-8 || x > WIDTH - PADDING + 1e-8 || y < PADDING - 1e-8 || y > HEIGHT - PADDING + 1e-8)
      throw new Error('Projected geometry exceeds the padded viewBox.');
    pixelBounds.minX = Math.min(pixelBounds.minX, x); pixelBounds.maxX = Math.max(pixelBounds.maxX, x);
    pixelBounds.minY = Math.min(pixelBounds.minY, y); pixelBounds.maxY = Math.max(pixelBounds.maxY, y);
    maxRoundingError = Math.max(maxRoundingError, Math.abs(x - Number(number(x))), Math.abs(y - Number(number(y))));
  }
  const source = {
    dataset: input.source.dataset, country: 'KOR', level: 'ADM1',
    boundaryAsOf: input.source.boundary_as_of, classificationBasis: input.source.classification_basis,
    upstreamRepository: input.source.repository, upstreamCommit: input.source.upstream_commit,
    upstreamPath: input.source.upstream_path, upstreamSha256: input.source.upstream_sha256,
    geometrySha256: hash(JSON.stringify(input.features.map((f) => f.geometry))),
    inputSha256: hash(inputText), license: input.source.license, licenseUrl: input.source.license_url,
    upstreamLicense: input.source.upstream_license, attribution: input.source.attribution,
  };
  const moduleText = '// Generated by tools/build-region-geometry.mjs; do not edit paths manually.\n'
    + '// SGIS / vuski/admdongkor boundaries: CC BY 4.0 + KOGL Type 1 attribution; see docs/MAP_SOURCE.md.\n'
    + '// Boundary vintage 2026-04-01; keep preserveAspectRatio="xMidYMid meet" and fill-rule="evenodd".\n'
    + `export const GEOMETRY_SOURCE = Object.freeze(${JSON.stringify(source, null, 2)});\n\n`
    + `export const PROJECTION = Object.freeze(${JSON.stringify(projection, null, 2)});\n`
    + 'Object.freeze(PROJECTION.bounds);\nObject.freeze(PROJECTION.projectedBounds);\n\n'
    + `export const KOREA_REGIONS = Object.freeze(${JSON.stringify(regions, null, 2)});\n`
    + 'for (const region of KOREA_REGIONS) { Object.freeze(region.paths); Object.freeze(region); }\n\n'
    + '/** Compatibility fill geometry; contains ADM1 polygons, including shared boundaries. */\n'
    + 'export const KOREA_PATHS = Object.freeze(KOREA_REGIONS.flatMap((region) => region.paths));\n\n'
    + '/** The same projection as all region paths, without island repositioning. */\n'
    + 'export function projectPoint(lon, lat) {\n'
    + '  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)\n'
    + "    throw new TypeError('Expected finite WGS84 longitude and latitude.');\n"
    + '  return {\n'
    + '    x: PROJECTION.offsetX + (lon * PROJECTION.cosLatitude - PROJECTION.projectedBounds.minX) * PROJECTION.scale,\n'
    + '    y: PROJECTION.offsetY + (-lat - PROJECTION.projectedBounds.minY) * PROJECTION.scale,\n'
    + '  };\n}\n';
  return {moduleText, report: {
    source, regions: regionStats, polygons, rings, positions: points.length, allRingsClosed: true,
    coordinatesRemovedDuringSvgGeneration: 0, svgPaths: polygons, precisionDecimalPlaces: PRECISION,
    maxRoundingErrorPixels: maxRoundingError, projection, pixelBounds,
    sourceBytes: Buffer.byteLength(inputText), moduleBytes: Buffer.byteLength(moduleText), moduleSha256: hash(moduleText),
  }};
}

function main() {
  if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Usage: node tools/build-region-geometry.mjs [--check]');
  const {moduleText, report} = buildRegionGeometry(readFileSync(INPUT_URL, 'utf8'));
  if (process.argv.includes('--check')) {
    if (readFileSync(OUTPUT_URL, 'utf8') !== moduleText) throw new Error('Generated region geometry differs. Run the generator to update it.');
  } else writeFileSync(OUTPUT_URL, moduleText, 'utf8');
  process.stdout.write(`${JSON.stringify({...report, mode: process.argv.includes('--check') ? 'verified' : 'generated'}, null, 2)}\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
