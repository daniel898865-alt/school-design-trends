// 세 가지 기능 화면: ① 연도별 동향 ② 향후 설계 방향 ③ 설계안 PDF 비교 결과 보기.
// 이 화면은 PDF를 읽거나 AI를 호출하지 않는다. 설계안 PDF 분석은 Claude Code의 school-design-research 스킬이 하고,
// 홈페이지는 그 결과 파일(result.json)을 불러와 보여 주고 저장할 수 있게 할 뿐이다.
import { el } from './dom.js';
import {
  DIMENSIONS, LABELS, STEP_LABELS, summarizeYearTrends, resultToMarkdown, validateDirections, validateResult,
} from '../domain/design-research.js';

const $ = (id) => document.getElementById(id);
const FEATURES = ['trends', 'directions', 'compare', 'explore'];
const dimensionLabel = Object.fromEntries(DIMENSIONS.map(([id, label]) => [id, label]));
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : '–');
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) node.append(c);
  return node;
}
function table(headers, rows, caption) {
  return el('div', { class: 'table-wrap' }, el('table', { class: 'rs-table' }, [
    caption ? el('caption', {}, caption) : null,
    el('thead', {}, el('tr', {}, headers.map((h) => el('th', { scope: 'col' }, h)))),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => (i === 0 ? el('th', { scope: 'row' }, c) : el('td', {}, c)))))),
  ]));
}
function notice(text, kind = '') { return el('p', { class: `rs-notice ${kind}`.trim() }, text); }
function sectionBlock(step, title, children, intro) {
  return el('section', { class: 'rs-block' }, [
    el('div', { class: 'rs-block-head' }, [el('span', { class: 'rs-step', 'aria-hidden': 'true' }, step), el('h3', {}, title)]),
    intro ? el('p', { class: 'small' }, intro) : null,
    ...children,
  ]);
}
function evidenceMark(level) { return el('span', { class: `rs-level rs-level-${level}` }, { fact: '사실', ai_interpretation: 'AI 해석', proposal: '제안' }[level] ?? level); }

// ───── 화면 전환 ─────
function setFeature(name, { updateHash = true } = {}) {
  const feature = FEATURES.includes(name) ? name : 'trends';
  document.querySelectorAll('[data-feature-panel]').forEach((p) => { p.hidden = p.dataset.featurePanel !== feature; });
  document.querySelectorAll('#main > :not([data-feature-shell])').forEach((node) => node.classList.toggle('feature-hidden', feature !== 'explore'));
  $('main').querySelector('.rs-intro').hidden = feature === 'explore';
  document.querySelectorAll('#navigation [data-feature]').forEach((b) => {
    if (b.dataset.feature === feature) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (updateHash && location.hash !== `#${feature}`) history.replaceState(null, '', `#${feature}`);
  return feature;
}

// ───── ① 연도별 동향 ─────
async function loadJson(url, what) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${what}을(를) 불러오지 못했습니다(${response.status}). 배포 주소나 npm start 로컬 서버에서 열었는지 확인하세요.`);
  return response.json();
}

function stackedBars(years, keyOf, labels) {
  const keys = [...new Set(years.flatMap((y) => Object.keys(keyOf(y))))];
  const width = 640; const rowH = 34; const left = 64; const right = 120; const usable = width - left - right;
  const root = svg('svg', { viewBox: `0 0 ${width} ${years.length * rowH + 8}`, role: 'img', class: 'rs-bars', 'aria-label': '연도별 구성 막대(아래 표와 같은 수)' });
  years.forEach((y, i) => {
    const parts = keyOf(y); const total = Object.values(parts).reduce((a, b) => a + b, 0);
    root.append(svg('text', { x: 0, y: i * rowH + 22, class: 'chart-label' }, [document.createTextNode(`${y.year}`)]));
    let x = left;
    keys.forEach((k, ki) => {
      const n = parts[k] ?? 0; if (!n || !total) return;
      const w = (n / total) * usable;
      root.append(svg('rect', { x, y: i * rowH + 6, width: Math.max(w, 1), height: 22, class: `rs-seg rs-seg-${ki % 6}` }, [svg('title', {}, [document.createTextNode(`${y.year} ${labels[k] ?? k} ${n}건`)])]));
      x += w;
    });
    root.append(svg('text', { x: left + usable + 10, y: i * rowH + 22, class: 'chart-label' }, [document.createTextNode(`학교 ${total}건`)]));
  });
  const legend = el('ul', { class: 'rs-legend' }, keys.map((k, ki) => el('li', {}, [el('span', { class: `rs-swatch rs-seg-${ki % 6}`, 'aria-hidden': 'true' }), labels[k] ?? k])));
  return el('div', { class: 'rs-chart' }, [root, legend]);
}

function renderTrends(root, trends, directions) {
  const Y = trends.years;
  const kinds = ['school', 'kindergarten', 'special_school', 'housing', 'education_facility'];
  const types = [...new Set(Y.flatMap((y) => Object.keys(y.by_type)))];
  const levels = ['elementary', 'middle', 'high', 'combined', 'other', 'unknown'].filter((k) => Y.some((y) => y.by_level[k]));
  const cov = { full: '전부 있음', partial: '일부', none: '미부여(정보 없음)' };
  const metricRow = (y, key, unit) => { const m = y.metrics[key]; return `${m.n ? `${fmt(m.median)}${unit}` : '–'} (집계 ${m.n}건 · 정보 없음 ${m.missing}건)`; };

  root.replaceChildren(
    notice('이 화면의 위쪽은 전체 166건의 정량 집계이고, 아래쪽은 일부 사례(5건)의 정성 분석입니다. 둘을 섞어 읽지 마세요. 연도는 작품집 수록연도이며 실제 당선일·준공일이 아닙니다.', 'rs-strong'),
    sectionBlock('A', '정량 집계: 수록된 당선작 전체', [
      el('h4', {}, '1. 시설 구분과 집계 대상'),
      table(['수록연도', '전체', '학교', '유치원', '특수학교', '사택·관사', '청사·교육시설'],
        Y.map((y) => [String(y.year), `${fmt(y.total)}건`, ...kinds.map((k) => `${fmt(y.facility[k] ?? 0)}건`)]),
        '연도별 시설 구분(건)'),
      el('p', { class: 'small' }, '학교 외 시설(유치원·특수학교·사택·청사 등)은 아래 사업유형·학교급·규모 집계에서 제외했습니다. 집계 대상은 학교(위 표의 학교 열)입니다.'),
      el('h4', {}, '2. 사업유형(학교만)'),
      stackedBars(Y, (y) => y.by_type, LABELS.projectType),
      table(['수록연도', '집계 대상(학교)', ...types.map((t) => LABELS.projectType[t] ?? t)], Y.map((y) => [String(y.year), `${fmt(y.school_n)}건`, ...types.map((t) => `${fmt(y.by_type[t] ?? 0)}건`)])),
      el('p', { class: 'small' }, '사업유형 이름은 작품집 장 구성이 연도별로 달라(2023 그린스마트, 2024 공간재구조화 등) 같은 이름이 아니면 합치지 않았습니다. 연도 사이의 증감을 곧바로 추세로 읽지 마세요.'),
      el('h4', {}, '3. 학교급(학교만)'),
      stackedBars(Y, (y) => y.by_level, LABELS.schoolLevel),
      table(['수록연도', '집계 대상(학교)', ...levels.map((t) => LABELS.schoolLevel[t])], Y.map((y) => [String(y.year), `${fmt(y.school_n)}건`, ...levels.map((t) => `${fmt(y.by_level[t] ?? 0)}건`)])),
      el('p', { class: 'small' }, '학교급은 용도·사업명으로 추정한 값이며 미확인이 있습니다(표의 미확인 열).'),
      el('h4', {}, '4. 규모(학교만, 중앙값)'),
      table(['수록연도', '대지면적', '연면적', '지상 층수'], Y.map((y) => [String(y.year), metricRow(y, 'site_area', '㎡'), metricRow(y, 'gross_floor_area', '㎡'), metricRow(y, 'floors_above', '층')])),
      el('p', { class: 'small' }, '중앙값은 정보가 있는 사업만으로 계산합니다. 정보 없음은 건수로 함께 표시하며 0으로 처리하지 않습니다.'),
      el('h4', {}, '5. 입력된 정보의 범위(전체 사업)'),
      table(['수록연도', '전체', '개념 요약', '심사평 요지', '설계 태그', '사무소 연결'], Y.map((y) => [String(y.year), `${fmt(y.total)}건`, `${fmt(y.info.summary)}건`, `${fmt(y.info.jury_notes)}건`,
        `${cov[y.info.design_tags.coverage]} (${fmt(y.info.design_tags.assigned)}건)`, `${cov[y.info.firm_links.coverage]} (${fmt(y.info.firm_links.assigned)}건)`])),
      el('p', { class: 'small' }, '2024년은 설계 태그와 사무소 연결이 입력되지 않았습니다. 이는 정보 없음이며 해당 사례가 0건이라는 뜻이 아닙니다. 그래서 태그 기반 연도 비교는 하지 않습니다.'),
      el('details', { class: 'rs-notes' }, [el('summary', {}, '집계 기준과 한계'), el('ul', {}, trends.notes.map((n) => el('li', {}, n)))]),
    ]),
    sectionBlock('B', '정성 분석: 일부 사례의 공간 전략', [
      notice(`분석한 사례는 전체 ${fmt(trends.total)}건 중 ${directions.analyzed_cases.length}건뿐이며, 모두 AI가 읽은 사람 검수 전 분석입니다. 소수 사례의 차이를 연도 전체의 추세로 단정하지 않습니다.`, 'rs-warn'),
      el('div', { class: 'rs-cases' }, directions.analyzed_cases.slice().sort((a, b) => a.award_year - b.award_year).map((c) => el('article', { class: 'rs-case' }, [
        el('h4', {}, `${c.title} · ${c.award_year}년판(수록연도)`),
        el('p', { class: 'small' }, `${c.project_id} · 데이터 쪽 ${c.yearbook_page} · 분석: ${c.analysis}`),
        el('p', { class: 'small' }, `읽은 범위: ${c.depth}`),
        el('ul', {}, c.strategies.map((s) => el('li', {}, [evidenceMark(s.level), ` ${s.dimension}: ${s.text} `, el('span', { class: 'muted' }, `[${s.source}]`)]))),
      ]))),
      el('p', {}, el('button', { type: 'button', class: 'rs-link', 'data-go': 'directions' }, '이 사례들에서 정리한 설계 방향 보기 →')),
    ], '정량 집계에는 공간 전략이 들어 있지 않습니다. 전략은 사례별로 읽은 근거와 쪽에 연결되어 있습니다.'),
  );
}

// ───── ② 향후 설계 방향 ─────
function renderDirections(root, directions) {
  const byId = new Map(directions.analyzed_cases.map((c) => [c.project_id, c]));
  root.replaceChildren(
    notice(directions.notice, 'rs-strong'),
    el('div', { class: 'rs-directions' }, directions.directions.map((d) => el('article', { class: 'rs-direction' }, [
      el('h3', {}, d.title),
      el('p', { class: 'small' }, `근거 사례 ${d.evidence_cases}건${d.evidence_cases < 3 ? ' · 소수 사례' : ''} · 검토할 방향(예측 아님)`),
      el('dl', { class: 'rs-dl' }, [
        el('dt', {}, '관찰한 내용'), el('dd', {}, d.observation),
        el('dt', {}, '해석'), el('dd', {}, d.interpretation),
        el('dt', {}, '적용 조건'), el('dd', {}, d.conditions),
        el('dt', {}, '반대 근거·미확인'), el('dd', { class: 'rs-counter' }, d.counter_or_unconfirmed),
      ]),
      el('p', { class: 'small' }, ['근거 사례: ', d.case_ids.map((id) => { const c = byId.get(id); return c ? `${c.title}(${c.award_year})` : id; }).join(', ')]),
      el('p', { class: 'small muted' }, `출처: ${d.sources.join(' · ')}`),
    ]))),
  );
}

// ───── ③ 설계안 PDF 비교 결과 ─────
let currentResult = null;

function statusChip(status) { return el('span', { class: `rs-chip rs-chip-${status}` }, LABELS.status[status] ?? status); }
function srcText(sources) { return Array.isArray(sources) && sources.length ? sources.map((s) => (typeof s === 'string' ? s : `${s.page}${s.readability ? `(${LABELS.readability[s.readability]})` : ''}`)).join(', ') : '출처 미기재'; }

function renderResult(root, result) {
  const titleOf = (id) => result.candidates.find((c) => c.project_id === id)?.title ?? id;
  root.replaceChildren(
    el('div', { class: `rs-result-banner ${result.status.demonstration ? 'is-demo' : ''}` }, [
      el('strong', {}, result.status.demonstration ? '시연 예시 · 시험 입력 · 사람 검수 전' : '사용자 실행 결과 · 사람 검수 전'),
      el('ul', {}, [...result.status.notices.map((n) => el('li', {}, n)), el('li', {}, result.status.year_basis_notice)]),
    ]),
    el('h3', {}, result.title),
    el('p', {}, `분석 목적: ${result.purpose}`),
    el('div', { class: 'rs-actions' }, [
      el('button', { type: 'button', class: 'primary', id: 'save-md' }, 'Markdown 보고서 저장 ↓'),
      el('button', { type: 'button', id: 'save-json' }, 'result.json 저장 ↓'),
    ]),
    sectionBlock('1', '실행 기록: 새로 읽은 것과 재사용한 것', [
      table(['단계', '상태', '근거', '메모'], result.run.steps.map((s) => [STEP_LABELS[s.id] ?? s.id, LABELS.stepStatus[s.status], LABELS.basis[s.basis], s.note ?? '–'])),
    ]),
    sectionBlock('2', `입력 설계안: ${result.input.label} (PDF ${result.input.page_count}쪽)`, [
      el('details', {}, [el('summary', {}, '쪽별 구성'), table(['PDF 쪽', '인쇄 쪽', '내용', '도판'], result.input.page_map.map((p) => [String(p.pdf_page), p.printed_page ?? '–', p.kind, p.figures ?? '–']))]),
      el('h4', {}, '학교 조건'),
      el('dl', { class: 'rs-dl' }, Object.entries(result.input.conditions).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, String(v))])),
      el('h4', {}, '공간 전략'),
      table(['영역', '내용', '근거 수준', '출처'], result.input.strategies.map((s) => [dimensionLabel[s.dimension] ?? s.dimension, `${s.summary}${s.uncertain ? ' (판독 불확실)' : ''}`, LABELS.evidence[s.evidence_level], srcText(s.sources)])),
    ]),
    sectionBlock('3', '후보 선정 이유와 확인 한계', [
      el('p', { class: 'small' }, '후보는 기존 166건에서 도구로 먼저 검색했습니다. 입력 사업 자체는 제외했고, 정렬은 순위나 점수가 아닙니다.'),
      table(['후보', '수록연도', '선정 이유', '정보 없음 항목', '비고'], result.candidates.map((c) => [`${c.title}${result.selected.includes(c.project_id) ? ' (비교 대상)' : ' (선정하지 않음)'}`, `${c.award_year ?? '–'}년판`, c.reason, c.info_missing.join(', ') || '–', [c.notes, c.duplicate_check].filter(Boolean).join(' / ') || '–'])),
      el('p', { class: 'small' }, `제외한 사업: ${result.exclusions.map((e) => `${e.project_id}(${e.reason})`).join(' / ')}`),
    ]),
    sectionBlock('4', '공통 비교표', [
      el('p', { class: 'small' }, '정보 없음은 해당 내용이 없다는 뜻이 아니며 불일치와 구분합니다. 수치가 다른 것은 수치 차이로 표시하고, 필수조건을 정하지 않은 경우 조건 불일치로 판정하지 않습니다.'),
      el('div', { class: 'table-wrap' }, el('table', { class: 'rs-table' }, [
        el('thead', {}, el('tr', {}, [el('th', { scope: 'col' }, '항목'), el('th', { scope: 'col' }, '입력'), ...result.selected.map((id) => el('th', { scope: 'col' }, titleOf(id)))])),
        el('tbody', {}, result.comparison.rows.map((row) => el('tr', {}, [el('th', { scope: 'row' }, row.item), el('td', {}, row.input),
          ...result.selected.map((id) => { const v = row.values[id]; return el('td', {}, [statusChip(v.status), ` ${v.note ?? ''}`, v.source ? el('span', { class: 'muted' }, ` [${v.source}]`) : null]); })]))),
      ])),
    ]),
    sectionBlock('5', '유사점과 차이', [
      el('h4', {}, '유사점'), el('ul', {}, result.similarities.map((s) => el('li', {}, [evidenceMark(s.evidence_level), ` ${s.text}`, s.sources?.length ? el('span', { class: 'muted' }, ` (${srcText(s.sources)})`) : null]))),
      el('h4', {}, '차이'), el('ul', {}, result.differences.map((s) => el('li', {}, [evidenceMark(s.evidence_level), ` ${s.text}`, s.sources?.length ? el('span', { class: 'muted' }, ` (${srcText(s.sources)})`) : null]))),
    ]),
    sectionBlock('6', '장점과 함께 확인할 운영상 부담', [table(['대상', '건축적 장점(의도 기준)', '함께 확인할 운영상 부담'], result.merits_burdens.map((m) => [m.subject, m.merit, m.burden]))]),
    sectionBlock('7', '조건부 설계 제안(검토용)', [el('ul', {}, result.proposals.map((p) => el('li', {}, [evidenceMark('proposal'), ` ${p.text} `, el('span', { class: 'muted' }, `적용 전 확인: ${p.conditions}`)])))]),
    sectionBlock('8', '근거 기록', [table(['대상', '근거 방식', '요약', '출처'], result.evidence.map((e) => [e.target === 'input' ? '입력 설계안' : titleOf(e.target), LABELS.basis[e.basis], e.summary, srcText(e.sources)]))]),
    sectionBlock('9', '확인하지 못한 사항', [el('ul', {}, result.unconfirmed.map((u) => el('li', {}, u)))]),
  );
  $('save-md').addEventListener('click', () => save(`${safeName(result.title)}.md`, resultToMarkdown(result), 'text/markdown;charset=utf-8'));
  $('save-json').addEventListener('click', () => save('result.json', `${JSON.stringify(result, null, 2)}\n`, 'application/json;charset=utf-8'));
}
function safeName(title) { return String(title).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'report'; }
function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showResult(data, origin) {
  const status = $('compare-status');
  const out = $('compare-result');
  const check = validateResult(data);
  if (!check.ok) {
    currentResult = null; out.replaceChildren();
    status.replaceChildren(...[el('strong', {}, `${origin}: 필수 항목 검증에 실패해 표시하지 않았습니다.`),
      el('ul', {}, check.errors.slice(0, 12).map((e) => el('li', {}, `${e.path} · ${e.message}`))),
      check.errors.length > 12 ? el('p', {}, `오류 ${check.errors.length}건 중 처음 12건만 표시합니다.`) : null].filter(Boolean));
    status.className = 'error-box'; status.hidden = false;
    return false;
  }
  try {
    renderResult(out, data);
  } catch (error) {
    currentResult = null; out.replaceChildren();
    status.className = 'error-box'; status.hidden = false;
    status.replaceChildren(el('strong', {}, `${origin}: 형식이 맞지 않아 표시하지 못했습니다.`), el('p', {}, String(error?.message ?? error).slice(0, 200)));
    return false;
  }
  currentResult = data; status.hidden = true; status.className = ''; status.replaceChildren();
  out.scrollIntoView({ block: 'start' });
  return true;
}

function setupCompare() {
  $('load-demo-result').addEventListener('click', async () => {
    try { showResult(await loadJson('public/design-research/demo-result.json', '시연 결과'), '시연 결과'); }
    catch (error) { const s = $('compare-status'); s.className = 'error-box'; s.hidden = false; s.replaceChildren(el('strong', {}, error.message)); }
  });
  $('result-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    const status = $('compare-status');
    if (!file) return;
    const fail = (message) => { currentResult = null; $('compare-result').replaceChildren(); status.className = 'error-box'; status.hidden = false; status.replaceChildren(el('strong', {}, message)); event.target.value = ''; };
    if (file.size > MAX_RESULT_BYTES) return fail('result.json이 너무 큽니다(최대 2MB). Claude가 만든 result.json이 맞는지 확인하세요.');
    try {
      let data;
      try { data = JSON.parse(await file.text()); } catch { return fail('JSON을 읽을 수 없습니다. Claude가 만든 result.json 파일을 선택하세요(PDF는 여기에 올리지 않습니다).'); }
      showResult(data, '불러온 파일');
    } catch (error) {
      fail(`파일을 처리하지 못했습니다: ${String(error?.message ?? error).slice(0, 120)}`);
    } finally {
      event.target.value = ''; // 같은 파일을 고쳐서 다시 선택할 수 있게 한다
    }
  });
}

// ───── 시작 ─────
export async function initResearch() {
  const trendsRoot = $('trends-content'); const directionsRoot = $('directions-content');
  document.querySelectorAll('#navigation [data-feature]').forEach((b) => b.addEventListener('click', () => { setFeature(b.dataset.feature); window.scrollTo({ top: 0 }); }));
  document.addEventListener('click', (event) => { const go = event.target.closest('[data-go]'); if (go) { setFeature(go.dataset.go); window.scrollTo({ top: 0 }); } });
  setupCompare();
  setFeature(location.hash.slice(1) || 'trends', { updateHash: false });
  const failure = (root, error) => root.replaceChildren(el('div', { class: 'error-box', role: 'alert' }, [el('strong', {}, '자료를 표시하지 못했습니다.'), el('p', {}, String(error.message ?? error))]));
  try {
    const [snapshot, directions] = await Promise.all([loadJson('data/goe-annual.snapshot.json', '당선작 자료'), loadJson('public/design-research/directions.json', '설계 방향 자료')]);
    if (!Array.isArray(snapshot.projects)) throw new Error('당선작 자료에 projects가 없습니다.');
    const check = validateDirections(directions);
    if (!check.ok) throw new Error(`설계 방향 자료 검증 실패: ${check.errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join(' / ')}`);
    renderTrends(trendsRoot, summarizeYearTrends(snapshot.projects), directions);
    renderDirections(directionsRoot, directions);
  } catch (error) { failure(trendsRoot, error); failure(directionsRoot, error); }
}
