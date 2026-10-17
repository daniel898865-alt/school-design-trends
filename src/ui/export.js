/** Presentation-only exports. Rows and counts are supplied by the data provider. */

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function validateInput({ columns, rows, metadata = {} }) {
  if (!Array.isArray(columns) || columns.length === 0 ||
      columns.some(column => !column || typeof column.key !== 'string')) {
    throw new TypeError('내보내기 열의 key가 필요합니다.');
  }
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new TypeError('내보내기 행은 객체 배열이어야 합니다.');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('내보내기 메타데이터는 객체여야 합니다.');
  }
  const keys = columns.map(column => column.key);
  if (new Set(keys).size !== keys.length) throw new TypeError('내보내기 열의 key는 고유해야 합니다.');
  return {
    columns,
    rows,
    // A missing context is visible instead of silently looking like verified data.
    metadata: { is_demo: null, as_of: null, source: null, filters: null, ...metadata },
  };
}

function csvCell(value) {
  let text = cellText(value);
  // Spreadsheet applications can interpret a formula after leading whitespace.
  // Preserve actual numeric values; protect every string, including headings.
  if (typeof value !== 'number' &&
      (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\s\uFEFF]*[\t\r\n]/u.test(text))) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * UTF-8 BOM + RFC 4180 CSV. Metadata is repeated in dedicated columns so there
 * are exactly rows.length data records. For an empty dataset only, values are
 * included in metadata headings; no synthetic data record is inserted.
 */
export function serializeCsv(input) {
  const { columns, rows, metadata } = validateInput(input);
  const metaEntries = Object.entries(metadata);
  const metaHeaders = metaEntries.map(([key, value]) =>
    rows.length ? `_meta.${key}` : `_meta.${key} = ${value === null ? '미제공' : cellText(value)}`);
  const header = [...columns.map(column => column.label ?? column.key), ...metaHeaders];
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const values = [...columns.map(column => row[column.key]), ...metaEntries.map(([, value]) => value)];
    lines.push(values.map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function markdownCell(value) {
  return cellText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/([\\`*_[\]{}()|!~])/gu, '\\$1')
    .replace(/\r\n|\r|\n/gu, '<br>');
}

/** Markdown context and a data table, without treating imported strings as HTML. */
export function serializeMarkdown(input) {
  const { columns, rows, metadata } = validateInput(input);
  const lines = ['# 학교 설계 동향 · 내보내기', '', '## 조회 조건', '', '| 항목 | 값 |', '| --- | --- |'];
  for (const [key, value] of Object.entries(metadata)) {
    lines.push(`| ${markdownCell(key)} | ${markdownCell(value === null ? '미제공' : value)} |`);
  }
  lines.push('', `자료 행 수: ${rows.length}`, '');
  if (metadata.is_demo === true) {
    lines.push('**가상 예시 자료입니다. 실제 통계나 설계 동향을 나타내지 않습니다.**', '');
  }
  lines.push('## 자료', '',
    `| ${columns.map(column => markdownCell(column.label ?? column.key)).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    lines.push(`| ${columns.map(column => markdownCell(row[column.key])).join(' | ')} |`);
  }
  if (rows.length === 0) lines.push('', '현재 조건에 해당하는 자료가 없습니다.');
  return `${lines.join('\n')}\n`;
}

/** Download a locally generated file; no data is sent to another service. */
export function downloadExport(content, filename, mime = 'text/plain;charset=utf-8') {
  const file = new Blob([content], { type: mime });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = String(filename).replace(/[\\/:*?"<>|\u0000-\u001F]/gu, '_');
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Let the browser begin reading the Blob before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
