import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (...args) => spawnSync(process.execPath, ['tools/design-research.mjs', ...args], { encoding: 'utf8' });
const dir = mkdtempSync(join(tmpdir(), 'design-research-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('CLI validate: 시연 result.json 통과, 필수 항목이 빠지면 실패(종료 코드 1)', () => {
  const ok = run('validate', 'public/design-research/demo-result.json');
  assert.equal(ok.status, 0); assert.match(ok.stdout, /통과/);
  const broken = JSON.parse(readFileSync('public/design-research/demo-result.json', 'utf8'));
  delete broken.unconfirmed; delete broken.exclusions;
  const path = join(dir, 'broken.json'); writeFileSync(path, JSON.stringify(broken));
  const bad = run('validate', path);
  assert.equal(bad.status, 1); assert.match(bad.stdout, /unconfirmed/);
});

test('CLI render: 검증을 통과한 결과만 Markdown으로 만든다', () => {
  const out = join(dir, 'report.md');
  const ok = run('render', 'public/design-research/demo-result.json', '--out', out);
  assert.equal(ok.status, 0); assert.ok(existsSync(out));
  assert.match(readFileSync(out, 'utf8'), /사람 검수 전/);
  const broken = JSON.parse(readFileSync('public/design-research/demo-result.json', 'utf8')); broken.candidates[0].score = 1;
  const path = join(dir, 'score.json'); writeFileSync(path, JSON.stringify(broken));
  const out2 = join(dir, 'no.md');
  const bad = run('render', path, '--out', out2);
  assert.equal(bad.status, 1); assert.ok(!existsSync(out2));
});

test('CLI search: 입력 사업을 제외하고 요약만 출력하며 전체 결과는 파일로 저장한다', () => {
  const query = join(dir, 'query.json'); const out = join(dir, 'search.json');
  writeFileSync(query, JSON.stringify({ exclude_ids: ['goe-2025-068'], preferred: { school_level: 'high', project_type: 'new', facility_kind: 'school' }, keywords: [{ id: 'open', label: '주민', patterns: ['주민'] }], limit: 30 }));
  const r = run('search', '--query', query, '--out', out, '--show', '3');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /제외: goe-2025-068\(input_project\)/);
  assert.ok(r.stdout.split('\n').length < 30, '전체 JSON을 출력하지 않고 요약만 출력해야 함');
  const full = JSON.parse(readFileSync(out, 'utf8'));
  assert.ok(!full.candidates.some((c) => c.project_id === 'goe-2025-068'));
  assert.ok(full.candidates.length > 3);
});

test('CLI: 없는 파일과 잘못된 명령은 오류로 끝난다', () => {
  assert.equal(run('validate', join(dir, '없음.json')).status, 2);
  assert.equal(run('search').status, 2);
  assert.equal(run('unknown').status, 2);
});
