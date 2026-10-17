// 지역·학교급·식별자 정규화. 기준은 rules/에 두고 여기서는 적용만 한다.
import regionRules from '../../rules/regions.json' with { type: 'json' };
import levelRules from '../../rules/school_levels.json' with { type: 'json' };

export const SCHOOL_LEVELS = levelRules.levels.map((l) => l.value);
export const REGIONS = regionRules.regions;
export const UNKNOWN_REGION_LABEL = regionRules.unknown_label;

const squash = (s) => s.replace(/[\s·・.]/g, '').toLowerCase();

const regionByCode = new Map(REGIONS.map((r) => [r.code, r]));
const regionByName = new Map();
for (const r of REGIONS) {
  for (const name of [r.name, ...r.aliases]) regionByName.set(squash(name), r);
}

const levelByAlias = new Map();
for (const l of levelRules.levels) {
  for (const name of [l.value, l.label, ...l.aliases]) levelByAlias.set(squash(name), l.value);
}

// 빈 문자열·공백은 미확인(null)으로 본다.
export function cleanText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
}

export function regionName(code) {
  return regionByCode.get(code)?.name ?? null;
}

// 반환: { code, name, note }. note가 있으면 경고로 보고한다.
export function normalizeRegion(rawCode, rawName) {
  let code = rawCode;
  if (typeof code === 'number' && Number.isInteger(code)) code = String(code);
  code = cleanText(code);
  const name = cleanText(rawName);
  if (code !== null && typeof code !== 'string') {
    return { code: null, name: null, note: '시도 코드 형식은 문자열 또는 정수여야 함 — 지역 미확인으로 둠', conflict: false };
  }

  let fromCode = null;
  let note = null;
  if (code !== null) {
    const mapped = Object.hasOwn(regionRules.legacy_codes, code) ? regionRules.legacy_codes[code] : code;
    fromCode = regionByCode.get(mapped) ?? null;
    if (!fromCode) note = `알 수 없는 시도 코드 "${code}"`;
    else if (mapped !== code) note = `이전 시도 코드 "${code}"를 "${mapped}"로 변환`;
  }

  let fromName = null;
  if (typeof name === 'string') {
    fromName = regionByName.get(squash(name)) ?? null;
    if (!fromName && !fromCode) note = note ?? `알 수 없는 시도 이름 "${name}"`;
  }

  if (fromCode && fromName && fromCode.code !== fromName.code) {
    return { code: null, name: null, note: `시도 코드 "${code}"와 이름 "${name}"이 서로 달라 지역 미확인으로 둠`, conflict: true };
  }
  const region = fromCode ?? fromName;
  return { code: region?.code ?? null, name: region?.name ?? null, note, conflict: false };
}

// 반환: { value, note }. 목록에 없는 값은 unknown.
export function normalizeSchoolLevel(raw) {
  const v = cleanText(raw);
  if (v === null) return { value: 'unknown', note: null };
  if (typeof v !== 'string') return { value: 'unknown', note: `학교급 값의 형식이 문자열이 아님` };
  const found = levelByAlias.get(squash(v));
  if (found) return { value: found, note: found === v ? null : `학교급 "${v}"를 "${found}"로 변환` };
  return { value: 'unknown', note: `알 수 없는 학교급 "${v}"를 unknown으로 둠` };
}

export function normalizeTitle(title) {
  return typeof title === 'string' ? squash(title) : '';
}
