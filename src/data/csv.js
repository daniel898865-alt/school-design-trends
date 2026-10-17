// CSV 입력. 한 파일에 한 종류(schools, projects 등)의 레코드를 담는다.
// 첫 줄은 규격의 필드 이름이다. 목록 필드(source_ids 등)는 ';'로 구분한다.
// topic_evidence·images처럼 객체 목록인 필드는 JSON 문자열로 적는다.
import { KINDS } from './schema.js';

// RFC 4180 방식: 따옴표 안의 쉼표·줄바꿈 허용, "" 는 따옴표 한 개.
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  const errors = [];
  let row = [];
  let field = '';
  let quoted = false;
  let line = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else { if (c === '\n') line++; field += c; }
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = ''; line++;
    } else field += c;
  }
  if (quoted) errors.push({ level: 'error', code: 'csv_unclosed_quote', path: `line ${line}`, id: null, message: '닫히지 않은 따옴표' });
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return { rows: rows.filter((r) => !(r.length === 1 && r[0] === '')), errors };
}

// recordsFromCsv(text, kind) -> { records[], errors[], warnings[] }
// 반환한 records를 Snapshot의 같은 이름 배열에 넣고 parseSnapshot으로 검증한다.
export function recordsFromCsv(text, kind) {
  const spec = KINDS[kind];
  const errors = [];
  const warnings = [];
  if (!spec) {
    errors.push({ level: 'error', code: 'unknown_kind', path: kind, id: null, message: `알 수 없는 종류 "${kind}"` });
    return { records: [], errors, warnings };
  }
  const { rows, errors: csvErrors } = parseCsv(text);
  errors.push(...csvErrors);
  if (rows.length === 0) {
    errors.push({ level: 'error', code: 'csv_empty', path: kind, id: null, message: 'CSV가 비어 있음' });
    return { records: [], errors, warnings };
  }
  const header = rows[0].map((h) => h.trim());
  const seenHeaders = new Set();
  let duplicateHeader = false;
  header.forEach((name, index) => {
    if (seenHeaders.has(name)) {
      duplicateHeader = true;
      errors.push({ level: 'error', code: 'csv_duplicate_header', path: `${kind}.csv header ${index + 1}`, id: null,
        message: `머리글 "${name}"가 중복됨 — 값을 덮어쓰지 않도록 입력 전체를 제외함` });
    }
    seenHeaders.add(name);
  });
  if (duplicateHeader) return { records: [], errors, warnings };
  if (!header.includes(spec.id)) {
    errors.push({ level: 'error', code: 'missing_id', path: `${kind}.csv`, id: null, message: `${spec.id} 열이 없음` });
    return { records: [], errors, warnings };
  }
  const records = [];
  rows.slice(1).forEach((cells, i) => {
    const path = `${kind}.csv line ${i + 2}`;
    if (cells.length !== header.length) {
      errors.push({ level: 'error', code: 'csv_column_count', path, id: null, message: `열 개수 ${cells.length}개가 머리글 ${header.length}개와 다름 — 행을 제외함` });
      return;
    }
    const rec = {};
    header.forEach((name, j) => {
      const type = spec.fields[name];
      const cell = cells[j].trim();
      if (type === 'list') rec[name] = cell === '' ? [] : cell.split(';').map((s) => s.trim()).filter(Boolean);
      else if (type === 'objects') {
        if (cell === '') rec[name] = [];
        else {
          try {
            rec[name] = JSON.parse(cell);
          } catch {
            errors.push({ level: 'error', code: 'invalid_json', path: `${path}.${name}`, id: null, message: `${name}의 JSON을 읽을 수 없음` });
            rec[name] = [];
          }
        }
      } else rec[name] = cell === '' ? null : cell;
    });
    records.push(rec);
  });
  return { records, errors, warnings };
}
