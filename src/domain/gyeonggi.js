// Administrative definitions are derived from the attributed boundary source.
// Address text is evidence, not geocoding: never infer a district from a school name.
import rules from '../../rules/gyeonggi.json' with { type: 'json' };

export const GYEONGGI_BOUNDARY_AS_OF = rules.boundary_as_of;
export const GYEONGGI_CITIES = Object.freeze(rules.cities.map(city => Object.freeze({
  ...city, districts: Object.freeze(city.districts.map(district => Object.freeze({...district}))),
})));
const citiesByCode = new Map(GYEONGGI_CITIES.map(city => [city.code, city]));
const cityPattern = new RegExp(`^(${GYEONGGI_CITIES.map(city => city.name).join('|')})(?=\\s|$|[가-힣]+구(?:\\s|$))`);
const outsideProvince = /^(?:서울(?:특별시)?|부산(?:광역시)?|대구(?:광역시)?|인천(?:광역시)?|광주광역시|대전(?:광역시)?|울산(?:광역시)?|세종(?:특별자치시)?|강원(?:특별자치도|도)?|충청[남북]도|충[남북]|전[남북](?:특별자치도|도)?|경상[남북]도|경[남북]|제주(?:특별자치도|도)?)(?=\s|$)/;

export function resolveGyeonggiLocation(project) {
  const location = typeof project?.metrics?.location === 'string' ? project.metrics.location.trim().replace(/\s+/g, ' ') : '';
  const codes = Array.isArray(project?.region_codes) ? project.region_codes : project?.region_code ? [project.region_code] : [];
  const hasGyeonggi = codes.includes('41');
  const explicitGyeonggi = /^(?:경기도|경기)(?:\s|$)/.test(location);
  const outside = (codes.length > 0 && !hasGyeonggi) || outsideProvince.test(location);
  const base = {location, cityCode: null, cityName: null, districtCode: null, districtName: null,
    hasDistricts: false, scope: hasGyeonggi || explicitGyeonggi ? 'gyeonggi' : 'unknown', status: 'unknown_city'};
  // The canonical project/school region keeps the record in the same province
  // query as the common domain filter. Conflicting address text cannot identify
  // a city: retain it in the explicit unknown-city bucket for review.
  if (outside) return {...base, scope: hasGyeonggi ? 'gyeonggi' : 'outside', status: hasGyeonggi || explicitGyeonggi ? 'conflict' : 'outside'};
  const address = location.replace(/^(?:경기도|경기)\s+/, '');
  const match = address.match(cityPattern);
  if (!match) return base;
  const city = GYEONGGI_CITIES.find(row => row.name === match[1]);
  const found = {...base, scope: 'gyeonggi', cityCode: city.code, cityName: city.name, hasDistricts: city.districts.length > 0, status: 'city'};
  if (!city.districts.length) return found;
  const remainder = address.slice(match[1].length).trimStart();
  const district = city.districts.find(row => remainder === row.name || remainder.startsWith(`${row.name} `));
  return district ? {...found, districtCode: district.code, districtName: district.name, status: 'district'}
    : {...found, status: 'unknown_district'};
}

/** Keep the caller's domain metadata; validate requests instead of silently widening them. */
export function filterGyeonggiProjects(projects, {city = '', district = ''} = {}) {
  if (city && city !== 'unknown' && !citiesByCode.has(city)) throw new RangeError('Unknown Gyeonggi city code');
  const definition = citiesByCode.get(city);
  if (district && (!definition?.districts.length || (district !== 'unknown' && !definition.districts.some(row => row.code === district))))
    throw new RangeError('District must belong to the selected Gyeonggi city');
  const result = projects.filter(project => {
    const place = resolveGyeonggiLocation(project);
    if (place.scope !== 'gyeonggi') return false;
    if (city === 'unknown' && place.cityCode !== null) return false;
    if (city && city !== 'unknown' && place.cityCode !== city) return false;
    if (district === 'unknown') return place.districtCode === null;
    return !district || place.districtCode === district;
  });
  if (projects.meta) result.meta = projects.meta;
  return result;
}

/** Count unique projects in each city; district rows partition only the selected city. */
export function summarizeGyeonggiProjects(projects, {city = ''} = {}) {
  if (city && city !== 'unknown' && !citiesByCode.has(city)) throw new RangeError('Unknown Gyeonggi city code');
  const cities = GYEONGGI_CITIES.map(row => ({code: row.code, label: row.name, count: 0}));
  const districts = (citiesByCode.get(city)?.districts ?? []).map(row => ({code: row.code, label: row.name, count: 0}));
  const cityRows = new Map(cities.map(row => [row.code, row]));
  const districtRows = new Map(districts.map(row => [row.code, row]));
  let unknownCityCount = 0, unknownDistrictCount = 0, excludedOutsideCount = 0, excludedUnknownScopeCount = 0, total = 0;
  const seen = new Set();
  for (const project of projects) {
    if (seen.has(project.project_id)) continue;
    seen.add(project.project_id);
    const place = resolveGyeonggiLocation(project);
    if (place.scope === 'outside') { excludedOutsideCount++; continue; }
    if (place.scope !== 'gyeonggi') { excludedUnknownScopeCount++; continue; }
    total++;
    if (!place.cityCode) { unknownCityCount++; continue; }
    cityRows.get(place.cityCode).count++;
    if (place.cityCode === city && districts.length) {
      if (!place.districtCode) unknownDistrictCount++;
      else districtRows.get(place.districtCode).count++;
    }
  }
  cities.push({code: 'unknown', label: '시·군 미확인', count: unknownCityCount});
  if (districts.length) districts.push({code: 'unknown', label: '구 미확인', count: unknownDistrictCount});
  return {cities, districts, unknownCityCount, unknownDistrictCount, excludedOutsideCount, excludedUnknownScopeCount, total};
}
