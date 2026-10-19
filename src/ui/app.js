import { createDataProvider } from './data-provider.js';
import { el, emptyState } from './dom.js';
import { createProjectThumbnail, primaryProjectSource } from './project-media.js';
import { renderRegionMap } from './region-map.js';
import { renderYearTrends } from './year-trends.js';
import { renderFirms, renderBuildings, renderTopics, openProjectDialog } from './details.js';
import { serializeCsv, serializeMarkdown, downloadExport } from './export.js';

const $ = id => document.getElementById(id);
let provider;
let view;
let mode = 'cards';
let section = 'overview';
let lastFilters;
let loadSequence = 0;
let yearBasisInitialized = false;
const form = $('filters');
const dateLabels = { award_date: '당선일', competition_date: '공모일', published_at: '기사 게시일', completion_date: '사업 준공일', award_year: '공모집 수록연도' };
const sections = ['overview', 'projects', 'firms', 'buildings', 'topics', 'years'];

function filters() { return { ...Object.fromEntries(new FormData(form)), months: Number($('months').value), year: $('dateBasis').value === 'award_year' ? $('year').value : '' }; }
function periodLabel() { return lastFilters.dateBasis === 'award_year' ? `${lastFilters.year || '전체 수록연도'} · 실제 당선일·준공일 아님` : `${lastFilters.asOf}까지 최근 ${lastFilters.months}개월`; }
function projectDate(project) { return lastFilters.dateBasis === 'award_year' ? String(project.yearbook_year ?? project.award_year ?? '미확인') : project.basis_date || '미확인'; }
function syncDateControls() {
  const yearMode = $('dateBasis').value === 'award_year';
  $('year-field').hidden = !yearMode;
  $('year').disabled = !yearMode;
  $('months').disabled = yearMode;
  $('months').closest('label').hidden = yearMode;
}
function message(text) { $('notice').textContent = text; }
function failure(error) {
  const box = $('error');
  const diagnostics = error.errors ?? error.diagnostics ?? [];
  box.hidden = false;
  box.replaceChildren(el('strong', {}, '자료 또는 조회 조건을 적용하지 못했습니다.'));
  box.append(el('p', {}, String(error.message || error).slice(0, 900)));
  if (diagnostics.length) {
    box.append(el('ul', {}, diagnostics.slice(0, 12).map(item => el('li', {}, `${item.path || '입력'} · ${item.message || item.code || '검증 오류'}`))));
    if (diagnostics.length > 12) box.append(el('p', {}, `오류 ${diagnostics.length}건 중 처음 12건을 표시합니다.`));
  }
  message(provider ? '이전 자료·조회 조건·결과를 유지합니다. 입력을 수정한 뒤 다시 시도해 주세요.' : '아직 표시할 자료를 불러오지 못했습니다. 아래 실행 안내를 확인해 주세요.');
}
function options(nextProvider) {
  for (const [id, key, label] of [['region', 'regions', '전체 시도'], ['schoolLevel', 'schoolLevels', '전체 학교급'], ['topic', 'topics', '전체 주제']]) {
    $(id).replaceChildren(el('option', { value: '' }, label), ...nextProvider.options[key].map(v => el('option', { value: v.value }, v.label)));
  }
  $('year').replaceChildren(el('option', {value: ''}, '전체 수록연도'), ...(nextProvider.options.years ?? []).map(v => el('option', {value: v.value}, v.label)));
}
function restoreFilters(values) {
  for (const [key, value] of Object.entries(values)) {
    const field = form.elements.namedItem(key);
    if (field) field.value = String(value);
  }
}
function defaultFilters(nextProvider) {
  return { query: '', region: '', schoolLevel: '', months: 36, asOf: nextProvider.snapshot.as_of, dateBasis: nextProvider.defaultDateBasis === 'award_year' ? 'award_year' : section === 'years' ? 'completion_date' : 'award_date', topic: '', year: '' };
}
function renderWarnings() {
  const entries = view.diagnostics ?? provider.warnings ?? [];
  const deduplicated = [...new Map(entries.map(item => [`${item.code}|${item.path}|${item.message}`, item])).values()];
  const panel = $('data-warnings');
  panel.hidden = deduplicated.length === 0;
  panel.replaceChildren(el('summary', {}, `자료 확인 사항 ${deduplicated.length}건 · 누락·정규화·연결 근거 확인`));
  if (deduplicated.length) {
    panel.append(el('p', {}, '경고가 있는 자료는 확인 가능한 값만 사용합니다. 입력 형식을 통과했다고 출처의 사실성이 검증된 것은 아닙니다.'));
    panel.append(el('ul', {}, deduplicated.slice(0, 30).map(item => el('li', {}, `${item.path || '자료'} · ${item.message || item.code}`))));
    if (deduplicated.length > 30) panel.append(el('p', {}, `총 ${deduplicated.length}건 중 처음 30건을 표시합니다. 입력 자료를 단계적으로 수정해 주세요.`));
  }
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
  details.append(el('div', { class: 'month-values' }, data.map(d => el('span', {}, `${d.label} · ${d.count}건${d.partial ? ' · 일부 기간' : ''}${d.from && d.to ? ` (${d.from}~${d.to})` : ''}`))));
  container.append(svg, details, el('p', { class: 'small' }, '조회 기간 양끝의 월은 일부 기간만 포함할 수 있습니다.'));
}
function basicDetail(project) {
  openProjectDialog($('project-dialog'), project, provider.snapshot);
}
function renderOverviewSummary() {
  const regionLabel = lastFilters.region
    ? provider.options.regions.find(region => region.value === lastFilters.region)?.label || '지역 미확인'
    : '전체 시도';
  $('overview-region-title').textContent = `${regionLabel} · 조회 결과`;
  $('overview-project-count').textContent = view.summary.projects.toLocaleString('ko-KR');
  $('overview-region-context').textContent = `${dateLabels[lastFilters.dateBasis]} 기준 · ${periodLabel()} · ${lastFilters.dateBasis === 'award_year' ? '연도' : '날짜'} 미확인 제외 ${view.summary.excludedUnknownYears ?? view.summary.excludedUnknownDates}건`;
  const container = $('overview-projects');
  container.replaceChildren();
  if (view.empty) {
    container.append(emptyState('조건에 맞는 사례가 없습니다', `${regionLabel}의 현재 조회 결과가 0건입니다. 다른 지역을 선택하거나 검색 조건을 넓혀 주세요.`));
    return;
  }
  const list = el('ul', { class: 'overview-project-list' });
  for (const project of view.projects.slice(0, 3)) {
    const title = project.title || `사업명 미확인 (${project.project_id})`;
    const button = el('button', { type: 'button', class: 'text-button', 'aria-haspopup': 'dialog', 'aria-label': `${title} 상세 보기` }, title);
    button.addEventListener('click', () => basicDetail(project));
    list.append(el('li', {}, [el('h3', {}, button),
      el('p', { class: 'overview-case-meta' }, `${project.school_level_label || '학교급 미확인'} · ${project.region_name || '지역 미확인'} · ${dateLabels[lastFilters.dateBasis]} ${projectDate(project)}`),
      el('p', { class: 'overview-case-summary' }, project.summary || '요약 미확인 · 상세 화면에서 출처를 확인하세요.'),
    ]));
  }
  container.append(list);
}
function renderProjects() {
  const container = $('projects');
  container.className = mode === 'cards' ? 'project-grid' : 'table-wrap';
  container.replaceChildren();
  if (view.empty) { container.append(emptyState('조건에 맞는 사례가 없습니다', '다른 검색어를 사용하거나 조건을 초기화해 보세요.')); return; }
  const projectButton = (p, label) => { const title = p.title || `사업명 미확인 (${p.project_id})`; const b = el('button', { class: 'text-button', type: 'button', 'aria-label': `${title} 상세 보기` }, label || title); b.addEventListener('click', () => basicDetail(p)); return b; };
  if (mode === 'table') {
    const dateLabel = dateLabels[lastFilters.dateBasis];
    const table = el('table', {}, [el('caption', { class: 'sr-only' }, '현재 필터에 해당하는 설계 사례'), el('thead', {}, el('tr', {}, ['설계사업', '시도', '학교급', dateLabel, '사무소'].map(t => el('th', { scope: 'col' }, t))))]);
    table.append(el('tbody', {}, view.projects.map(p => el('tr', {}, [el('td', {}, projectButton(p, p.title)), el('td', {}, p.region_name || '지역 미확인'), el('td', {}, p.school_level_label || '학교급 미확인'), el('td', {}, projectDate(p)), el('td', {}, p.firm_names.join(', ') || '미확인')]))));
    container.append(table); return;
  }
  for (const p of view.projects) {
    const chips = [el('span', {}, p.region_name || '지역 미확인'), el('span', {}, p.school_level_label || '학교급 미확인')];
    if (provider.snapshot.is_demo) chips.push(el('span', { class: 'demo-chip' }, '가상 사례'));
    else if (p.data_issues?.length) chips.push(el('span', {class: 'demo-chip'}, '확인 사항 있음'));
    const source = primaryProjectSource(p, provider.snapshot);
    const original = source ? el('a', { class: 'original-site-link', href: source.url, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer', 'aria-label': `${p.title || '설계사업'} 원문 사이트 (새 탭)`, title: source.title }, '원문 사이트 ↗') : el('span', { class: 'muted' }, '원문 링크 미등록');
    const card = el('article', { class: 'project-card' }, [createProjectThumbnail(p, basicDetail), el('div', { class: 'card-content' }, [el('div', { class: 'chips' }, chips), el('h3', {}, projectButton(p, p.title)), el('p', { class: 'card-summary' }, p.summary || '요약 미확인 · 상세 화면에서 출처를 확인하세요.'), el('p', { class: 'card-date small' }, `${dateLabels[lastFilters.dateBasis]} ${projectDate(p)}`), el('div', { class: 'card-bottom' }, [projectButton(p, '상세 보기'), original])])]);
    container.append(card);
  }
}
function switchSection(next, { navigate = false } = {}) {
  if (!sections.includes(next)) return;
  section = next;
  $('navigation').querySelectorAll('[data-view]').forEach(b => { if (b.dataset.view === section) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  for (const name of sections) {
    const selected = section === name;
    const tab = $('tab-' + name);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(name + '-view').hidden = !selected;
  }
  if (navigate) {
    const tab = $('tab-' + section);
    tab.focus({ preventScroll: true });
    // Explicit user navigation goes to the same result origin. Repainting after
    // a filter change only synchronizes state and does not move focus or scroll.
    $('results').scrollIntoView({ behavior: 'instant', block: 'start' });
    tab.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
  }
}
function navigateSection(next) {
  // The first visit starts from confirmed project completion dates. Later visits
  // preserve the user's explicitly chosen global date basis.
  if (next === 'years' && provider && !yearBasisInitialized) {
    const previous = $('dateBasis').value;
    $('dateBasis').value = provider.defaultDateBasis === 'award_year' ? 'award_year' : 'completion_date';
    if (!render()) { $('dateBasis').value = previous; return; }
    yearBasisInitialized = true;
  }
  switchSection(next, { navigate: true });
}
function paint() {
    $('error').hidden = true;
    $('loading-help').hidden = true;
    const isDemo = provider.snapshot.is_demo;
    $('data-mode-title').textContent = isDemo ? '가상 자료로 보는 예시 화면' : '불러온 자료를 조회하는 화면';
    $('data-mode-description').textContent = isDemo ? '실제 학교·공모·통계가 아닙니다. 기본 예시 이미지는 직접 만든 개념도입니다.' : '수작업·AI 보조 입력 자료 · 사람의 원문 검수 전 · 설계 태그는 검토 전 초안입니다. 수집 범위와 확인 사항을 함께 읽으세요.';
    $('scope').textContent = `${isDemo ? '가상 ' : ''}자료 기준 ${provider.snapshot.as_of} · ${dateLabels[lastFilters.dateBasis]} 기준 · ${periodLabel()}`;
    syncDateControls();
    $('coverage-scope').textContent = `자료 범위: ${provider.snapshot.coverage?.scope || '미확인'}`;
    $('quality-scope').textContent = isDemo ? '가상 입력으로 기능을 확인합니다.' : `현재 조회 중 확인 메모가 있는 사업 ${view.summary.dataIssueProjects ?? 0}건 · 메모 ${view.summary.dataIssueCount ?? 0}개(수치 오류 외 출처·검수 메모 포함). 학교·건물 미등록과 사무소·주제 미연결은 실제 0건을 뜻하지 않습니다.`;
    const firmNote = view.summary.unresolvedFirmReferences === undefined ? '사무소 목록이 연결된 고유 사무소' : `사무소 목록 기준 · 미확인 연결 ${view.summary.unresolvedFirmReferences}건 제외`;
    $('stats').replaceChildren(stat('설계사업', view.summary.projects, '중복 사업을 제외한 고유 사례'), stat('연결된 자료', view.summary.sources, '사업 수와 구분한 출처·작품집 수'), stat('연결된 학교 자료', view.summary.schools, provider.snapshot.schools.length ? '동일 학교의 중복을 제외' : '학교 목록 미등록 · 실제 학교 수가 아님', '곳'), stat('참여 사무소', view.summary.firms, firmNote, '곳'));
    $('results-summary').textContent = `설계사업 ${view.summary.projects}건 · 같은 조회 조건 유지`;
    const mapView = lastFilters.region ? provider.select({ ...lastFilters, region: '' }) : view;
    renderRegionMap($('region-map'), { regions: mapView.byRegion, selectedRegion: lastFilters.region, onSelect: code => { $('region').value = code; render(); } });
    bars($('region-chart'), view.byRegion);
    if (lastFilters.dateBasis === 'award_year') {
      bars($('month-chart'), view.byYear ?? []);
      $('month-chart').append(el('p', {class: 'small'}, '공모집에 수록된 당선작 수입니다. 월별 추이·실제 당선연도·준공연도로 해석하지 않습니다.'));
    } else monthsChart($('month-chart'), view.byMonth);
    const regionNote = view.summary.regionParticipations === undefined ?
      '시도별 수치는 지역 참여 건수이며 지역 미확인은 별도로 표시합니다.' :
      `시도별 참여 합계 ${view.summary.regionParticipations}건 · 전체 고유 사업 ${view.summary.projects}건 · 여러 시도에 걸친 사업 ${view.summary.multiRegionProjects ?? 0}건. 한 사업을 관련 시도마다 셀 수 있어 합계가 다릅니다. 지역 미확인은 별도 항목입니다.`;
    $('region-note').textContent = regionNote;
    $('aggregation-notes').replaceChildren(...(view.notes ?? []).map(note => el('li', {}, note)));
    $('level-strip').replaceChildren(el('strong', {}, '학교급별 분포'), ...view.byLevel.map(d => el('span', {}, [d.label, el('b', {}, `${d.count}건`)])));
    renderOverviewSummary();
    renderProjects();
    renderFirms($('firms-view'), view, provider.snapshot, basicDetail);
    renderBuildings($('buildings-view'), view, provider.snapshot);
    renderTopics($('topics-view'), view);
    renderYearTrends($('years-view'), view, provider.snapshot, {
      dateBasis: lastFilters.dateBasis, asOf: lastFilters.asOf, months: lastFilters.months,
      onDateBasisChange: dateBasis => { $('dateBasis').value = dateBasis; render(); },
      onOpenProject: basicDetail,
    });
    $('export-count').textContent = view.summary.projects;
    $('export-csv').disabled = $('export-md').disabled = view.empty;
    renderWarnings();
    switchSection(section);
    message(`${isDemo ? '가상 ' : ''}설계사업 ${view.summary.projects}건을 표시합니다. ${lastFilters.dateBasis === 'award_year' ? '수록연도' : '날짜'} 미확인으로 제외된 사례 ${view.summary.excludedUnknownYears ?? view.summary.excludedUnknownDates}건.`);
}
function render() {
  if (!provider || !form.reportValidity()) return false;
  try {
    const nextFilters = filters();
    const nextView = provider.select(nextFilters);
    view = nextView; lastFilters = nextFilters;
    paint();
    return true;
  } catch (error) {
    if (lastFilters) restoreFilters(lastFilters);
    failure(error);
    return false;
  }
}
function installProvider(next) {
  const nextFilters = defaultFilters(next);
  // Parsing and the complete initial selection must succeed before changing any
  // live provider, filter controls or visible results.
  const nextView = next.select(nextFilters);
  provider = next; view = nextView; lastFilters = nextFilters;
  form.reset(); options(next); restoreFilters(nextFilters);
  $('buildings-view').dataset.ageFilter = 'all';
  delete $('years-view').dataset.selectedYear;
  yearBasisInitialized = section === 'years';
  paint();
}
async function loadDataset(name = 'goe') {
  const sequence = ++loadSequence;
  message('자료를 불러오는 중입니다…');
  try {
    const response = await fetch(name === 'demo' ? 'public/demo.snapshot.json' : 'data/goe-annual.snapshot.json');
    if (!response.ok) throw new Error('예시 자료를 불러오지 못했습니다. 배포 주소 또는 로컬 미리보기 서버에서 열었는지 확인해 주세요.');
    const next = createDataProvider(await response.text());
    if (sequence === loadSequence) { installProvider(next); $('dataset').value = name; }
  } catch (error) { if (sequence === loadSequence) failure(error); }
}
form.addEventListener('submit', event => { event.preventDefault(); render(); });
form.addEventListener('change', () => render());
$('reset').addEventListener('click', () => { if (!provider) return; form.reset(); restoreFilters(defaultFilters(provider)); $('buildings-view').dataset.ageFilter = 'all'; delete $('years-view').dataset.selectedYear; render(); });
$('reload-demo').addEventListener('click', () => loadDataset('demo'));
$('dataset').addEventListener('change', event => loadDataset(event.target.value));
$('overview-results-link').addEventListener('click', event => {
  event.preventDefault();
  const results = $('overview-region-results');
  results.focus({ preventScroll: true });
  results.scrollIntoView({ behavior: 'instant', block: 'start' });
});
$('overview-all-projects').addEventListener('click', () => navigateSection('projects'));
$('navigation').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) navigateSection(button.dataset.view); });
$('result-tabs').addEventListener('click', event => { const button = event.target.closest('[data-result-view]'); if (button) navigateSection(button.dataset.resultView); });
$('result-tabs').addEventListener('keydown', event => {
  const button = event.target.closest('[data-result-view]');
  if (!button) return;
  const current = sections.indexOf(button.dataset.resultView);
  const target = { ArrowRight: (current + 1) % sections.length, ArrowLeft: (current + sections.length - 1) % sections.length, Home: 0, End: sections.length - 1 }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  navigateSection(sections[target]);
});
for (const name of ['cards', 'table']) $(name + '-mode').addEventListener('click', () => { mode = name; $('cards-mode').setAttribute('aria-pressed', name === 'cards'); $('table-mode').setAttribute('aria-pressed', name === 'table'); if (view) renderProjects(); });
$('data-help').addEventListener('click', () => $('data-section').scrollIntoView({ behavior: 'smooth' }));
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const sequence = ++loadSequence;
  try {
    if (file.size > 5_000_000) throw new Error('파일은 5 MB 이하여야 합니다.');
    const next = createDataProvider(await file.text());
    if (sequence === loadSequence) { installProvider(next); $('dataset').value = 'imported'; }
  } catch (error) { if (sequence === loadSequence) failure(error); }
  event.target.value = '';
});
for (const type of ['csv', 'md']) $('export-' + type).addEventListener('click', () => {
  if (!provider || !view || view.empty) return;
  try {
    const data = provider.exportRows(lastFilters);
    if (data.rows.length !== view.summary.projects) throw new Error('화면과 내보내기 건수가 다릅니다. 자료 모듈 연결을 확인해 주세요.');
    const content = type === 'csv' ? serializeCsv(data) : serializeMarkdown(data);
    downloadExport(content, `school-design-${provider.snapshot.is_demo ? 'demo-' : ''}${lastFilters.asOf}.${type}`, type === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8');
    message(`${provider.snapshot.is_demo ? '가상 ' : ''}설계사업 ${data.rows.length}건의 ${type.toUpperCase()} 다운로드를 시작했습니다. 자료 기준일·조회 조건·출처를 포함합니다.`);
  } catch (error) { failure(error); }
});
loadDataset();
