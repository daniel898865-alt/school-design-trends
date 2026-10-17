import { createDemoProvider } from './demo-provider.js';
import { el, emptyState, projectImage, sourceLinks } from './dom.js';

const $ = id => document.getElementById(id);
let provider;
let view;
let mode = 'cards';
let section = 'overview';
let lastFilters;
const form = $('filters');

function filters() { return { ...Object.fromEntries(new FormData(form)), months: Number($('months').value) }; }
function message(text) { $('notice').textContent = text; }
function failure(error) { $('error').hidden = false; $('error').textContent = String(error.message || error).slice(0, 900); message('새 조건을 적용하지 못했습니다. 이전 결과를 유지합니다.'); }
function options() {
  for (const [id, key, label] of [['region', 'regions', '전체 시도'], ['schoolLevel', 'schoolLevels', '전체 학교급'], ['topic', 'topics', '전체 주제']]) {
    $(id).replaceChildren(el('option', { value: '' }, label), ...provider.options[key].map(v => el('option', { value: v.value }, v.label)));
  }
  $('asOf').value = provider.snapshot.as_of;
}
function stat(label, value, note, unit = '건') { return el('article', { class: 'stat' }, [el('p', {}, label), el('div', {}, [el('strong', {}, value), el('span', {}, unit)]), el('small', {}, note)]); }

function bars(container, data) {
  container.replaceChildren();
  if (!data.some(d => d.count > 0)) { container.append(emptyState('표시할 집계가 없습니다', '검색 조건을 넓혀 주세요.')); return; }
  const max = Math.max(1, ...data.map(d => d.count));
  data.forEach(d => container.append(el('div', { class: 'bar-row' }, [el('span', {}, d.label), el('progress', { value: d.count, max, 'aria-label': `${d.label} ${d.count}건` }), el('strong', {}, d.count)])));
}
function monthsChart(container, data) {
  container.replaceChildren();
  if (!data.length || !data.some(d => d.count > 0)) { container.append(emptyState('해당 기간에 사례가 없습니다', '자료가 없는 달은 0건으로 표시합니다.')); return; }
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 560 190'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '월별 설계사업 수. 아래 월별 수치 표에서 값을 확인할 수 있습니다.');
  const max = Math.max(1, ...data.map(d => d.count));
  const width = 504 / data.length;
  const shape = (tag, attrs, text) => { const n = document.createElementNS(svgNS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (text !== undefined) n.textContent = text; svg.append(n); };
  for (const fraction of [0, .5, 1]) {
    const y = 150 - fraction * 120;
    shape('line', { x1: 32, x2: 545, y1: y, y2: y, class: 'chart-gridline' });
    shape('text', { x: 19, y: y + 4, class: 'chart-label', 'text-anchor': 'end' }, (max * fraction).toLocaleString('ko-KR'));
  }
  data.forEach((d, i) => {
    shape('rect', { x: 36 + i * width, y: 150 - d.count / max * 120, width: Math.max(2, width - 5), height: d.count / max * 120, rx: 2, class: 'chart-bar' });
    if (i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0) shape('text', { x: 36 + i * width, y: 175, class: 'chart-label' }, d.label.slice(2));
  });
  const details = el('details', { class: 'chart-values' }, [el('summary', {}, '월별 수치 표 보기')]);
  details.append(el('div', { class: 'month-values' }, data.map(d => el('span', {}, `${d.label} · ${d.count}건`))));
  container.append(svg, details, el('p', { class: 'small' }, '조회 기간 양끝의 월은 일부 기간만 포함할 수 있습니다.'));
}
function basicDetail(project) {
  const dialog = $('project-dialog');
  const close = el('button', { class: 'dialog-close', type: 'button' }, '닫기 ×');
  close.addEventListener('click', () => dialog.close());
  dialog.replaceChildren(close, el('p', { class: 'eyebrow' }, 'DEMO / PROJECT'), el('h2', {}, project.title), projectImage(project), el('p', {}, project.summary), el('p', {}, `${project.region_name} · ${project.school_level_label} · 당선일 ${project.award_date || '미확인'}`), el('h3', {}, '출처'), sourceLinks(project.source_ids, provider.snapshot));
  dialog.showModal();
}
function renderProjects() {
  const container = $('projects');
  container.className = mode === 'cards' ? 'project-grid' : 'table-wrap';
  container.replaceChildren();
  if (view.empty) { container.append(emptyState('조건에 맞는 사례가 없습니다', '다른 검색어를 사용하거나 조건을 초기화해 보세요.')); return; }
  const projectButton = (p, text) => { const b = el('button', { class: 'text-button', type: 'button', 'aria-label': `${p.title} 상세 보기` }, text); b.addEventListener('click', () => basicDetail(p)); return b; };
  if (mode === 'table') {
    const dateLabel = lastFilters.dateBasis === 'award_date' ? '당선일' : '공모일';
    const table = el('table', {}, [el('caption', { class: 'sr-only' }, '현재 필터에 해당하는 가상 설계 사례'), el('thead', {}, el('tr', {}, ['설계사업', '시도', '학교급', dateLabel, '사무소'].map(t => el('th', { scope: 'col' }, t))))]);
    table.append(el('tbody', {}, view.projects.map(p => el('tr', {}, [el('td', {}, projectButton(p, p.title)), el('td', {}, p.region_name), el('td', {}, p.school_level_label), el('td', {}, p[lastFilters.dateBasis] || '미확인'), el('td', {}, p.firm_names.join(', ') || '미확인')]))));
    container.append(table); return;
  }
  for (const p of view.projects) {
    const card = el('article', { class: 'project-card' }, [projectImage(p), el('div', { class: 'card-content' }, [el('div', { class: 'chips' }, [el('span', {}, p.region_name), el('span', {}, p.school_level_label), el('span', { class: 'demo-chip' }, '가상 사례')]), el('h3', {}, projectButton(p, p.title)), el('p', { class: 'card-summary' }, p.summary), el('div', { class: 'card-bottom' }, [el('span', {}, `${lastFilters.dateBasis === 'award_date' ? '당선' : '공모'} ${p[lastFilters.dateBasis] || '미확인'}`), projectButton(p, '사례 보기 ↗')])])]);
    container.append(card);
  }
}
function switchSection(next) {
  section = next;
  document.querySelectorAll('[data-view]').forEach(b => { if (b.dataset.view === section) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('overview-view').hidden = section !== 'overview';
  $('projects-view').hidden = !['overview', 'projects'].includes(section);
}
function render() {
  if (!provider || !form.reportValidity()) return;
  try {
    const nextFilters = filters();
    const nextView = provider.select(nextFilters);
    view = nextView; lastFilters = nextFilters;
    $('error').hidden = true;
    $('scope').textContent = `예시 자료 기준 ${provider.snapshot.as_of} · 조회 기준 ${lastFilters.asOf} · 최근 ${lastFilters.months}개월 · ${lastFilters.dateBasis === 'award_date' ? '당선일' : '공모일'} 기준`;
    $('stats').replaceChildren(stat('설계사업', view.summary.projects, '중복 사업을 제외한 고유 사례'), stat('연결된 자료', view.summary.sources, '사업 수와 구분한 출처 수'), stat('관련 학교', view.summary.schools, '동일 학교의 중복을 제외', '곳'), stat('참여 사무소', view.summary.firms, '공동 당선 포함 · 고유 사무소', '곳'));
    bars($('region-chart'), view.byRegion); monthsChart($('month-chart'), view.byMonth);
    $('level-strip').replaceChildren(el('strong', {}, '학교급별 분포'), ...view.byLevel.map(d => el('span', {}, [d.label, el('b', {}, `${d.count}건`)])));
    renderProjects(); switchSection(section);
    message(`가상 설계사업 ${view.summary.projects}건을 표시합니다. 날짜 미확인으로 제외된 사례 ${view.summary.excludedUnknownDates}건.`);
  } catch (error) { failure(error); }
}
async function loadDemo() {
  message('예시 자료를 불러오는 중입니다…');
  try {
    const response = await fetch('public/demo.snapshot.json');
    if (!response.ok) throw new Error('예시 자료를 불러오지 못했습니다. 페이지를 새로 고쳐 주세요.');
    const next = createDemoProvider(await response.json());
    provider = next; form.reset(); options(); render();
  } catch (error) { failure(error); }
}
form.addEventListener('submit', event => { event.preventDefault(); render(); });
form.addEventListener('change', () => render());
$('reset').addEventListener('click', () => { if (!provider) return; form.reset(); $('asOf').value = provider.snapshot.as_of; render(); });
$('reload-demo').addEventListener('click', loadDemo);
$('navigation').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) switchSection(button.dataset.view); });
for (const name of ['cards', 'table']) $(name + '-mode').addEventListener('click', () => { mode = name; $('cards-mode').setAttribute('aria-pressed', name === 'cards'); $('table-mode').setAttribute('aria-pressed', name === 'table'); if (view) renderProjects(); });
$('data-help').addEventListener('click', () => $('data-section').scrollIntoView({ behavior: 'smooth' }));
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('파일은 1 MB 이하여야 합니다.');
    const next = createDemoProvider(JSON.parse(await file.text()));
    provider = next; form.reset(); options(); render();
  } catch (error) { failure(error); }
  event.target.value = '';
});
loadDemo();
