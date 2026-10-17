import test from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl } from '../../src/ui/dom.js';

test('external links allow only absolute HTTP(S) without embedded credentials', () => {
  assert.equal(safeUrl('https://example.org/a?q=school'), 'https://example.org/a?q=school');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///C:/secret', '//example.org', 'https://user:pass@example.org', null, {}, '']) assert.equal(safeUrl(value), null);
});
