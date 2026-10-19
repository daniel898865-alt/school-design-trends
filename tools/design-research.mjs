// 설계 리서치 도구(school-design-research 스킬이 실행한다). 전체 JSON을 화면에 출력하지 않고 요약만 출력한다.
//   node tools/design-research.mjs search   --query <query.json> [--snapshot data/goe-annual.snapshot.json] [--out <후보.json>] [--show 8]
//   node tools/design-research.mjs validate <result.json>
//   node tools/design-research.mjs render   <result.json> [--out <report.md>]
// 입력 PDF·중간 결과는 Git 제외 폴더(data/private/design-research/)에 둔다. 이 도구는 PDF를 읽지 않는다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { LABELS, resultToMarkdown, searchCandidates, validateResult } from '../src/domain/design-research.js';

const [command, ...rest] = process.argv.slice(2);
const flag = (name, fallback = null) => { const i = rest.indexOf(`--${name}`); return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback; };
const positional = () => rest.find((a, i) => !a.startsWith('--') && !(rest[i - 1] ?? '').startsWith('--'));
const readJson = (path, what) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) { console.error(`${what}을(를) 읽을 수 없습니다: ${e.code ?? e.message}`); process.exit(2); }
};
const writeOut = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };

if (command === 'search') {
  const queryPath = flag('query');
  if (!queryPath) { console.error('--query <query.json>이 필요합니다.'); process.exit(2); }
  const snapshot = readJson(flag('snapshot', 'data/goe-annual.snapshot.json'), '자료(snapshot)');
  if (!Array.isArray(snapshot.projects)) { console.error('snapshot에 projects 배열이 없습니다.'); process.exit(2); }
  const result = searchCandidates(snapshot.projects, readJson(queryPath, '검색 조건'));
  const out = flag('out');
  if (out) writeOut(out, JSON.stringify(result, null, 2) + '\n');
  const show = Number(flag('show', 8));
  console.log(`자료 ${result.snapshot_total}건 · 구조 조건 통과 ${result.pool_size}건 · 후보 ${result.total_candidates}건`);
  console.log(`제외: ${result.excluded.map((e) => `${e.project_id}(${e.reason})`).join(', ') || '없음'}`);
  if (result.required_excluded.count) console.log(`필수 조건으로 걸러낸 사업: ${result.required_excluded.count}건 ${JSON.stringify(result.required_excluded.by_key)}`);
  for (const d of result.duplicate_check_needed) console.log(`중복 확인 필요(후보에 남김): ${d.project_id} ${d.title} ← 입력 ${d.of} (${d.reasons.join(', ')})`);
  for (const a of result.anomalies) console.log(`이상 징후: ${a.project_id} ${a.kind} — ${a.note}`);
  for (const c of result.candidates.slice(0, show)) {
    const cr = c.criteria.map((x) => `${x.label ?? x.key}:${LABELS.status[x.status]}`).join(' ');
    console.log(`- ${c.project_id} ${c.title} (${c.award_year}) 일치${c.counts.match}/불일치${c.counts.mismatch}/수치차이${c.counts.numeric_difference}/정보없음${c.counts.no_information} | ${cr}${c.jury_excluded ? ' | 심사평 제외' : ''}${c.duplicate_check_needed ? ' | 중복 확인 필요' : ''}${c.design_tags_assigned ? '' : ' | 태그 미부여'}`);
  }
  console.log(out ? `전체 결과 저장: ${out}` : '(전체 결과를 저장하려면 --out을 쓰세요)');
  for (const n of result.notes) console.log(`※ ${n}`);
} else if (command === 'validate') {
  const path = positional();
  if (!path) { console.error('검증할 result.json 경로가 필요합니다.'); process.exit(2); }
  const { ok, errors, warnings } = validateResult(readJson(path, 'result.json'));
  for (const w of warnings) console.log(`경고 ${w.path}: ${w.message}`);
  if (ok) console.log('result.json 검증 통과');
  else { for (const e of errors) console.log(`오류 ${e.path}: ${e.message}`); process.exit(1); }
} else if (command === 'render') {
  const path = positional();
  if (!path) { console.error('변환할 result.json 경로가 필요합니다.'); process.exit(2); }
  const result = readJson(path, 'result.json');
  const check = validateResult(result);
  if (!check.ok) { for (const e of check.errors) console.log(`오류 ${e.path}: ${e.message}`); console.error('검증에 실패해 Markdown을 만들지 않았습니다.'); process.exit(1); }
  const md = resultToMarkdown(result);
  const out = flag('out');
  if (out) { writeOut(out, md); console.log(`Markdown 저장: ${out} (${md.split('\n').length}줄)`); } else process.stdout.write(md);
} else {
  console.error('사용: node tools/design-research.mjs search|validate|render … (파일 상단 주석 참고)');
  process.exit(2);
}
