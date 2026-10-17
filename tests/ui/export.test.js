import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeCsv, serializeMarkdown } from '../../src/ui/export.js';

// Minimal independent CSV reader to verify records, quoted commas and newlines.
function readCsv(content) {
  const input = content.replace(/^\uFEFF/u, '');
  const records = [];
  let record = [], cell = '', quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && char === ',') {
      record.push(cell); cell = '';
    } else if (!quoted && char === '\r' && input[index + 1] === '\n') {
      record.push(cell); records.push(record); record = []; cell = ''; index += 1;
    } else cell += char;
  }
  assert.equal(quoted, false, 'closed CSV quote');
  assert.equal(cell, '', 'all records terminated');
  return records;
}

const columns = [{ key: 'name', label: '사업명' }, { key: 'count', label: '건수' }];
const metadata = {
  is_demo: true, as_of: '2026-10-17', date_basis: 'award_date', months: 36,
  source: ['가상 출처'], scope: '가상 자료', filters: { region: '11', query: '공간' },
};

test('CSV preserves quoted text, Unicode, embedded line breaks and exact dataset row count', () => {
  const rows = [{ name: '가상 "학교", 서울\n두 번째 줄', count: 2 }, { name: '', count: 0 }];
  const output = serializeCsv({ columns, rows, metadata });
  assert.ok(output.startsWith('\uFEFF'));
  const parsed = readCsv(output);
  assert.equal(parsed.length, rows.length + 1);
  assert.equal(parsed[1][0], rows[0].name);
  assert.equal(parsed[1][1], '2');
  assert.equal(parsed[2][1], '0');
  for (let rowIndex = 1; rowIndex < parsed.length; rowIndex += 1) {
    assert.equal(parsed[rowIndex][parsed[0].indexOf('_meta.is_demo')], 'true');
    assert.equal(parsed[rowIndex][parsed[0].indexOf('_meta.as_of')], metadata.as_of);
    assert.equal(parsed[rowIndex][parsed[0].indexOf('_meta.filters')], JSON.stringify(metadata.filters));
    assert.equal(parsed[rowIndex][parsed[0].indexOf('_meta.source')], JSON.stringify(metadata.source));
  }
});

test('CSV neutralizes spreadsheet formulas including leading whitespace, tabs, BOM and CR', () => {
  const dangerous = ['=SUM(1,2)', '  =1+1', '+cmd', '-1+1', '@SUM(A1)', '\tformula', ' \r=1', '\n=1', '\uFEFF=1'];
  const output = readCsv(serializeCsv({ columns, rows: dangerous.map(name => ({ name, count: -3 })), metadata }));
  dangerous.forEach((value, index) => {
    assert.equal(output[index + 1][0], `'${value}`);
    assert.equal(output[index + 1][1], '-3', 'typed numbers remain numeric');
  });
  const withHostileContext = readCsv(serializeCsv({
    columns: [{ key: 'name', label: '=IMPORT("attack")' }],
    rows: [{ name: '안전' }], metadata: { source: '\t=ATTACK()' },
  }));
  assert.ok(withHostileContext[0][0].startsWith("'="));
  assert.ok(withHostileContext[1][withHostileContext[0].indexOf('_meta.source')].startsWith("'\t="));
});

test('empty CSV keeps metadata in headings without inventing a data record', () => {
  const parsed = readCsv(serializeCsv({ columns, rows: [], metadata }));
  assert.equal(parsed.length, 1);
  assert.ok(parsed[0].includes('_meta.is_demo = true'));
  assert.ok(parsed[0].includes('_meta.as_of = 2026-10-17'));
  assert.ok(parsed[0].some(value => value.includes('가상 출처')));
  assert.ok(parsed[0].some(value => value.includes('"region":"11"')));
});

test('Markdown escapes imported HTML, links, pipes and line breaks while preserving context', () => {
  const hostile = '<img src=x onerror=alert(1)> | [click](javascript:alert(1))\nnext';
  const markdown = serializeMarkdown({ columns, rows: [{ name: hostile, count: 1 }], metadata });
  assert.ok(markdown.includes('&lt;img src=x onerror=alert\\(1\\)&gt;'));
  assert.ok(markdown.includes('\\| \\[click\\]\\(javascript:alert\\(1\\)\\)'));
  assert.ok(markdown.includes('<br>next'));
  assert.ok(!markdown.includes('<img'));
  assert.ok(!markdown.includes('[click]('));
  assert.ok(markdown.includes('가상 예시 자료입니다'));
  assert.ok(markdown.includes('2026-10-17'));
  assert.ok(markdown.includes('가상 출처'));
  assert.ok(markdown.includes('자료 행 수: 1'));
  assert.ok(markdown.includes('"region":"11"'));
});

test('Markdown distinguishes empty results and preserves missing context explicitly', () => {
  const markdown = serializeMarkdown({ columns, rows: [], metadata: {} });
  assert.ok(markdown.includes('자료 행 수: 0'));
  assert.ok(markdown.includes('현재 조건에 해당하는 자료가 없습니다'));
  assert.ok(markdown.includes('| as\\_of | 미제공 |'));
  assert.ok(!markdown.includes('가상 예시 자료입니다'));
});

test('serializers do not mutate rows or metadata and reject malformed contracts', () => {
  const rows = [{ name: '=1', count: 1 }];
  const before = JSON.stringify({ rows, metadata });
  serializeCsv({ columns, rows, metadata });
  serializeMarkdown({ columns, rows, metadata });
  assert.equal(JSON.stringify({ rows, metadata }), before);
  assert.throws(() => serializeCsv({ columns: [], rows, metadata }), TypeError);
  assert.throws(() => serializeCsv({ columns: [columns[0], columns[0]], rows, metadata }), TypeError);
  assert.throws(() => serializeMarkdown({ columns, rows: [null], metadata }), TypeError);
  assert.throws(() => serializeMarkdown({ columns, rows, metadata: null }), TypeError);
});
