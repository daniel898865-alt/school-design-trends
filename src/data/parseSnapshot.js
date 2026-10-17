// Snapshot 입력 검증·정규화·중복 제거.
// 미확인 값은 null(목록은 [])로 두고 0이나 임의 값으로 채우지 않는다. 원본 레코드는 _raw에 보존한다.
import { ENUMS, KINDS, KIND_NAMES, SCHEMA_VERSION } from './schema.js';
import { cleanText, normalizeRegion, normalizeSchoolLevel, normalizeTitle } from './normalize.js';
import { isValidDate, toDateOnly } from '../domain/dates.js';

const TOP_LEVEL = ['schema_version', 'is_demo', 'as_of', 'generated_at', ...KIND_NAMES, 'coverage'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function createReporter() {
  const errors = [];
  const warnings = [];
  const report = (level, code, path, message, id = null) => {
    (level === 'error' ? errors : warnings).push({ level, code, path, id, message });
  };
  return { errors, warnings, report };
}

// parseSnapshot(text) -> { snapshot, errors[], warnings[] }
// 객체를 넘겨도 된다(이미 JSON.parse한 값, CSV에서 조립한 값).
export function parseSnapshot(input) {
  const ctx = createReporter();
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input.replace(/^﻿/, ''));
    } catch (e) {
      ctx.report('error', 'invalid_json', '$', `JSON을 읽을 수 없음: ${e.message}`);
      return { snapshot: null, errors: ctx.errors, warnings: ctx.warnings };
    }
  }
  if (!isObject(data)) {
    ctx.report('error', 'invalid_root', '$', 'Snapshot은 JSON 객체여야 함');
    return { snapshot: null, errors: ctx.errors, warnings: ctx.warnings };
  }
  const snapshot = buildSnapshot(data, ctx.report);
  return { snapshot, errors: ctx.errors, warnings: ctx.warnings };
}

function buildSnapshot(data, report) {
  for (const key of Object.keys(data)) {
    if (!TOP_LEVEL.includes(key)) report('warning', 'unknown_field', key, `규격에 없는 최상위 필드 "${key}"`);
  }

  if (!('schema_version' in data)) report('warning', 'missing_field', 'schema_version', 'schema_version 누락');
  else if (data.schema_version !== SCHEMA_VERSION) {
    report('warning', 'schema_version', 'schema_version', `지원 버전 ${SCHEMA_VERSION}과 다른 버전 "${data.schema_version}"`);
  }

  let isDemo = null;
  if (typeof data.is_demo === 'boolean') isDemo = data.is_demo;
  else report('error', 'missing_field', 'is_demo', 'is_demo(true/false) 누락 또는 형식 오류 — 가상 자료 여부를 확인할 수 없음');

  let asOf = null;
  if (isValidDate(data.as_of)) asOf = data.as_of;
  else report('error', 'invalid_date', 'as_of', `자료 기준일 as_of가 YYYY-MM-DD 날짜가 아님: ${JSON.stringify(data.as_of)}`);

  let generatedAt = cleanText(data.generated_at ?? null);
  if (generatedAt !== null && toDateOnly(generatedAt) === null) {
    report('warning', 'invalid_datetime', 'generated_at', `generated_at 형식 오류: ${JSON.stringify(generatedAt)}`);
    generatedAt = null;
  }

  const tables = {};
  for (const kind of KIND_NAMES) tables[kind] = readTable(kind, data[kind], report);

  checkReferences(tables, report);
  flagPossibleDuplicates(tables, report);

  return {
    schema_version: data.schema_version ?? null,
    is_demo: isDemo,
    as_of: asOf,
    generated_at: generatedAt,
    ...Object.fromEntries(KIND_NAMES.map((k) => [k, [...tables[k].values()]])),
    coverage: readCoverage(data.coverage, report),
  };
}

function readCoverage(raw, report) {
  if (!isObject(raw)) {
    report('warning', 'missing_field', 'coverage', 'coverage 누락 — 자료 범위와 한계를 표시할 수 없음');
    return { scope: null, source_status: null, limitations: [] };
  }
  const limitations = Array.isArray(raw.limitations) ? raw.limitations.filter((s) => typeof s === 'string') : [];
  return { scope: cleanText(raw.scope ?? null), source_status: cleanText(raw.source_status ?? null), limitations };
}

function readTable(kind, rows, report) {
  const table = new Map();
  if (rows === undefined) {
    report('warning', 'missing_field', kind, `${kind} 누락 — 빈 배열로 처리`);
    return table;
  }
  if (!Array.isArray(rows)) {
    report('error', 'invalid_type', kind, `${kind}는 배열이어야 함`);
    return table;
  }
  const { id: idField } = KINDS[kind];
  rows.forEach((row, i) => {
    const rec = normalizeRecord(kind, row, `${kind}[${i}]`, report);
    if (!rec) return;
    const id = rec[idField];
    const prev = table.get(id);
    if (!prev) table.set(id, rec);
    else if (kind === 'projects') table.set(id, mergeProjects(prev, rec, `${kind}[${i}]`, report));
    else if (sameRecord(prev, rec)) report('warning', 'duplicate_identical', `${kind}[${i}]`, `같은 ${idField} "${id}"의 동일 레코드를 하나로 합침`, id);
    else report('error', 'duplicate_id', `${kind}[${i}]`, `${idField} "${id}"가 중복되고 내용이 다름 — 첫 레코드만 사용`, id);
  });
  return table;
}

function defaultFor(type) {
  if (type === 'list' || type === 'objects') return [];
  if (type === 'level') return 'unknown';
  if (type.startsWith('enum:')) return ENUMS[type.slice(5)].includes('unknown') ? 'unknown' : null;
  return null;
}

export function normalizeRecord(kind, row, path, report) {
  const spec = KINDS[kind];
  if (!isObject(row)) {
    report('error', 'invalid_type', path, '레코드는 객체여야 함');
    return null;
  }
  const id = cleanText(row[spec.id] ?? null);
  if (typeof id !== 'string') {
    report('error', 'missing_id', `${path}.${spec.id}`, `${spec.id} 누락 — 레코드를 제외함`);
    return null;
  }
  const out = { [spec.id]: id };
  const warn = (code, field, message) => report('warning', code, `${path}.${field}`, message, id);
  const fail = (code, field, message) => report('error', code, `${path}.${field}`, message, id);

  for (const [field, type] of Object.entries(spec.fields)) {
    if (kind === 'schools' && field === 'region_name') {
      if (!(field in row)) warn('missing_field', field, `${field} 누락`);
      continue; // region_code와 함께 처리
    }
    if (!(field in row)) {
      warn('missing_field', field, `${field} 누락`);
      out[field] = defaultFor(type);
      if (type !== 'region') continue;
    }
    out[field] = convert(type, row[field], field, row, kind, out, warn, fail);
  }
  for (const key of Object.keys(row)) {
    if (key !== spec.id && !(key in spec.fields)) {
      warn('unknown_field', key, `규격에 없는 필드 "${key}"`);
      out[key] = row[key];
    }
  }
  out._raw = row;
  return out;
}

function convert(type, raw, field, row, kind, out, warn, fail) {
  const v = cleanText(raw ?? null);
  switch (type) {
    case 'text':
      if (v === null || typeof v === 'string') return v;
      if (typeof v === 'number') {
        warn('type_coerced', field, `${field} 숫자를 문자열로 변환`);
        return String(v);
      }
      fail('invalid_type', field, `${field}는 문자열이어야 함`);
      return null;
    case 'date':
      if (v === null) return null;
      if (isValidDate(v)) return v;
      fail('invalid_date', field, `${field}가 YYYY-MM-DD 날짜가 아님: ${JSON.stringify(raw)}`);
      return null;
    case 'datetime':
      if (v === null) return null;
      if (toDateOnly(v) !== null) return v;
      fail('invalid_datetime', field, `${field}가 ISO 8601 날짜·시각이 아님: ${JSON.stringify(raw)}`);
      return null;
    case 'int':
      if (v === null) return null;
      if (Number.isInteger(v)) return v;
      if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
      fail('invalid_type', field, `${field}는 정수여야 함: ${JSON.stringify(raw)}`);
      return null;
    case 'list': {
      if (v === null) return [];
      if (!Array.isArray(v)) {
        fail('invalid_type', field, `${field}는 배열이어야 함`);
        return [];
      }
      const items = [];
      for (const item of v) {
        const s = cleanText(item);
        if (typeof s !== 'string') {
          if (s !== null) fail('invalid_type', field, `${field}의 항목은 문자열이어야 함`);
          continue;
        }
        if (items.includes(s)) warn('duplicate_item', field, `${field}에 "${s}"가 중복됨`);
        else items.push(s);
      }
      return items;
    }
    case 'objects':
      if (v === null) return [];
      if (!Array.isArray(v) || !v.every(isObject)) {
        fail('invalid_type', field, `${field}는 객체 배열이어야 함`);
        return [];
      }
      return v;
    case 'url':
      if (v === null) return null;
      if (typeof v === 'string' && isHttpUrl(v)) return v;
      warn('unsafe_url', field, `http/https가 아닌 링크를 제외함: ${JSON.stringify(raw)}`);
      return null;
    case 'level': {
      const { value, note } = normalizeSchoolLevel(raw);
      if (note) warn('normalized', field, note);
      return value;
    }
    case 'region': {
      const { code, name, note, conflict } = normalizeRegion(row.region_code, kind === 'schools' ? row.region_name : null);
      if (note) warn(conflict ? 'region_conflict' : 'normalized', field, note);
      if (kind === 'schools') out.region_name = name;
      return code;
    }
    case 'brn':
      if (v === null) return null;
      if (typeof v !== 'string') {
        fail('invalid_type', field, '사업자등록번호는 문자열로 입력해야 함(앞자리 0 보존) — null로 둠');
        return null;
      }
      if (!/^\d{10}$/.test(v.replace(/-/g, ''))) warn('brn_format', field, `사업자등록번호 형식(10자리)이 아님: "${v}"`);
      return v;
    default: {
      const name = type.slice(5);
      const allowed = ENUMS[name];
      if (v === null) return defaultFor(type);
      if (allowed.includes(v)) return v;
      if (allowed.includes('unknown')) {
        warn('invalid_enum', field, `${field} 값 "${v}"를 unknown으로 둠`);
        return 'unknown';
      }
      fail('invalid_enum', field, `${field} 값 "${v}"는 ${allowed.join(', ')} 중 하나여야 함`);
      return null;
    }
  }
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function stripRaw(rec) {
  const { _raw, ...rest } = rec;
  return rest;
}

function sameRecord(a, b) {
  return JSON.stringify(stripRaw(a)) === JSON.stringify(stripRaw(b));
}

// 같은 project_id의 레코드를 하나로 합친다. 이름만 비슷한 사업은 합치지 않는다(flagPossibleDuplicates).
function mergeProjects(a, b, path, report) {
  const id = a.project_id;
  const merged = { ...a };
  for (const [field, type] of Object.entries(KINDS.projects.fields)) {
    const x = a[field];
    const y = b[field];
    if (type === 'list') merged[field] = [...new Set([...x, ...y])];
    else if (type === 'objects') {
      const seen = new Set(x.map((o) => JSON.stringify(o)));
      merged[field] = [...x, ...y.filter((o) => !seen.has(JSON.stringify(o)))];
    } else if (x === null || (type === 'level' && x === 'unknown')) merged[field] = y;
    else if (y !== null && !(type === 'level' && y === 'unknown') && x !== y) {
      report('error', 'duplicate_conflict', `${path}.${field}`, `project_id "${id}"의 ${field} 값이 서로 다름(${JSON.stringify(x)} / ${JSON.stringify(y)}) — 첫 값 사용`, id);
    }
  }
  merged._raw = [a._raw, b._raw].flat();
  report('warning', 'merged_duplicate_project', path, `같은 project_id "${id}" 레코드를 사업 1건으로 합침`, id);
  return merged;
}

function checkReferences(tables, report) {
  for (const kind of KIND_NAMES) {
    const { id: idField, refs } = KINDS[kind];
    for (const rec of tables[kind].values()) {
      for (const [field, target] of Object.entries(refs)) {
        const values = Array.isArray(rec[field]) ? rec[field] : rec[field] === null ? [] : [rec[field]];
        for (const ref of values) {
          if (!tables[target].has(ref)) {
            report('warning', 'unknown_reference', `${kind}.${rec[idField]}.${field}`, `${field}의 "${ref}"가 ${target}에 없음`, rec[idField]);
          }
        }
      }
    }
  }
}

// 자동 병합하지 않고 검토 대상만 알린다.
function flagPossibleDuplicates(tables, report) {
  const groups = new Map();
  for (const p of tables.projects.values()) {
    const title = normalizeTitle(p.title);
    if (!title) continue;
    const key = `${title}|${[...p.school_ids].sort().join(',')}`;
    groups.set(key, [...(groups.get(key) ?? []), p.project_id]);
  }
  for (const ids of groups.values()) {
    if (ids.length > 1) {
      report('warning', 'possible_duplicate_project', 'projects', `제목과 학교가 같은 사업 ${ids.join(', ')} — 같은 사업인지 확인 필요(자동 병합하지 않음)`);
    }
  }
  const byUrl = new Map();
  for (const s of tables.sources.values()) {
    if (!s.url) continue;
    byUrl.set(s.url, [...(byUrl.get(s.url) ?? []), s.source_id]);
  }
  for (const ids of byUrl.values()) {
    if (ids.length > 1) report('warning', 'possible_duplicate_source', 'sources', `같은 URL의 출처 ${ids.join(', ')} — 같은 기사인지 확인 필요`);
  }
}
