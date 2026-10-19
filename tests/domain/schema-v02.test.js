import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSnapshot} from '../../src/data/parseSnapshot.js';
import {createDataProvider} from '../../src/ui/data-provider.js';

const real = () => JSON.parse(readFileSync(new URL('../../data/goe-annual.snapshot.json', import.meta.url), 'utf8'));

test('v0.1 extensions and v0.2 accept the actual dataset without unknown-field loss', () => {
  for (const version of ['0.1', '0.2']) {
    const input = real(); input.schema_version = version;
    const parsed = parseSnapshot(input);
    assert.deepEqual(parsed.errors, []);
    assert.ok(!parsed.warnings.some((warning) => ['unknown_field', 'schema_version'].includes(warning.code)));
    const project = parsed.snapshot.projects[0];
    assert.equal(project.award_year, 2023);
    assert.equal(project.yearbook_page, 14);
    assert.equal(project.metrics.site_area, 12163);
    assert.deepEqual(project.designers, input.projects[0].designers);
    assert.deepEqual(project.jury_notes, input.projects[0].jury_notes);
    assert.equal(project._raw, input.projects[0]);
    assert.equal(createDataProvider(input).select().summary.projects, 166);
  }
});

test('nested extensions reject malformed values, while genuine discrepancies stay review notes', () => {
  for (const [field, value] of [
    ['award_year', 10000], ['yearbook_page', -1], ['metrics', []],
    ['metrics', {site_area: 'large'}], ['metrics', {floors_above: 2.5}],
    ['metrics', {gross_floor_area: -5}], ['designers', [{person: {name: 'unsafe'}}]],
    ['jury_notes', [{note: 123}]], ['data_issues', [42]], ['design_tags', {}],
  ]) {
    const input = real(); input.projects[0][field] = value;
    const parsed = parseSnapshot(input);
    assert.ok(parsed.errors.length, field);
    assert.throws(() => createDataProvider(input), undefined, field);
  }
  const input = real();
  input.projects[0].metrics.floor_area_ratio = 145.5; // A FAR over 100% is not an error.
  input.projects[0].data_issues = ['수치의 원문 대조 필요'];
  const parsed = parseSnapshot(input);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.snapshot.projects[0].metrics.floor_area_ratio, 145.5);
  assert.deepEqual(parsed.snapshot.projects[0].data_issues, ['수치의 원문 대조 필요']);
});

test('screen length limits apply inside extension objects', () => {
  const input = real(); input.projects[0].metrics.exterior = 'a'.repeat(6001);
  assert.throws(() => createDataProvider(input), (error) => error.errors.some((entry) => entry.path.endsWith('metrics.exterior')));
});
