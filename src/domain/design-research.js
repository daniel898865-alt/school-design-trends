// 설계 리서치: 연도별 동향 집계, 후보 검색, 결과 JSON 검증과 Markdown 변환.
// - award_year는 작품집 수록연도이며 실제 당선일·준공일이 아니다. 날짜로 바꾸거나 채우지 않는다.
// - 정보 없음(no_information)과 명시적 불일치(mismatch)를 구분한다. 태그·키워드가 없다는 이유로 불일치를 만들지 않는다.
// - 종합점수·순위를 만들지 않는다. 일치/차이/정보 없음 개수만 센다.
// 이 모듈은 브라우저(UI)와 Node(도구·테스트)에서 같이 쓰는 순수 함수만 담는다.

export const RESULT_SCHEMA = 'school-design-research-result';
export const RESULT_VERSION = '0.1';
export const YEARBOOK_YEARS = [2023, 2024, 2025];

export const LABELS = {
  projectType: { new: '신축', extension: '증축', redesign: '공간재구조화', green_smart: '그린스마트', unknown: '미확인' },
  facilityKind: { school: '학교', kindergarten: '유치원', special_school: '특수학교', housing: '사택·관사', education_facility: '청사·교육시설', unknown: '미확인' },
  schoolLevel: { elementary: '초등학교', middle: '중학교', high: '고등학교', combined: '통합학교', other: '기타', unknown: '미확인' },
  status: { match: '부합', mismatch: '불일치', no_information: '정보 없음', numeric_difference: '수치 차이' },
  evidence: { fact: '자료에서 확인한 사실', ai_interpretation: 'AI 해석', proposal: '검토할 제안' },
  basis: { new_reading: '새로 읽음', reused_analysis: '기존 분석 재사용', tool_run: '도구 실행', not_applicable: '해당 없음' },
  stepStatus: { done: '수행', partial: '부분 수행', not_done: '수행하지 못함', reused: '기존 결과 재사용' },
  readability: { legible: '읽힘', uncertain: '일부 불확실', illegible: '읽지 못함' },
};
export const DIMENSIONS = [
  ['site_layout', '대지·배치'], ['circulation', '동선'], ['learning_space', '학습공간'],
  ['common_space', '공용공간'], ['community_use', '주민 이용'], ['application_conditions', '적용 조건'],
];
const DIMENSION_IDS = DIMENSIONS.map(([id]) => id);
const dimensionLabel = Object.fromEntries(DIMENSIONS);
export const STEP_IDS = ['page_map', 'extraction', 'candidate_search', 'evidence', 'report'];
export const STEP_LABELS = { page_map: '① PDF 쪽 구성 확인', extraction: '② 학교 조건·공간 전략 추출', candidate_search: '③ 후보 검색(도구 실행)', evidence: '④ 후보 근거 확인', report: '⑤ 보고서·result.json 작성' };

// ───────────────── 공통 보조 ─────────────────
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '';
const positive = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const known = (v) => (typeof v === 'string' && v !== '' && v !== 'unknown' ? v : null);

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 100) / 100;
}
function countBy(list, keyOf) {
  const out = {};
  for (const item of list) { const k = keyOf(item) ?? 'unknown'; out[k] = (out[k] ?? 0) + 1; }
  return out;
}
function metricSummary(projects, pick) {
  const values = projects.map(pick).map(positive).filter((v) => v !== null);
  return {
    n: values.length, missing: projects.length - values.length,
    median: median(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
  };
}
function yearOf(p) {
  const v = p?.award_year;
  const n = typeof v === 'string' && /^\d{4}$/.test(v.trim()) ? Number(v.trim()) : v;
  return Number.isInteger(n) ? n : null;
}

// ───────────────── ① 연도별 동향(전체 정량 집계) ─────────────────
// summarizeYearTrends(projects) -> { years: [...], total, unknown_year, notes }
// 학교(facility_kind: school)와 다른 시설을 나누고, 사업유형·학교급·규모는 학교만 집계한다.
// 정보가 없는 건수를 항상 함께 낸다. 태그·사무소가 한 건도 없는 연도는 '미부여'로 표시하며 0건 사례라고 쓰지 않는다.
export function summarizeYearTrends(projects, years = YEARBOOK_YEARS) {
  const list = Array.isArray(projects) ? projects : [];
  const out = years.map((year) => {
    const all = list.filter((p) => yearOf(p) === year);
    const schools = all.filter((p) => p.facility_kind === 'school');
    const others = all.filter((p) => p.facility_kind !== 'school');
    const present = (pick) => all.filter(pick).length;
    const coverage = (n) => (n === 0 ? 'none' : n === all.length ? 'full' : 'partial');
    const tags = present((p) => (p.design_tags ?? []).length > 0);
    const firms = present((p) => (p.firm_ids ?? []).length > 0);
    return {
      year,
      total: all.length,
      facility: countBy(all, (p) => known(p.facility_kind)),
      school_n: schools.length,
      other_n: others.length,
      by_type: countBy(schools, (p) => known(p.project_type)),
      by_level: countBy(schools, (p) => known(p.school_level)),
      metrics: {
        site_area: metricSummary(schools, (p) => p.metrics?.site_area),
        gross_floor_area: metricSummary(schools, (p) => p.metrics?.gross_floor_area),
        floors_above: metricSummary(schools, (p) => p.metrics?.floors_above),
      },
      info: {
        summary: present((p) => str(p.summary)),
        jury_notes: present((p) => (p.jury_notes ?? []).length > 0),
        design_tags: { assigned: tags, not_assigned: all.length - tags, coverage: coverage(tags) },
        firm_links: { assigned: firms, not_assigned: all.length - firms, coverage: coverage(firms) },
      },
    };
  });
  const counted = out.reduce((n, y) => n + y.total, 0);
  return {
    years: out,
    total: list.length,
    counted,
    unknown_year: list.length - counted,
    notes: [
      '연도는 작품집 수록연도이며 실제 당선일·준공일이 아닙니다.',
      '사업유형·학교급·규모는 학교(facility_kind=school)만 집계하고 유치원·특수학교·사택·청사 등은 별도로 셉니다.',
      '사업유형 분류는 작품집 장 구성이 연도별로 달라 같은 이름이 아니면 합치지 않았습니다(2023 그린스마트, 2024 공간재구조화 등).',
      '설계 태그·사무소 연결이 없는 연도는 미부여(정보 없음)이며 0건이라는 뜻이 아닙니다.',
      '이 표는 수록된 당선작의 집계입니다. 실제 연간 발주량·준공 실적이나 전국 동향이 아닙니다.',
    ],
  };
}

// ───────────────── ③ 후보 검색 ─────────────────
export const NUMERIC_TOLERANCE = { ratio: 0.85 }; // 두 값의 작은 쪽/큰 쪽이 이 이상이면 '부합'(층수는 같을 때만)
// 학교 이름: 제목의 첫 단어(예: '지금고 교사동' → '지금고'). 같은 이름이라는 사실만으로 같은 사업이라고 보지 않는다.
const schoolName = (t) => String(t ?? '').trim().split(/\s+/)[0].replace(/등학교$|학교$/, '');
const juryExcluded = (p) => (p.data_issues ?? []).some((s) => typeof s === 'string' && s.startsWith('심사평 분석 제외'));
const uncertainReading = (p) => (p.data_issues ?? []).filter((s) => typeof s === 'string' && s.startsWith('판독 불확실')).length;
const searchableText = (p) => {
  const parts = [p.summary, p.concept_title];
  if (!juryExcluded(p)) for (const j of p.jury_notes ?? []) parts.push(j?.note);
  return parts.filter(str).join(' ');
};

// searchCandidates(projects, query) -> {...}
// query: { exclude_ids: [], required: {school_level, project_type, facility_kind}, preferred: {school_level, project_type,
//          facility_kind, site_area, gross_floor_area, floors_above}, keywords: [{id,label,patterns:[]}], limit }
export function searchCandidates(projects, query = {}) {
  const list = Array.isArray(projects) ? projects : [];
  const excludeIds = new Set(query.exclude_ids ?? []);
  const required = query.required ?? {};
  const preferred = query.preferred ?? {};
  const keywords = (query.keywords ?? []).filter((k) => k && str(k.id) && Array.isArray(k.patterns) && k.patterns.length);
  const limit = Number.isInteger(query.limit) && query.limit > 0 ? query.limit : 20;

  const excluded = [];
  const anomalies = [];
  const inputs = list.filter((p) => excludeIds.has(p.project_id));
  for (const id of excludeIds) {
    if (!inputs.some((p) => p.project_id === id)) anomalies.push({ project_id: id, kind: 'exclude_id_not_found', note: '제외하려는 입력 사업 ID가 자료에 없음' });
  }
  const excludedIds = new Set();
  for (const p of inputs) { excluded.push({ project_id: p.project_id, reason: 'input_project', title: p.title }); excludedIds.add(p.project_id); }

  // 같은 학교의 교사동 신축과 체육관 증축처럼 이름·주소·학교급이 같아도 별도 사업일 수 있다.
  // 그래서 입력 project_id만 제외하고, 겹치는 사업은 후보에 남긴 채 '중복 확인 필요'로 알린다(확정해서 제외하지 않는다).
  const duplicateCheck = [];
  const duplicateById = new Map();
  for (const p of list) {
    if (excludedIds.has(p.project_id)) continue;
    for (const inp of inputs) {
      const reasons = [];
      if (schoolName(p.title) !== '' && schoolName(p.title) === schoolName(inp.title)) reasons.push('same_school_name');
      const loc = p.metrics?.location;
      const sameLocation = str(loc) && loc === inp.metrics?.location;
      if (sameLocation && p.school_level === inp.school_level) reasons.push('same_location_same_level');
      if (reasons.length) {
        const entry = { project_id: p.project_id, title: p.title, of: inp.project_id, reasons, same_project_type: p.project_type === inp.project_type,
          note: '입력 사업과 이름·주소·학교급이 겹치지만 별도 사업(예: 같은 학교의 다른 동 신축·증축)일 수 있어 후보에서 제외하지 않음. 같은 사업인지 원문으로 확인 필요' };
        duplicateCheck.push(entry);
        duplicateById.set(p.project_id, [...(duplicateById.get(p.project_id) ?? []), entry]);
      } else if (sameLocation) {
        // 같은 위치인데 학교급이 다르면 위치 입력 오류 가능성 → 이상 징후로 알린다(제외하지 않음).
        anomalies.push({ project_id: p.project_id, kind: 'same_location_different_project', title: p.title, of: inp.project_id, note: '입력 사업과 같은 위치가 적혀 있으나 학교급·이름이 다름(위치 입력 오류 가능성, 수정하지 않음)' });
      }
    }
  }

  const requiredKeys = ['school_level', 'project_type', 'facility_kind'].filter((k) => known(required[k]));
  const requiredExcluded = { by_key: {}, count: 0 };
  const pool = [];
  for (const p of list) {
    if (excludedIds.has(p.project_id)) continue;
    let failed = null;
    for (const k of requiredKeys) {
      const v = known(p[k]);
      if (v !== null && v !== required[k]) { failed = k; break; } // 정보 없음(미확인)은 걸러 내지 않는다
    }
    if (failed) { requiredExcluded.by_key[failed] = (requiredExcluded.by_key[failed] ?? 0) + 1; requiredExcluded.count++; continue; }
    pool.push(p);
  }

  const candidates = pool.map((p) => {
    const criteria = [];
    for (const k of ['school_level', 'project_type', 'facility_kind']) {
      if (!known(preferred[k])) continue;
      const v = known(p[k]);
      const status = v === null ? 'no_information' : v === preferred[k] ? 'match' : 'mismatch';
      criteria.push({ key: k, status, value: v, wanted: preferred[k] });
    }
    for (const k of ['site_area', 'gross_floor_area', 'floors_above']) {
      const want = positive(preferred[k]);
      if (want === null) continue;
      const have = positive(p.metrics?.[k]);
      if (have === null) { criteria.push({ key: k, status: 'no_information', value: null, wanted: want }); continue; }
      if (k === 'floors_above') {
        criteria.push({ key: k, status: have === want ? 'match' : 'numeric_difference', value: have, wanted: want, difference: have - want });
      } else {
        const ratio = Math.round((Math.min(have, want) / Math.max(have, want)) * 100) / 100;
        criteria.push({ key: k, status: ratio >= NUMERIC_TOLERANCE.ratio ? 'match' : 'numeric_difference', value: have, wanted: want, ratio_to_input: Math.round((have / want) * 100) / 100 });
      }
    }
    const text = searchableText(p);
    for (const kw of keywords) {
      if (!text) { criteria.push({ key: `keyword:${kw.id}`, label: kw.label ?? kw.id, status: 'no_information', detail: 'no_text' }); continue; }
      const hits = kw.patterns.filter((pat) => text.includes(pat));
      criteria.push(hits.length
        ? { key: `keyword:${kw.id}`, label: kw.label ?? kw.id, status: 'match', matched_terms: hits }
        // 글은 있으나 언급이 없는 것은 반대 근거가 아니다 → 정보 없음(언급 확인 안 됨)
        : { key: `keyword:${kw.id}`, label: kw.label ?? kw.id, status: 'no_information', detail: 'text_without_mention' });
    }
    const counts = { match: 0, mismatch: 0, no_information: 0, numeric_difference: 0 };
    for (const c of criteria) counts[c.status]++;
    return {
      project_id: p.project_id, title: p.title, award_year: yearOf(p), yearbook_page: p.yearbook_page ?? null,
      school_level: known(p.school_level), project_type: known(p.project_type), facility_kind: known(p.facility_kind),
      location: p.metrics?.location ?? null,
      site_area: positive(p.metrics?.site_area), gross_floor_area: positive(p.metrics?.gross_floor_area), floors_above: positive(p.metrics?.floors_above),
      criteria, counts,
      text_available: text !== '',
      jury_excluded: juryExcluded(p),
      uncertain_reading_notes: uncertainReading(p),
      design_tags_assigned: (p.design_tags ?? []).length > 0, // 태그는 근거로 쓰지 않고 부여 여부만 알린다
      duplicate_check_needed: duplicateById.has(p.project_id),
      duplicate_check_reasons: [...new Set((duplicateById.get(p.project_id) ?? []).flatMap((d) => d.reasons))],
    };
  });
  // 정렬은 일치 항목 수 → 명시적 불일치 수(적은 순) → 수록연도 → ID. 순위·점수가 아니다.
  candidates.sort((a, b) => b.counts.match - a.counts.match || a.counts.mismatch - b.counts.mismatch || (a.award_year ?? 0) - (b.award_year ?? 0) || a.project_id.localeCompare(b.project_id));
  return {
    snapshot_total: list.length,
    pool_size: pool.length,
    excluded,
    duplicate_check_needed: duplicateCheck,
    anomalies,
    required_excluded: requiredExcluded,
    total_candidates: candidates.length,
    candidates: candidates.slice(0, limit),
    notes: [
      '입력 project_id만 제외합니다. 이름·주소·학교급이 겹치는 사업은 별도 사업일 수 있어 후보에 남기고 "중복 확인 필요"로 알립니다.',
      '정렬은 일치 항목 수 기준이며 유사도 순위나 점수가 아닙니다.',
      '정보 없음은 불일치가 아닙니다. 태그가 없는 2024년 사례도 같은 기준(요약·심사평·구조 조건)으로 검색했습니다.',
      '설계 태그는 근거로 쓰지 않고 부여 여부만 표시합니다.',
      '키워드 일치는 요약·심사평 요지의 단서이며 원문 검증이 아닙니다.',
    ],
  };
}

// ───────────────── 결과 JSON 검증 ─────────────────
const FORBIDDEN_KEYS = /^(score|scores|rank|ranking|similarity_score|composite|total_score|fitness)$/i;
const PATH_LIKE = /[A-Za-z]:[\\/]|\\\\[^\s]|\/Users\/|\/home\/|data\/private/;
const LEVELS = ['fact', 'ai_interpretation', 'proposal'];
const STATUSES = ['match', 'mismatch', 'no_information', 'numeric_difference'];

function scan(value, path, errors) {
  if (Array.isArray(value)) value.forEach((v, i) => scan(v, `${path}[${i}]`, errors));
  else if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.test(k)) errors.push({ path: `${path}.${k}`, message: '종합점수·순위 필드는 허용하지 않습니다.' });
      scan(v, `${path}.${k}`, errors);
    }
  } else if (typeof value === 'string' && PATH_LIKE.test(value)) {
    errors.push({ path, message: '내부 경로로 보이는 문자열이 있습니다(공개 결과에 넣지 않습니다).' });
  }
}

// 출처 배열의 각 항목은 문자열이거나 page를 가진 객체여야 한다(null·빈 값 불가).
function checkSources(sources, path, errors) {
  if (sources === undefined) return;
  if (!Array.isArray(sources)) { errors.push({ path, message: 'sources는 배열이어야 합니다.' }); return; }
  sources.forEach((s, i) => {
    const ok = str(s) || (isObj(s) && str(s.page) && (s.readability === undefined || Object.keys(LABELS.readability).includes(s.readability)));
    if (!ok) errors.push({ path: `${path}[${i}]`, message: '출처는 문자열이거나 page(문자열)를 가진 객체여야 합니다(null 불가).' });
  });
}

// 어떤 입력이 와도 예외로 끝나지 않고 오류 목록으로 돌려준다.
export function validateResult(result) {
  try {
    return validateResultInner(result);
  } catch (error) {
    return { ok: false, errors: [{ path: '$', message: `검증 중 예기치 않은 형식 오류: ${String(error?.message ?? error).slice(0, 120)}` }], warnings: [] };
  }
}

function validateResultInner(result) {
  const errors = [];
  const warnings = [];
  const need = (cond, path, message) => { if (!cond) errors.push({ path, message }); return cond; };
  if (!need(isObj(result), '$', '결과가 JSON 객체가 아닙니다.')) return { ok: false, errors, warnings };
  scan(result, '$', errors);
  need(result.schema === RESULT_SCHEMA, '$.schema', `schema는 "${RESULT_SCHEMA}"여야 합니다.`);
  need(result.version === RESULT_VERSION, '$.version', `지원하는 version은 "${RESULT_VERSION}"입니다.`);
  need(str(result.title), '$.title', '제목이 필요합니다.');
  need(str(result.purpose), '$.purpose', '분석 목적이 필요합니다.');

  const status = result.status;
  if (need(isObj(status), '$.status', '검수 상태 정보가 필요합니다.')) {
    need(status.review === 'ai_draft_human_review_pending', '$.status.review', '이 버전은 "ai_draft_human_review_pending"(AI 작성·사람 검수 전)만 허용합니다. 사람 검수 완료로 표시하지 않습니다.');
    need(typeof status.demonstration === 'boolean', '$.status.demonstration', '시연 여부(true/false)가 필요합니다.');
    need(Array.isArray(status.notices) && status.notices.some((s) => str(s) && s.includes('검수 전')), '$.status.notices', '"검수 전"을 밝힌 안내 문구가 필요합니다.');
    need(str(status.year_basis_notice) && status.year_basis_notice.includes('수록'), '$.status.year_basis_notice', '연도가 작품집 수록 기준임을 밝혀야 합니다.');
  }

  const run = result.run;
  if (need(isObj(run), '$.run', '실행 기록이 필요합니다.')) {
    need(['demonstration', 'user_run'].includes(run.kind), '$.run.kind', 'run.kind는 demonstration 또는 user_run입니다.');
    need(['public_yearbook_excerpt', 'user_pdf'].includes(run.input_kind), '$.run.input_kind', 'run.input_kind는 public_yearbook_excerpt 또는 user_pdf입니다.');
    if (need(Array.isArray(run.steps) && run.steps.length > 0, '$.run.steps', '단계 기록이 필요합니다.')) {
      run.steps.forEach((s, i) => {
        need(STEP_IDS.includes(s?.id), `$.run.steps[${i}].id`, `단계 id는 ${STEP_IDS.join(', ')} 중 하나입니다.`);
        need(Object.keys(LABELS.stepStatus).includes(s?.status), `$.run.steps[${i}].status`, '단계 상태가 올바르지 않습니다.');
        need(['new_reading', 'reused_analysis', 'tool_run', 'not_applicable'].includes(s?.basis), `$.run.steps[${i}].basis`, '새 판독·기존 분석 재사용·도구 실행·해당 없음 중 하나로 구분해야 합니다.');
      });
    }
  }

  const input = result.input;
  if (need(isObj(input), '$.input', '입력 설계안 정보가 필요합니다.')) {
    need(str(input.label), '$.input.label', '입력 설계안 이름이 필요합니다.');
    need(Number.isInteger(input.page_count) && input.page_count > 0, '$.input.page_count', '입력 PDF 쪽 수(정수)가 필요합니다.');
    need(Array.isArray(input.page_map) && input.page_map.length > 0, '$.input.page_map', '쪽별 구성표가 필요합니다.');
    if (Array.isArray(input.page_map)) {
      input.page_map.forEach((row, i) => {
        if (!isObj(row)) { errors.push({ path: `$.input.page_map[${i}]`, message: '쪽 구성 행이 객체가 아닙니다(null 불가).' }); return; }
        need(Number.isInteger(row.pdf_page) && row.pdf_page > 0, `$.input.page_map[${i}].pdf_page`, 'pdf_page(1 이상의 정수)가 필요합니다.');
        need(str(row.kind), `$.input.page_map[${i}].kind`, '쪽 내용(kind)이 필요합니다.');
      });
    }
    if (Array.isArray(input.page_map) && Number.isInteger(input.page_count) && input.page_map.length !== input.page_count) {
      errors.push({ path: '$.input.page_map', message: `쪽별 구성표 ${input.page_map.length}행이 쪽 수 ${input.page_count}와 다릅니다(그림 수와 쪽 수를 구분하세요).` });
    }
    need(isObj(input.conditions), '$.input.conditions', '입력 학교 조건이 필요합니다.');
    if (Array.isArray(input.strategies)) {
      input.strategies.forEach((s, i) => {
        if (!isObj(s)) { errors.push({ path: `$.input.strategies[${i}]`, message: '공간 전략 항목이 객체가 아닙니다(null 불가).' }); return; }
        checkSources(s.sources, `$.input.strategies[${i}].sources`, errors);
        need(DIMENSION_IDS.includes(s?.dimension), `$.input.strategies[${i}].dimension`, `영역은 ${DIMENSION_IDS.join(', ')} 중 하나입니다.`);
        need(LEVELS.includes(s?.evidence_level), `$.input.strategies[${i}].evidence_level`, '근거 수준(fact/ai_interpretation/proposal)이 필요합니다.');
        if (s?.evidence_level === 'fact') need(Array.isArray(s.sources) && s.sources.length > 0, `$.input.strategies[${i}].sources`, '사실에는 입력 PDF 쪽 출처가 필요합니다.');
      });
    } else errors.push({ path: '$.input.strategies', message: '공간 전략 목록이 필요합니다.' });
  }

  const candidateIds = new Set();
  if (need(Array.isArray(result.candidates) && result.candidates.length > 0, '$.candidates', '후보 목록이 필요합니다.')) {
    result.candidates.forEach((c, i) => {
      need(str(c?.project_id), `$.candidates[${i}].project_id`, '후보 project_id가 필요합니다.');
      need(str(c?.reason), `$.candidates[${i}].reason`, '후보 선정 이유가 필요합니다.');
      need(Array.isArray(c?.info_missing), `$.candidates[${i}].info_missing`, '정보 없음 항목 목록(비어 있어도 배열)이 필요합니다.');
      candidateIds.add(c?.project_id);
    });
  }
  const exclusionIds = new Set();
  if (need(Array.isArray(result.exclusions), '$.exclusions', '제외 목록(입력 사업 포함)이 필요합니다.')) {
    result.exclusions.forEach((e, i) => { need(str(e?.project_id) && str(e?.reason), `$.exclusions[${i}]`, '제외 항목에는 project_id와 reason이 필요합니다.'); exclusionIds.add(e?.project_id); });
  }
  if (isObj(input) && str(input.excluded_project_id)) {
    need(exclusionIds.has(input.excluded_project_id), '$.exclusions', '입력 사업 ID가 제외 목록에 없습니다.');
    need(!candidateIds.has(input.excluded_project_id), '$.candidates', '입력 사업 자체가 후보에 들어 있습니다.');
  }
  for (const id of exclusionIds) need(!candidateIds.has(id), '$.candidates', `제외된 사업 ${id}이(가) 후보에 들어 있습니다.`);
  const selected = Array.isArray(result.selected) ? result.selected : [];
  if (need(Array.isArray(result.selected) && result.selected.length > 0, '$.selected', '비교할 후보(selected)가 필요합니다(배열).')) {
    result.selected.forEach((id, i) => need(candidateIds.has(id), `$.selected[${i}]`, `${id}은(는) 후보 목록에 없습니다.`));
    if (selected.length > 5) warnings.push({ path: '$.selected', message: '근거를 확인하는 후보는 기본 5건 이하를 권장합니다.' });
  }

  const cmp = result.comparison;
  if (need(isObj(cmp) && Array.isArray(cmp.rows) && cmp.rows.length > 0, '$.comparison.rows', '공통 비교표 행이 필요합니다.')) {
    cmp.rows.forEach((row, i) => {
      need(str(row?.item), `$.comparison.rows[${i}].item`, '비교 항목 이름이 필요합니다.');
      need(isObj(row?.values), `$.comparison.rows[${i}].values`, '후보별 값이 필요합니다.');
      for (const [id, cell] of Object.entries(row?.values ?? {})) {
        const p = `$.comparison.rows[${i}].values.${id}`;
        need(selected.includes(id), p, '비교표의 후보가 selected에 없습니다.');
        need(STATUSES.includes(cell?.status), `${p}.status`, `상태는 ${STATUSES.join(', ')} 중 하나입니다.`);
        if (cell?.status === 'mismatch') need(str(cell.source), `${p}.source`, '명시적 불일치에는 반대되는 내용의 출처(쪽)가 필요합니다. 근거가 없으면 정보 없음으로 쓰세요.');
      }
      for (const id of selected) if (!(isObj(row?.values) && id in row.values)) errors.push({ path: `$.comparison.rows[${i}].values`, message: `${id}의 값이 없습니다(정보 없음이면 status를 no_information으로 쓰세요).` });
    });
  }

  for (const key of ['similarities', 'differences']) {
    if (!need(Array.isArray(result[key]) && result[key].length > 0, `$.${key}`, `${key === 'similarities' ? '유사점' : '차이점'} 목록이 필요합니다.`)) continue;
    result[key].forEach((s, i) => {
      if (!isObj(s)) { errors.push({ path: `$.${key}[${i}]`, message: '항목이 객체가 아닙니다(null 불가).' }); return; }
      checkSources(s.sources, `$.${key}[${i}].sources`, errors);
      need(str(s?.text), `$.${key}[${i}].text`, '문장이 필요합니다.');
      need(LEVELS.includes(s?.evidence_level), `$.${key}[${i}].evidence_level`, '근거 수준이 필요합니다.');
      if (s?.evidence_level === 'fact') need(Array.isArray(s.sources) && s.sources.length > 0, `$.${key}[${i}].sources`, '사실에는 출처가 필요합니다.');
    });
  }
  if (need(Array.isArray(result.merits_burdens) && result.merits_burdens.length > 0, '$.merits_burdens', '장점과 운영상 부담 목록이 필요합니다.')) {
    result.merits_burdens.forEach((m, i) => need(str(m?.subject) && str(m?.merit) && str(m?.burden), `$.merits_burdens[${i}]`, '장점을 쓰면 함께 확인할 운영상 부담도 써야 합니다.'));
  }
  if (need(Array.isArray(result.proposals) && result.proposals.length > 0, '$.proposals', '조건부 제안 목록이 필요합니다.')) {
    result.proposals.forEach((p, i) => need(str(p?.text) && str(p?.conditions), `$.proposals[${i}]`, '제안에는 적용 전에 확인할 조건이 필요합니다.'));
  }
  if (need(Array.isArray(result.evidence) && result.evidence.length > 0, '$.evidence', '근거 기록이 필요합니다.')) {
    result.evidence.forEach((e, i) => {
      if (isObj(e)) checkSources(e.sources, `$.evidence[${i}].sources`, errors);
      need(str(e?.target), `$.evidence[${i}].target`, '근거 대상(input 또는 project_id)이 필요합니다.');
      need(['new_reading', 'reused_analysis'].includes(e?.basis), `$.evidence[${i}].basis`, '새로 읽은 것인지 기존 분석 재사용인지 구분해야 합니다.');
      need(str(e?.summary), `$.evidence[${i}].summary`, '직접 쓴 요약이 필요합니다.');
    });
  }
  need(Array.isArray(result.unconfirmed) && result.unconfirmed.length > 0, '$.unconfirmed', '확인하지 못한 사항 목록이 필요합니다(없으면 "없음 확인"이라고 적지 말고 한계를 적으세요).');
  return { ok: errors.length === 0, errors, warnings };
}

// ───────────────── Markdown 변환 ─────────────────
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '-';
const srcText = (sources) => (Array.isArray(sources) && sources.length ? sources.map((s) => (typeof s === 'string' ? s : `${s.page}${s.readability ? `(${LABELS.readability[s.readability] ?? s.readability})` : ''}`)).join(', ') : '출처 미기재');
const mark = (level) => ({ fact: '[사실]', ai_interpretation: '[AI 해석]', proposal: '[제안]' }[level] ?? '');

export function resultToMarkdown(result) {
  const r = result;
  const titleOf = (id) => r.candidates.find((c) => c.project_id === id)?.title ?? id;
  const L = [];
  L.push(`# ${r.title}`, '');
  for (const n of r.status.notices) L.push(`> ${n}`);
  L.push(`> ${r.status.year_basis_notice}`, '');
  L.push('## 1. 입력 자료와 분석 목적', '', `- 입력: ${r.input.label} (PDF ${r.input.page_count}쪽)`, `- 분석 목적: ${r.purpose}`, `- 실행: ${r.run.kind === 'demonstration' ? '시연(시험 입력)' : '사용자 실행'} · 입력 종류 ${r.run.input_kind === 'public_yearbook_excerpt' ? '공개 작품집 발췌' : '사용자 PDF'}`, '');
  L.push('| 쪽 | 인쇄 쪽 | 내용 | 도판 |', '|---|---|---|---|');
  for (const p of r.input.page_map) L.push(`| ${cell(p.pdf_page)} | ${cell(p.printed_page)} | ${cell(p.kind)} | ${cell(p.figures)} |`);
  L.push('', '### 실행 단계 기록', '', '| 단계 | 상태 | 근거 | 메모 |', '|---|---|---|---|');
  for (const s of r.run.steps) L.push(`| ${STEP_LABELS[s.id] ?? s.id} | ${LABELS.stepStatus[s.status]} | ${LABELS.basis[s.basis]} | ${cell(s.note)} |`);
  L.push('', '## 2. 입력 설계안의 학교 조건과 공간 전략', '', '**학교 조건**', '');
  for (const [k, v] of Object.entries(r.input.conditions)) L.push(`- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  L.push('', '| 영역 | 내용 | 근거 수준 | 출처(입력 PDF 쪽) |', '|---|---|---|---|');
  for (const s of r.input.strategies) L.push(`| ${dimensionLabel[s.dimension] ?? s.dimension} | ${cell(s.summary)}${s.uncertain ? ' (판독 불확실)' : ''} | ${LABELS.evidence[s.evidence_level]} | ${cell(srcText(s.sources))} |`);
  L.push('', '## 3. 선정한 후보와 선정 이유, 확인 한계', '', '| 후보 | 수록연도 | 선정 이유 | 정보 없음 항목 | 비고 |', '|---|---|---|---|---|');
  for (const id of r.selected) {
    const c = r.candidates.find((x) => x.project_id === id);
    L.push(`| ${cell(c.title)} (${c.project_id}) | ${cell(c.award_year)} | ${cell(c.reason)} | ${cell(c.info_missing.join(', ') || '없음 기재')} | ${cell([c.notes, c.duplicate_check].filter(Boolean).join(' / '))} |`);
  }
  const others = r.candidates.filter((c) => !r.selected.includes(c.project_id));
  if (others.length) { L.push('', '선정하지 않은 후보:', ''); for (const c of others) L.push(`- ${c.title} (${c.project_id}): ${c.reason}`); }
  L.push('', '제외한 사업:', '');
  for (const e of r.exclusions) L.push(`- ${e.project_id}: ${e.reason}`);
  L.push('', '## 4. 공통 비교표', '', `상태: ${Object.values(LABELS.status).join(' / ')}. 정보 없음은 해당 내용이 없다는 뜻이 아닙니다.`, '');
  L.push(`| 항목 | 입력 | ${r.selected.map((id) => cell(titleOf(id))).join(' | ')} |`, `|---|---|${r.selected.map(() => '---').join('|')}|`);
  for (const row of r.comparison.rows) {
    L.push(`| ${cell(row.item)} | ${cell(row.input)} | ${r.selected.map((id) => { const v = row.values[id]; return `**${LABELS.status[v.status]}** ${cell(v.note)}${v.source ? ` [${cell(v.source)}]` : ''}`; }).join(' | ')} |`);
  }
  L.push('', '## 5. 유사점·차이와 근거', '', '### 유사점', '');
  for (const s of r.similarities) L.push(`- ${mark(s.evidence_level)} ${s.text}${s.sources?.length ? ` (${srcText(s.sources)})` : ''}`);
  L.push('', '### 차이', '');
  for (const s of r.differences) L.push(`- ${mark(s.evidence_level)} ${s.text}${s.sources?.length ? ` (${srcText(s.sources)})` : ''}`);
  L.push('', '## 6. 장점과 함께 확인할 운영상 부담', '', '| 대상 | 건축적 장점(의도 기준) | 함께 확인할 운영상 부담 |', '|---|---|---|');
  for (const m of r.merits_burdens) L.push(`| ${cell(m.subject)} | ${cell(m.merit)} | ${cell(m.burden)} |`);
  L.push('', '## 7. 조건부 설계 제안 (검토용)', '');
  for (const p of r.proposals) L.push(`- [제안] ${p.text} — 적용 전 확인: ${p.conditions}`);
  L.push('', '## 8. 근거 기록', '', '| 대상 | 근거 방식 | 요약 | 출처 |', '|---|---|---|---|');
  for (const e of r.evidence) L.push(`| ${cell(e.target === 'input' ? '입력 설계안' : titleOf(e.target))} | ${LABELS.basis[e.basis]} | ${cell(e.summary)} | ${cell(srcText(e.sources))} |`);
  L.push('', '## 9. 확인하지 못한 사항과 사람의 판단이 필요한 사항', '');
  for (const u of r.unconfirmed) L.push(`- ${u}`);
  L.push('', '## 10. 검수 상태', '', `- ${r.status.notices.join(' ')}`, '- 이 보고서는 홈페이지가 만든 것이 아니라 Claude의 school-design-research 스킬이 만든 결과 파일입니다.', '');
  return L.join('\n');
}

// ───────────────── 향후 설계 방향 자료 검증 ─────────────────
// 예측이 아니라 '검토할 방향'이어야 하며, 관찰·해석·적용 조건·반대 근거/미확인 사항이 모두 있어야 한다.
const PREDICTION_CLAIM = /예측\s*(완료|했|한 결과|결과입니다)|전망이 확정|확실히\s*(늘|증가|감소)|반드시\s*(늘|증가)/;
export function validateDirections(data) {
  const errors = [];
  const need = (cond, path, message) => { if (!cond) errors.push({ path, message }); return cond; };
  if (!need(isObj(data), '$', '방향 자료가 JSON 객체가 아닙니다.')) return { ok: false, errors };
  scan(data, '$', errors);
  need(data.schema === 'school-design-research-directions', '$.schema', 'schema가 올바르지 않습니다.');
  need(data.review === 'ai_draft_human_review_pending', '$.review', 'AI 작성·사람 검수 전 상태만 허용합니다.');
  need(str(data.notice) && data.notice.includes('예측') && data.notice.includes('검수 전'), '$.notice', '예측이 아닌 검토할 방향이며 검수 전임을 밝혀야 합니다.');
  const caseIds = new Set();
  if (need(Array.isArray(data.analyzed_cases) && data.analyzed_cases.length > 0, '$.analyzed_cases', '분석 사례 목록이 필요합니다.')) {
    data.analyzed_cases.forEach((c, i) => {
      need(str(c?.project_id) && str(c?.title) && Number.isInteger(c?.award_year), `$.analyzed_cases[${i}]`, 'project_id, title, award_year가 필요합니다.');
      need(Array.isArray(c?.strategies) && c.strategies.length > 0 && c.strategies.every((s) => str(s?.text) && str(s?.source) && LEVELS.includes(s?.level)), `$.analyzed_cases[${i}].strategies`, '전략마다 text, source, level이 필요합니다.');
      caseIds.add(c?.project_id);
    });
  }
  if (need(Array.isArray(data.directions) && data.directions.length > 0, '$.directions', '설계 방향 목록이 필요합니다.')) {
    data.directions.forEach((d, i) => {
      for (const k of ['id', 'title', 'observation', 'interpretation', 'conditions', 'counter_or_unconfirmed']) need(str(d?.[k]), `$.directions[${i}].${k}`, `${k}가 필요합니다(관찰·해석·적용 조건·반대 근거/미확인을 함께 보여야 합니다).`);
      need(Array.isArray(d?.case_ids) && d.case_ids.length > 0 && d.case_ids.every((id) => caseIds.has(id)), `$.directions[${i}].case_ids`, '근거 사례는 analyzed_cases에 있어야 합니다.');
      need(Array.isArray(d?.sources) && d.sources.length > 0, `$.directions[${i}].sources`, '출처(쪽)가 필요합니다.');
      for (const k of ['title', 'observation', 'interpretation', 'conditions']) if (str(d?.[k]) && PREDICTION_CLAIM.test(d[k])) errors.push({ path: `$.directions[${i}].${k}`, message: '예측을 완료했다는 표현은 쓰지 않습니다.' });
    });
  }
  return { ok: errors.length === 0, errors };
}
