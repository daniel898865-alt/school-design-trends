// Snapshot 검사: 입력 오류·경고와 최근 기간 집계를 출력한다.
// 사용: node scripts/check-snapshot.js <snapshot.json> [--as-of=YYYY-MM-DD] [--months=36] [--basis=award_date]
import { readFileSync } from 'node:fs';
import { parseSnapshot } from '../src/data/parseSnapshot.js';
import { filterProjects, summarizeProjects } from '../src/domain/projects.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
if (!file) {
  console.error('사용: node scripts/check-snapshot.js <snapshot.json> [--as-of=YYYY-MM-DD] [--months=36] [--basis=award_date]');
  process.exit(2);
}

const { snapshot, errors, warnings } = parseSnapshot(readFileSync(file, 'utf8'));
for (const e of errors) console.log(`오류  ${e.path}  ${e.message}`);
for (const w of warnings) console.log(`경고  ${w.path}  ${w.message}`);
console.log(`오류 ${errors.length}건 · 경고 ${warnings.length}건`);
if (!snapshot || !snapshot.as_of) process.exit(1);

const projects = filterProjects(snapshot, {
  asOf: opt('as-of') ?? snapshot.as_of,
  months: Number(opt('months') ?? 36),
  dateBasis: opt('basis') ?? 'award_date',
});
const s = summarizeProjects(projects);
console.log(JSON.stringify({
  is_demo: s.is_demo,
  query_as_of: s.query_as_of,
  data_as_of: s.data_as_of,
  date_basis: s.date_basis,
  window: s.window,
  uniqueProjects: s.uniqueProjects,
  uniqueArticles: s.uniqueArticles,
  uniqueSchools: s.uniqueSchools,
  excludedUnknownDates: s.excludedUnknownDates,
  excludedOutOfRange: s.excludedOutOfRange,
  byRegion: s.byRegion.filter((r) => r.projects > 0),
  bySchoolLevel: s.bySchoolLevel.filter((r) => r.projects > 0),
  notes: s.notes,
}, null, 2));
process.exit(errors.length > 0 ? 1 : 0);
