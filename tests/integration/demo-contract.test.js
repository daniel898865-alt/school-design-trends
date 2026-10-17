import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSnapshot} from '../../src/data/parseSnapshot.js';
import {filterProjects, summarizeProjects} from '../../src/domain/projects.js';
import {createDemoProvider, validateDemoSnapshot} from '../../src/ui/demo-provider.js';

// These two fixtures are the shared, supported subset of A1 and the UI demo.
// A1's missing regions/types, ISO publication times and multi-region fixture
// remain explicit integration work; this test does not coerce those away.
const fixtures = [
  ['UI demo', '../../public/demo.snapshot.json'],
  ['original contract example', '../../data/examples/snapshot.demo.json'],
];

for (const [name, path] of fixtures) {
  test(`${name}: A1 and UI agree on common dates, periods and region filters`, () => {
    const input = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
    const parsed = parseSnapshot(input);
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.warnings, []);
    assert.equal(validateDemoSnapshot(input).valid, true);
    assert.equal(validateDemoSnapshot(parsed.snapshot).valid, true);
    const ui = createDemoProvider(parsed.snapshot);
    const regionFilters = ['', ...ui.options.regions.map(({value}) => value)];

    for (const dateBasis of ['award_date', 'competition_date']) {
      for (const months of [1, 12, 36]) {
        for (const asOf of ['2026-10-17', '2027-10-17']) {
          for (const region of regionFilters) {
            const label = `${name}; ${dateBasis}; ${months} months; ${asOf}; region=${region || 'all'}`;
            const view = ui.select({dateBasis, months, asOf, region});
            // UI uses a single region; A1 uses an array. Map explicitly.
            const projects = filterProjects(parsed.snapshot, {
              dateBasis, months, asOf, regions: region ? [region] : null,
            });
            const summary = summarizeProjects(projects);
            assert.deepEqual(view.projects.map((p) => p.project_id).sort(),
              projects.map((p) => p.project_id).sort(), `${label}: project IDs`);
            assert.equal(view.summary.projects, summary.uniqueProjects, `${label}: projects`);
            assert.equal(view.summary.sources, summary.uniqueArticles, `${label}: sources`);
            assert.equal(view.summary.schools, summary.uniqueSchools, `${label}: schools`);
            assert.equal(view.summary.excludedUnknownDates, summary.excludedUnknownDates,
              `${label}: unknown dates`);

            const uiRegions = new Map(view.byRegion.map((r) => [r.label, r.count]));
            const a1Regions = new Map(summary.byRegion.map((r) => [r.region_name, r.projects]));
            // A1 enumerates all provinces; the demo enumerates fixture provinces.
            // Compare the union, treating an unlisted province as zero, so a
            // nonzero mismatch in either implementation cannot be hidden.
            for (const name of new Set([...uiRegions.keys(), ...a1Regions.keys()])) {
              assert.equal(uiRegions.get(name) ?? 0, a1Regions.get(name) ?? 0,
                `${label}: region ${name}`);
            }
            assert.deepEqual(view.byMonth.map((r) => ({month: r.label, projects: r.count})),
              summary.byMonth.map((r) => ({month: r.month, projects: r.projects})),
              `${label}: monthly projects including zero months`);
          }
        }
      }
    }
  });
}
