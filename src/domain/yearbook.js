// 공모집 수록연도 기준 조회·집계.
// award_year는 '공모집 수록연도'로만 취급한다. 실제 당선일·준공일이 아니며 날짜로 바꾸거나 채우지 않는다.
// 수록연도가 없거나 형식이 틀린 사업은 어느 연도에도 넣지 않고 별도로 보고한다.
import { matchesRegion, matchesTopic, projectRegions } from './projects.js';

export const YEARBOOK_BASIS = 'yearbook_year';

// 정수(또는 네 자리 숫자 문자열) 1000~9999만 연도로 인정한다. 그 밖에는 null.
export function yearbookYear(project) {
  const v = project?.award_year;
  const n = typeof v === 'string' && /^\d{4}$/.test(v.trim()) ? Number(v.trim()) : v;
  return Number.isInteger(n) && n >= 1000 && n <= 9999 ? n : null;
}

// filterProjectsByYearbookYear(snapshot, {years, regions, schoolLevels, topics}) -> projects[]
//   years: 조회할 수록연도 배열(null이면 연도가 있는 전체).
//   반환 배열의 meta에 연도 미확인 사업과 연도 범위 밖 건수를 담는다.
//   각 사업에는 region_codes, yearbook_year, window_source_ids(존재가 확인된 출처)를 덧붙인다.
export function filterProjectsByYearbookYear(snapshot, options = {}) {
  const { years = null, regions = null, schoolLevels = null, topics = null } = options;
  if (years !== null && !(Array.isArray(years) && years.every((y) => Number.isInteger(y) && y >= 1000 && y <= 9999))) {
    throw new Error(`years는 1000~9999 정수 연도 배열이어야 함: ${JSON.stringify(years)}`);
  }
  const schoolsById = new Map(snapshot.schools.map((s) => [s.school_id, s]));
  const sourcesById = new Map(snapshot.sources.map((s) => [s.source_id, s]));

  const result = [];
  let matchedFilters = 0;
  let excludedOutOfRange = 0;
  const unknownYearIds = [];

  for (const project of snapshot.projects) {
    const regionCodes = projectRegions(project, schoolsById);
    if (regions && !matchesRegion(regionCodes, regions)) continue;
    if (schoolLevels && !schoolLevels.includes(project.school_level)) continue;
    if (topics && !matchesTopic(project, topics)) continue;
    matchedFilters++;

    const year = yearbookYear(project);
    if (year === null) {
      unknownYearIds.push(project.project_id);
      continue;
    }
    if (years && !years.includes(year)) {
      excludedOutOfRange++;
      continue;
    }
    result.push({
      ...project,
      region_codes: regionCodes,
      yearbook_year: year,
      window_source_ids: project.source_ids.filter((id) => sourcesById.has(id)),
    });
  }

  result.meta = {
    is_demo: snapshot.is_demo,
    data_as_of: snapshot.as_of,
    date_basis: YEARBOOK_BASIS,
    window: null, // 날짜 기간이 아님
    years,
    schools_by_id: schoolsById,
    sources_by_id: sourcesById,
    filters: { regions, schoolLevels, topics },
    matched_filters: matchedFilters,
    excluded_unknown_years: unknownYearIds.length,
    excluded_unknown_year_ids: unknownYearIds,
    excluded_out_of_range: excludedOutOfRange,
  };
  return result;
}

// summarizeByYearbookYear(projects) -> {date_basis, total, byYear[], unknownYear, notes}
//   projects는 filterProjectsByYearbookYear 결과. total = 연도별 합계 + 연도 미확인.
export function summarizeByYearbookYear(projects) {
  const meta = projects.meta ?? null;
  const sourcesById = meta?.sources_by_id;
  const articleIds = (p) => (sourcesById instanceof Map ? (p.source_ids ?? []).filter((id) => sourcesById.has(id)) : p.source_ids ?? []);

  const years = [...new Set([...(meta?.years ?? []), ...projects.map((p) => p.yearbook_year)])].sort((a, b) => a - b);
  const byYear = years.map((year) => {
    const members = projects.filter((p) => p.yearbook_year === year);
    return {
      year,
      projects: members.length,
      articles: new Set(members.flatMap(articleIds)).size,
      byType: countBy(members, (p) => p.project_type ?? 'unknown'),
      bySchoolLevel: countBy(members, (p) => p.school_level ?? 'unknown'),
    };
  });
  const unknownIds = meta?.excluded_unknown_year_ids ?? [];
  const withYear = byYear.reduce((n, y) => n + y.projects, 0);

  const notes = [
    '공모집 수록연도 기준 — 실제 당선일·준공일이 아님',
    '공모집에 실린 당선작만 집계 — 응모작 전체나 발주 전체가 아님',
  ];
  if (meta?.is_demo !== false) notes.push('가상 예시 또는 가상 여부 미확인 자료 — 실제 통계로 사용하지 않음');
  if (unknownIds.length > 0) notes.push(`수록연도 미확인 ${unknownIds.length}건은 어느 연도에도 넣지 않음`);

  return {
    date_basis: YEARBOOK_BASIS,
    data_as_of: meta?.data_as_of ?? null,
    total: withYear + unknownIds.length,
    withYear,
    byYear,
    unknownYear: { projects: unknownIds.length, project_ids: unknownIds },
    excludedOutOfRange: meta?.excluded_out_of_range ?? null,
    notes,
  };
}

function countBy(list, keyOf) {
  const m = new Map();
  for (const item of list) m.set(keyOf(item), (m.get(keyOf(item)) ?? 0) + 1);
  return Object.fromEntries(m);
}
