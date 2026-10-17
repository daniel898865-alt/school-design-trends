// 당선 사무소 집계. 사업과 사무소는 다대다이며 공동 당선은 사무소마다 '참여 당선 건수' 1건으로 센다.
// 사무소명만으로 사업자등록번호를 추정하거나 비슷한 이름의 사무소를 자동으로 합치지 않는다.

const CORP_MARKS = /\(주\)|㈜|주식회사|\(유\)|유한회사|\(합\)|합자회사/g;
const squashName = (s) => (typeof s === 'string' ? s.replace(CORP_MARKS, '').replace(/[\s·.,()]/g, '').toLowerCase() : '');

// 사업자등록번호 형식 검사. 형식·검증번호 통과는 실재·영업 상태 확인과 다르다.
// 반환: null(미확인) | 'invalid_format' | 'checksum_mismatch' | 'format_ok'
export function checkBrnFormat(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'invalid_format';
  const digits = value.replace(/-/g, '');
  if (!/^\d{10}$/.test(digits)) return 'invalid_format';
  const d = [...digits].map(Number);
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = weights.reduce((acc, w, i) => acc + d[i] * w, 0);
  sum += Math.floor((d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9] ? 'format_ok' : 'checksum_mismatch';
}

// 이름·별칭이 겹치는 서로 다른 사무소. 같은 업체인지 사람이 확인해야 한다.
export function findSimilarFirms(firms) {
  const byName = new Map();
  for (const f of firms) {
    for (const n of new Set([f.name, ...(f.aliases ?? [])].map(squashName).filter(Boolean))) {
      byName.set(n, [...(byName.get(n) ?? []), f.firm_id]);
    }
  }
  const seen = new Set();
  const groups = [];
  for (const [name, ids] of byName) {
    const unique = [...new Set(ids)].sort();
    const key = unique.join('|');
    if (unique.length > 1 && !seen.has(key)) {
      seen.add(key);
      groups.push({ firm_ids: unique, matched_name: name });
    }
  }
  return groups;
}

// summarizeFirms(projects, snapshot) — projects는 filterProjects 결과(같은 필터를 그대로 사용).
export function summarizeFirms(projects, snapshot) {
  const firmsById = new Map(snapshot.firms.map((f) => [f.firm_id, f]));
  const rows = new Map();
  const unresolvedFirmRefs = [];
  let jointProjects = 0;
  let projectsWithoutFirm = 0;
  let projectsWithOnlyUnresolvedFirms = 0;

  for (const p of projects) {
    const ids = [...new Set(p.firm_ids ?? [])];
    // firms에 레코드가 없는 사무소는 참여 건수로 세지 않고 따로 보고한다(원래 참조는 사업에 그대로 남음).
    const resolved = ids.filter((id) => firmsById.has(id));
    for (const id of ids) if (!firmsById.has(id)) unresolvedFirmRefs.push({ project_id: p.project_id, firm_id: id });
    if (ids.length === 0) projectsWithoutFirm++;
    else if (resolved.length === 0) projectsWithOnlyUnresolvedFirms++;
    if (ids.length > 1) jointProjects++;
    for (const id of resolved) {
      if (!rows.has(id)) {
        const f = firmsById.get(id);
        rows.set(id, {
          firm_id: id,
          name: f.name,
          aliases: f.aliases,
          business_registration_number: f.business_registration_number,
          registration_status: f.registration_status ?? 'unknown',
          brn_format: checkBrnFormat(f.business_registration_number),
          official_url: f.official_url,
          source_ids: f.source_ids,
          verified_at: f.verified_at,
          participations: 0,
          solo_awards: 0,
          joint_awards: 0,
          project_ids: [],
        });
      }
      const row = rows.get(id);
      row.participations++;
      if (ids.length > 1) row.joint_awards++;
      else row.solo_awards++;
      row.project_ids.push(p.project_id);
    }
  }

  const firms = [...rows.values()].sort((a, b) => b.participations - a.participations || a.firm_id.localeCompare(b.firm_id));
  const participationTotal = firms.reduce((n, f) => n + f.participations, 0);
  const listedIds = new Set(firms.map((f) => f.firm_id));
  const similar = findSimilarFirms(snapshot.firms).filter((g) => g.firm_ids.some((id) => listedIds.has(id)));

  const notes = ['참여 당선 건수: 공동 당선은 참여한 사무소마다 1건씩 셈 — 사무소별 합계는 전체 사업 수와 다를 수 있음'];
  notes.push('당선 발표 기준이며 계약·낙찰과 다름. 시장점유율·수주액이 아님');
  if (projectsWithoutFirm > 0) notes.push(`당선 사무소 미확인 사업 ${projectsWithoutFirm}건`);
  if (unresolvedFirmRefs.length > 0) {
    notes.push(`firms에 없는 사무소 참조 ${unresolvedFirmRefs.length}건은 참여 건수에서 제외 — 이름·번호 미확인`);
  }
  if (similar.length > 0) notes.push(`이름이 겹치는 사무소 ${similar.length}쌍 — 같은 업체인지 확인 필요(자동 병합하지 않음)`);

  return {
    uniqueProjects: projects.length,
    projectsWithFirm: projects.length - projectsWithoutFirm - projectsWithOnlyUnresolvedFirms,
    projectsWithoutFirm,
    projectsWithOnlyUnresolvedFirms,
    jointProjects,
    participationTotal,
    firms,
    unresolvedFirmRefs,
    similarFirms: similar,
    notes,
  };
}
