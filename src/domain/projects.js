// 설계사업 필터와 집계. 화면은 이 결과를 다시 계산하지 않고 그대로 사용한다.
import { REGIONS, SCHOOL_LEVELS, UNKNOWN_REGION_LABEL } from '../data/normalize.js';
import { inWindow, isValidDate, monthKey, recentWindow, toDateOnly, windowMonths } from './dates.js';

// 당선 추세는 award_date, 기사 추세는 출처 published_at. 결측일을 서로 대신 채우지 않는다.
export const DATE_BASES = ['completion_date', 'award_date', 'competition_date', 'published_at'];
export const UNKNOWN_REGION = 'unknown';
export const UNCLASSIFIED_TOPIC = 'unclassified';

// 사업이 걸친 시도: 사업의 region_code와 연결된 학교의 region_code. 모두 없으면 [].
export function projectRegions(project, schoolsById) {
  const codes = new Set();
  if (project.region_code) codes.add(project.region_code);
  for (const id of project.school_ids) {
    const code = schoolsById.get(id)?.region_code;
    if (code) codes.add(code);
  }
  return [...codes];
}

// filterProjects(snapshot, {asOf, months, dateBasis, regions, schoolLevels, topics}) -> projects[]
// 반환 배열의 meta에 기준일·기간·제외 건수를 담는다. 각 사업에는 집계용 필드를 덧붙인다.
//   region_codes: 걸친 시도, basis_date: 기간 판정에 쓴 날짜,
//   window_source_ids: 존재가 확인된 출처 중 기간 안의 기사(published_at 기준) 또는 연결된 전체 기사
export function filterProjects(snapshot, options = {}) {
  const {
    asOf = snapshot.as_of,
    months = 36,
    dateBasis = 'award_date',
    regions = null,
    schoolLevels = null,
    topics = null,
  } = options;
  if (!isValidDate(asOf)) throw new Error(`조회 기준일 asOf가 필요함(YYYY-MM-DD): ${asOf}`);
  if (!DATE_BASES.includes(dateBasis)) throw new Error(`dateBasis는 ${DATE_BASES.join(', ')} 중 하나: ${dateBasis}`);

  const window = recentWindow(asOf, months);
  const schoolsById = new Map(snapshot.schools.map((s) => [s.school_id, s]));
  const sourcesById = new Map(snapshot.sources.map((s) => [s.source_id, s]));

  const result = [];
  let matchedFilters = 0;
  let excludedUnknownDates = 0;
  let excludedOutOfRange = 0;
  const unknownDateIds = [];

  for (const project of snapshot.projects) {
    const regionCodes = projectRegions(project, schoolsById);
    if (regions && !matchesRegion(regionCodes, regions)) continue;
    if (schoolLevels && !schoolLevels.includes(project.school_level)) continue;
    if (topics && !matchesTopic(project, topics)) continue;
    matchedFilters++;

    let basisDate = null;
    // 원본 참조와 파서 경고는 보존하되, 없는 레코드를 실제 기사로 세지 않는다.
    let windowSourceIds = project.source_ids.filter((id) => sourcesById.has(id));
    if (dateBasis === 'published_at') {
      const dated = project.source_ids
        .map((id) => ({ id, date: toDateOnly(sourcesById.get(id)?.published_at ?? null) }))
        .filter((s) => s.date !== null);
      if (dated.length === 0) {
        excludedUnknownDates++;
        unknownDateIds.push(project.project_id);
        continue;
      }
      const inside = dated.filter((s) => inWindow(s.date, window)).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (inside.length === 0) {
        excludedOutOfRange++;
        continue;
      }
      basisDate = inside[0].date;
      windowSourceIds = inside.map((s) => s.id);
    } else {
      basisDate = project[dateBasis];
      if (basisDate === null) {
        excludedUnknownDates++;
        unknownDateIds.push(project.project_id);
        continue;
      }
      if (!inWindow(basisDate, window)) {
        excludedOutOfRange++;
        continue;
      }
    }
    result.push({ ...project, region_codes: regionCodes, basis_date: basisDate, window_source_ids: windowSourceIds });
  }

  result.meta = {
    is_demo: snapshot.is_demo,
    query_as_of: asOf, // 조회 기준일
    data_as_of: snapshot.as_of, // 원자료(Snapshot) 기준일
    months,
    date_basis: dateBasis,
    window,
    schools_by_id: schoolsById,
    sources_by_id: sourcesById,
    filters: { regions, schoolLevels, topics },
    matched_filters: matchedFilters,
    excluded_unknown_dates: excludedUnknownDates,
    excluded_unknown_date_ids: unknownDateIds,
    excluded_out_of_range: excludedOutOfRange,
  };
  return result;
}

export function matchesRegion(regionCodes, wanted) {
  if (regionCodes.length === 0) return wanted.includes(UNKNOWN_REGION);
  return regionCodes.some((c) => wanted.includes(c));
}

export function matchesTopic(project, wanted) {
  const ids = project.topic_evidence.map((t) => t.topic_id).filter(Boolean);
  if (ids.length === 0) return wanted.includes(UNCLASSIFIED_TOPIC);
  return ids.some((id) => wanted.includes(id));
}

// summarizeProjects(projects) -> {uniqueProjects, byRegion[], byMonth[], excludedUnknownDates, ...}
// 사업 수는 고유 project_id, 기사 수는 고유 source_id, 학교 수는 고유 school_id로 따로 센다.
export function summarizeProjects(projects) {
  const meta = projects.meta ?? null;
  const existing = (ids, table) => table instanceof Map ? ids.filter((id) => table.has(id)) : ids;
  const articleIds = (p) => existing(p.window_source_ids ?? p.source_ids ?? [], meta?.sources_by_id);
  const schoolIds = existing(projects.flatMap((p) => p.school_ids ?? []), meta?.schools_by_id);

  const regionRows = [...REGIONS.map((r) => ({ code: r.code, name: r.name })), { code: UNKNOWN_REGION, name: UNKNOWN_REGION_LABEL }];
  const byRegion = regionRows.map(({ code, name }) => {
    const members = projects.filter((p) => {
      const codes = p.region_codes ?? (p.region_code ? [p.region_code] : []);
      return code === UNKNOWN_REGION ? codes.length === 0 : codes.includes(code);
    });
    return {
      region_code: code,
      region_name: name,
      projects: members.length,
      articles: new Set(members.flatMap(articleIds)).size,
    };
  });

  const bySchoolLevel = SCHOOL_LEVELS.map((level) => {
    const members = projects.filter((p) => p.school_level === level);
    return { school_level: level, projects: members.length, articles: new Set(members.flatMap(articleIds)).size };
  });

  const regionParticipations = byRegion.reduce((n, r) => n + r.projects, 0);

  return {
    is_demo: meta?.is_demo ?? null,
    query_as_of: meta?.query_as_of ?? null,
    data_as_of: meta?.data_as_of ?? null,
    date_basis: meta?.date_basis ?? null,
    window: meta?.window ?? null,
    uniqueProjects: new Set(projects.map((p) => p.project_id)).size,
    uniqueArticles: new Set(projects.flatMap(articleIds)).size,
    uniqueSchools: new Set(schoolIds).size,
    regionParticipations,
    multiRegionProjects: projects.filter((p) => (p.region_codes ?? []).length > 1).length,
    byRegion,
    bySchoolLevel,
    // 날짜 기간이 없는 조회(공모집 수록연도 등)는 월별 집계를 만들지 않는다.
    byMonth: meta?.window ? summarizeByMonth(projects, meta, articleIds) : [],
    excludedUnknownDates: meta?.excluded_unknown_dates ?? null,
    excludedOutOfRange: meta?.excluded_out_of_range ?? null,
    notes: summaryNotes(meta, regionParticipations, projects.length),
  };
}

// 표본이 없는 달도 0으로 남긴다. 기간이 달의 일부만 덮으면 partial: true.
function summarizeByMonth(projects, meta, articleIds) {
  return windowMonths(meta.window).map(({ month, from, to, partial }) => {
    if (meta.date_basis === 'published_at') {
      const articles = new Set();
      const members = new Set();
      for (const p of projects) {
        for (const id of p.window_source_ids) {
          const date = toDateOnly(meta.sources_by_id.get(id)?.published_at ?? null);
          if (date && monthKey(date) === month) {
            articles.add(id);
            members.add(p.project_id);
          }
        }
      }
      return { month, from, to, partial, projects: members.size, articles: articles.size };
    }
    const members = projects.filter((p) => monthKey(p.basis_date) === month);
    return { month, from, to, partial, projects: members.length, articles: new Set(members.flatMap(articleIds)).size };
  });
}

function summaryNotes(meta, regionParticipations, uniqueProjects) {
  const notes = [];
  if (meta?.is_demo !== false) notes.push('가상 예시 또는 가상 여부 미확인 자료 — 실제 통계로 사용하지 않음');
  if (meta?.window) {
    notes.push(`기간 (${meta.window.start}, ${meta.window.end}] · 날짜 기준 ${meta.date_basis}`);
    if (meta.excluded_unknown_dates > 0) notes.push(`${meta.date_basis} 미확인 ${meta.excluded_unknown_dates}건은 기간 집계에서 제외`);
    if (meta.date_basis === 'published_at') notes.push('월별 사업 수는 그 달에 기사가 난 사업 수이며, 여러 달에 기사가 나면 달마다 셈');
  }
  if (regionParticipations !== uniqueProjects) notes.push('여러 시도에 걸친 사업이 있어 시도별 합계와 전체 고유 사업 수가 다름');
  return notes;
}
