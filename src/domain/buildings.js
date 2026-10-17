// 건물 연령 판정. 건물별 준공일만 사용하고 학교의 설립·개교일로 대체하지 않는다.
// 연령은 안전등급이나 재건축 필요성의 판정이 아니다.
import { parseDate, isValidDate } from './dates.js';

export const AGE_STATUSES = ['over', 'uncertain', 'under', 'unknown'];

// 만 나이 방식: 기준일의 월일이 준공 월일보다 앞서면 한 살 적다.
// 2월 29일 준공은 평년에 3월 1일에 한 해가 찬 것으로 계산한다(관례 확인 필요).
export function completedYears(from, asOf) {
  const a = parseDate(from);
  const b = parseDate(asOf);
  const beforeAnniversary = b.m < a.m || (b.m === a.m && b.d < a.d);
  return b.y - a.y - (beforeAnniversary ? 1 : 0);
}

// classifyBuildingAge(building, asOf, threshold=40) -> {status, minAge, maxAge, reason, basis}
//   status: over(확정) | under(제외) | uncertain(연도만 알아 경계에 걸침) | unknown(준공 정보 없음·모순)
export function classifyBuildingAge(building, asOf, threshold = 40) {
  if (!isValidDate(asOf)) throw new Error(`기준일 asOf가 필요함(YYYY-MM-DD): ${asOf}`);
  const date = building.completion_date;
  const year = building.completion_year;
  const precision = building.date_precision;
  const unknown = (reason) => ({ status: 'unknown', minAge: null, maxAge: null, reason, basis: null });

  if (date && year !== null && year !== undefined && Number(date.slice(0, 4)) !== year) {
    return unknown(`준공일 ${date}와 준공연도 ${year}가 서로 다름 — 확인 필요`);
  }

  let earliest;
  let latest;
  let basis;
  // 날짜 정밀도가 day일 때만 월일을 믿는다. year·unknown이면 연도 범위로 판정한다.
  if (date && precision === 'day') {
    earliest = latest = date;
    basis = 'completion_date';
  } else if ((year !== null && year !== undefined) || date) {
    const y = year ?? Number(date.slice(0, 4));
    earliest = `${y}-01-01`;
    latest = `${y}-12-31`;
    basis = 'completion_year';
  } else {
    return unknown('준공일·준공연도 미확인');
  }

  if (earliest > asOf) return unknown(`준공 ${basis === 'completion_date' ? earliest : earliest.slice(0, 4)}이 기준일 ${asOf}보다 늦음 — 확인 필요`);
  const maxAge = completedYears(earliest, asOf);
  // 연도만 아는데 그해가 아직 끝나지 않았으면 가장 늦은 준공일을 기준일로 본다.
  const minAge = latest > asOf ? 0 : completedYears(latest, asOf);

  let status;
  let reason;
  if (minAge >= threshold) {
    status = 'over';
    reason = basis === 'completion_date' ? `준공일 기준 ${minAge}년` : `준공연도 기준 ${minAge}~${maxAge}년, 모두 ${threshold}년 이상`;
  } else if (maxAge < threshold) {
    status = 'under';
    reason = basis === 'completion_date' ? `준공일 기준 ${maxAge}년` : `준공연도 기준 ${minAge}~${maxAge}년, 모두 ${threshold}년 미만`;
  } else {
    status = 'uncertain';
    reason = `준공연도만 확인(${earliest.slice(0, 4)}년) — ${minAge}~${maxAge}년으로 ${threshold}년 여부를 확정할 수 없음`;
  }
  return { status, minAge, maxAge, reason, basis };
}

// summarizeBuildings(snapshot, {asOf, threshold, regions, schoolLevels})
// 건물 수(building_id)와 해당 학교 수(school_id)를 따로 센다. 철거·폐교 상태는 연령 판정과 따로 표시한다.
export function summarizeBuildings(snapshot, options = {}) {
  const { asOf = snapshot.as_of, threshold = 40, regions = null, schoolLevels = null } = options;
  const schoolsById = new Map(snapshot.schools.map((s) => [s.school_id, s]));

  const rows = [];
  for (const b of snapshot.buildings) {
    const school = schoolsById.get(b.school_id) ?? null;
    const regionCodes = school?.region_code ? [school.region_code] : [];
    if (regions && !(regionCodes.length === 0 ? regions.includes('unknown') : regionCodes.some((c) => regions.includes(c)))) continue;
    if (schoolLevels && !schoolLevels.includes(school?.school_level ?? 'unknown')) continue;
    const age = classifyBuildingAge(b, asOf, threshold);
    rows.push({
      building_id: b.building_id,
      building_name: b.name,
      school_id: b.school_id,
      school_name: school?.name ?? null,
      school_level: school?.school_level ?? 'unknown',
      region_code: regionCodes[0] ?? null,
      completion_date: b.completion_date,
      completion_year: b.completion_year,
      date_precision: b.date_precision,
      building_status: b.status,
      verified_at: b.verified_at,
      source_ids: b.source_ids,
      age_status: age.status,
      min_age: age.minAge,
      max_age: age.maxAge,
      age_reason: age.reason,
      // 기본 목록: 연령 기준을 넘고 사용 중이거나 상태 미확인인 건물. 철거·폐교는 별도로 센다.
      listed: age.status === 'over' && (b.status === 'in_use' || b.status === 'unknown'),
    });
  }

  const count = (list) => ({ buildings: list.length, schools: new Set(list.map((r) => r.school_id)).size });
  const byAge = Object.fromEntries(AGE_STATUSES.map((s) => [s, count(rows.filter((r) => r.age_status === s))]));
  const overRows = rows.filter((r) => r.age_status === 'over');
  const byStatusAmongOver = Object.fromEntries(
    ['in_use', 'demolished', 'closed', 'unknown'].map((s) => [s, count(overRows.filter((r) => r.building_status === s))]),
  );

  const notes = [
    `기준일 ${asOf} · 기준 ${threshold}년 · 건물별 준공일 기준(개교일로 대체하지 않음)`,
    '연령은 안전등급·재건축 필요성 판정이 아님',
  ];
  if (byAge.uncertain.buildings > 0) notes.push(`준공연도만 확인되어 ${threshold}년 여부 미확정 ${byAge.uncertain.buildings}동`);
  if (byAge.unknown.buildings > 0) notes.push(`준공 정보 미확인 ${byAge.unknown.buildings}동`);
  if (snapshot.as_of && asOf !== snapshot.as_of) notes.push(`원자료 기준일 ${snapshot.as_of}와 조회 기준일 ${asOf}가 다름`);

  return {
    is_demo: snapshot.is_demo,
    query_as_of: asOf,
    data_as_of: snapshot.as_of,
    threshold,
    total: count(rows),
    listed: count(rows.filter((r) => r.listed)),
    byAge,
    byStatusAmongOver,
    rows,
    notes,
  };
}
