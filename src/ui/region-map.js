import {GYEONGGI_CITIES, GYEONGGI_BOUNDARY_AS_OF} from '../domain/gyeonggi.js';
import {el} from './dom.js';
import {GYEONGGI_REGIONS, GYEONGGI_DISTRICTS, PROJECTION} from './region-geometry.js';

const popupCleanups = new WeakMap();

/** Presentation only: missing or duplicate count rows are never converted to zero. */
export function regionMapEntries(regions, cityCode = '') {
  const city = GYEONGGI_CITIES.find(row => row.code === cityCode);
  const definitions = cityCode ? (city?.districts ?? []) : GYEONGGI_CITIES;
  const rows = Array.isArray(regions) ? regions : [];
  return [...definitions, {code: 'unknown', name: cityCode ? '구 미확인' : '시·군 미확인'}].map(({code, name}) => {
    const matches = rows.filter(row => row?.code === code);
    const value = matches[0]?.count;
    const status = !matches.length ? 'missing' : matches.length > 1 ? 'duplicate'
      : Number.isSafeInteger(value) && value >= 0 ? 'available' : 'invalid';
    return {code, label: name, shortLabel: name, count: status === 'available' ? value : null,
      hasData: status === 'available', status};
  });
}

export function regionPopupPosition({x, y, width, height, popupWidth, popupHeight}) {
  const gap = 14, inset = 8;
  const left = x + gap + popupWidth <= width - inset ? x + gap : x - gap - popupWidth;
  const top = y + gap + popupHeight <= height - inset ? y + gap : y - gap - popupHeight;
  return {left: Math.max(inset, Math.min(left, width - popupWidth - inset)),
    top: Math.max(inset, Math.min(top, height - popupHeight - inset))};
}

/** Fit a selected city's real geometry without stretching either axis. */
export function regionMapViewport(cityCode = '') {
  const city = GYEONGGI_REGIONS.find(row => row.code === cityCode);
  if (!city) return {x: 0, y: 0, width: PROJECTION.width, height: PROJECTION.height};
  const bounds = city.bounds, aspect = PROJECTION.width / PROJECTION.height;
  const height = Math.max(bounds.height, bounds.width / aspect) * 1.16;
  const width = height * aspect;
  return {x: bounds.x + bounds.width / 2 - width / 2, y: bounds.y + bounds.height / 2 - height / 2, width, height};
}

function svgNode(tag, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
const countText = entry => entry?.hasData ? `수집 사례 ${entry.count.toLocaleString('ko-KR')}건` : '집계 미제공';

/**
 * regions: all city counts before city filtering; districts: selected-city counts
 * before district filtering. Callbacks update the same shared query/export state.
 */
export function renderRegionMap(container, {regions, districts = [], selectedRegion = '', selectedDistrict = '', onSelect, onSelectDistrict}) {
  popupCleanups.get(container)?.();
  const city = GYEONGGI_CITIES.find(row => row.code === selectedRegion);
  const districtMode = Boolean(city?.districts.length);
  const entries = regionMapEntries(districtMode ? districts : regions, districtMode ? city.code : '');
  const cityEntries = regionMapEntries(regions);
  const selected = districtMode ? selectedDistrict : selectedRegion;
  const geometries = districtMode ? GYEONGGI_DISTRICTS.filter(row => row.parentCode === city.code) : GYEONGGI_REGIONS;
  const geometryByCode = new Map(geometries.map(row => [row.code, row]));
  const viewport = regionMapViewport(districtMode ? city.code : '');
  const selection = container.querySelector('.region-map-selection') ??
    el('p', {class: 'region-map-selection', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true'});
  const listOpen = container.querySelector('.region-map-list')?.open ?? false;
  container.replaceChildren();
  container.classList.add('region-map-panel');
  container.dataset.level = districtMode ? 'district' : 'city';

  function choose(code, fromPolygon = false) {
    if (districtMode) onSelectDistrict?.(code);
    else onSelect(code);
    const attribute = fromPolygon ? 'regionShape' : 'region';
    const selector = fromPolygon ? '[data-region-shape]' : 'button[data-region]';
    const replacement = [...container.querySelectorAll(selector)].find(node => node.dataset[attribute] === code);
    // Selecting a city with general districts changes the map level. The city
    // overview button takes focus instead of leaving focus in a removed element.
    (replacement ?? container.querySelector('[data-city-overview]') ?? container.querySelector('[data-map-reset]'))?.focus({preventScroll: true});
  }
  const heading = el('div', {class: 'region-map-heading'}, [
    el('div', {}, [el('p', {class: 'eyebrow'}, 'GYEONGGI'), el('h2', {}, districtMode ? `${city.name} · 구 선택` : '경기도 시·군별 사례')]),
    el('span', {class: 'region-map-caption'}, districtMode ? `${city.districts.length}개 일반구` : '31개 시·군'),
  ]);
  const toolbar = el('div', {class: 'region-map-toolbar'});
  const reset = el('button', {type: 'button', 'data-map-reset': '', 'aria-pressed': String(!selectedRegion),
    'aria-label': '경기도 전체 보기, 시군과 구 선택 해제'}, districtMode ? '← 경기도 전체' : '경기도 전체');
  reset.addEventListener('click', () => {onSelect(''); container.querySelector('[data-map-reset]')?.focus({preventScroll: true});});
  toolbar.append(reset);
  if (districtMode) {
    const overview = el('button', {type: 'button', 'data-city-overview': '', 'data-region': '', 'aria-pressed': String(!selectedDistrict)}, `${city.name} 전체`);
    overview.addEventListener('click', () => choose(''));
    toolbar.append(overview);
  }
  const unknown = entries.find(row => row.code === 'unknown');
  const unknownButton = el('button', {type: 'button', 'data-region': 'unknown', 'aria-pressed': String(selected === 'unknown'),
    'aria-label': `${unknown.label}, ${countText(unknown)}`}, `${unknown.label} · ${unknown.hasData ? `${unknown.count}건` : '미제공'}`);
  unknownButton.addEventListener('click', () => choose('unknown'));
  toolbar.append(unknownButton);

  const svg = svgNode('svg', {viewBox: `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`,
    preserveAspectRatio: 'xMidYMid meet', class: 'region-map-outline', role: 'group',
    'aria-label': `${districtMode ? city.name + ' 일반구' : '경기도 시군'} 행정경계 지도. Tab 이동, Enter 또는 Space 선택.`});
  const canvas = el('div', {class: 'region-map-canvas'}, svg);
  const popup = el('div', {class: 'region-map-popup', role: 'tooltip', id: `${container.id || 'region-map'}-tooltip`, hidden: true});
  canvas.append(popup);
  const shapes = new Map();
  let hoveredCode = null, focusedCode = null, closeTimer, dismissed = false, focusPreview = false;
  function hidePopup() {
    clearTimeout(closeTimer); popup.hidden = true; document.removeEventListener('keydown', handleEscape);
    for (const shape of shapes.values()) {shape.classList.remove('is-previewed'); shape.removeAttribute('aria-describedby');}
  }
  function handleEscape(event) { if (event.key === 'Escape') {dismissed = true; hidePopup();} }
  popupCleanups.set(container, hidePopup);
  function showPopup(entry, event) {
    clearTimeout(closeTimer);
    if (dismissed || !canvas.isConnected) return;
    for (const [code, shape] of shapes) {shape.classList.toggle('is-previewed', code === entry.code); shape.removeAttribute('aria-describedby');}
    shapes.get(entry.code)?.setAttribute('aria-describedby', popup.id);
    const subdistricts = !districtMode && GYEONGGI_CITIES.find(row => row.code === entry.code)?.districts.length;
    popup.replaceChildren(el('strong', {class: 'region-map-popup-name'}, entry.label),
      el('span', {class: 'region-map-popup-count'}, countText(entry)),
      el('span', {class: 'region-map-popup-hint'}, subdistricts ? '선택하면 구별로 더 살펴볼 수 있습니다.'
        : entry.hasData && entry.count === 0 ? '현재 조건에 맞는 수집 사례가 없습니다.' : '클릭 또는 Enter로 선택'));
    popup.hidden = false; document.addEventListener('keydown', handleEscape);
    const rect = canvas.getBoundingClientRect();
    const point = geometryByCode.get(entry.code)?.labelPoint ?? {x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2};
    const position = regionPopupPosition({x: event ? event.clientX - rect.left : (point.x - viewport.x) / viewport.width * rect.width,
      y: event ? event.clientY - rect.top : (point.y - viewport.y) / viewport.height * rect.height,
      width: rect.width, height: rect.height, popupWidth: popup.offsetWidth, popupHeight: popup.offsetHeight});
    popup.style.left = `${position.left}px`; popup.style.top = `${position.top}px`;
  }
  function leaveRegion() {
    hoveredCode = null; clearTimeout(closeTimer);
    closeTimer = setTimeout(() => focusedCode ? showPopup(entries.find(row => row.code === focusedCode)) : hidePopup(), 150);
  }
  function previewPointer(entry, event) {
    if (event.pointerType === 'touch' || (focusPreview && event.type !== 'pointermove') || (event.type === 'pointermove' && !focusPreview)) return;
    focusPreview = false; dismissed = false; hoveredCode = entry.code; showPopup(entry, event);
  }
  const visibleEntries = entries.filter(row => geometryByCode.has(row.code));
  for (const entry of visibleEntries) {
    const shape = svgNode('g', {class: 'region-map-area', 'data-region-shape': entry.code,
      tabindex: '0', role: 'button', 'aria-pressed': String(selected === entry.code), 'aria-label': `${entry.label}, ${countText(entry)}`});
    for (const d of geometryByCode.get(entry.code).paths) shape.append(svgNode('path', {d, 'fill-rule': 'evenodd'}));
    shape.addEventListener('pointerenter', event => previewPointer(entry, event));
    shape.addEventListener('pointermove', event => previewPointer(entry, event));
    shape.addEventListener('pointerleave', leaveRegion);
    shape.addEventListener('focus', () => {focusPreview = true; focusedCode = entry.code; dismissed = false; showPopup(entry);});
    shape.addEventListener('blur', () => {focusedCode = null; if (!hoveredCode) hidePopup();});
    shape.addEventListener('click', () => choose(entry.code, true));
    shape.addEventListener('keydown', event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); choose(entry.code, true);}});
    shapes.set(entry.code, shape); svg.append(shape);
  }
  const labels = svgNode('g', {class: 'region-map-labels', 'aria-hidden': 'true'});
  for (const entry of visibleEntries) {
    const point = geometryByCode.get(entry.code).labelPoint;
    const label = svgNode('text', {x: point.x, y: point.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      class: selected === entry.code ? 'is-selected' : '',
      'font-size': viewport.width / 560 * (districtMode ? 17 : 12), 'stroke-width': viewport.width / 560 * 3});
    label.textContent = `${entry.shortLabel}${selected === entry.code ? ' ✓' : ''}`;
    label.addEventListener('pointerenter', event => previewPointer(entry, event));
    label.addEventListener('pointermove', event => previewPointer(entry, event));
    label.addEventListener('pointerleave', leaveRegion);
    label.addEventListener('click', () => choose(entry.code, true)); labels.append(label);
  }
  svg.append(labels);
  popup.addEventListener('pointerenter', () => clearTimeout(closeTimer));
  popup.addEventListener('pointerleave', leaveRegion);
  canvas.addEventListener('pointerdown', event => {if (event.target === svg || event.target === canvas) {dismissed = true; hidePopup();}});

  const list = el('details', {class: 'region-map-list', open: listOpen}, el('summary', {}, districtMode ? '구 이름으로 선택' : '시·군 이름으로 선택'));
  const markers = el('div', {class: 'region-map-markers', role: 'group', 'aria-label': districtMode ? `${city.name} 구 선택` : '31개 시군 선택'});
  for (const entry of visibleEntries) {
    const button = el('button', {type: 'button', class: 'region-map-marker', 'data-region': entry.code,
      'data-count-status': entry.status, 'aria-pressed': String(selected === entry.code), 'aria-label': `${entry.label}, ${countText(entry)}`},
    [el('span', {class: 'region-map-name'}, entry.shortLabel), el('span', {class: 'region-map-count'}, entry.hasData ? `${entry.count}건` : '미제공')]);
    button.addEventListener('click', () => choose(entry.code));
    button.addEventListener('focus', () => {dismissed = false; focusedCode = entry.code; showPopup(entry);});
    button.addEventListener('blur', () => {focusedCode = null; if (!hoveredCode) hidePopup();}); markers.append(button);
  }
  list.append(markers);
  const explanation = el('details', {class: 'region-map-explanation'}, [el('summary', {}, '지도 기준·출처'),
    el('p', {}, `경계 기준 ${GYEONGGI_BOUNDARY_AS_OF} · 원주소에 명시된 시·군과 구만 연결합니다. 구가 없는 옛주소는 ‘구 미확인’에 남깁니다.`),
    el('p', {}, '숫자는 현재 조건의 수집 사례 수이며 지역 전체 설계사업 통계가 아닙니다. 구 선택 전 건수로 비교하며 선택 조건은 사례·표·내보내기에 함께 적용합니다.'),
    el('p', {}, 'Tab으로 구역을 이동하고 Enter·Space로 선택합니다. Esc는 팝업을 닫습니다. 초록색은 선택 지역이며 건수의 크기를 뜻하지 않습니다.'),
    el('p', {class: 'region-map-source'}, ['통계청 SGIS(공공누리 제1유형) · ',
      el('a', {href: 'https://github.com/vuski/admdongkor', target: '_blank', rel: 'noopener noreferrer'}, 'vuski/admdongkor'), ' (CC BY 4.0). 시군·구 합치기·공유 경계 정리·단순화. ',
      el('a', {href: 'https://github.com/yunzecho-eng/school-design-trends/blob/main/docs/MAP_SOURCE.md', target: '_blank', rel: 'noopener noreferrer'}, '출처·변환 기록')]),
  ]);
  container.append(heading, toolbar, selection, canvas, list, explanation);
  const selectedEntry = entries.find(row => row.code === selected);
  const selectedCity = cityEntries.find(row => row.code === selectedRegion);
  selection.textContent = selectedEntry ? `${districtMode ? city.name + ' · ' : ''}${selectedEntry.label} · ${countText(selectedEntry)}`
    : districtMode ? `${city.name} 전체 · ${countText(selectedCity)}` : '지역을 선택하면 오른쪽 결과가 함께 바뀝니다.';
}
