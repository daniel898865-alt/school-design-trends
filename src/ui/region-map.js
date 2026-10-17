import { REGIONS, UNKNOWN_REGION_LABEL } from '../data/normalize.js';
import { el } from './dom.js';
import { KOREA_REGIONS, projectPoint } from './region-geometry.js';

const SHORT_LABELS = new Map([
  ['11', '서울'], ['26', '부산'], ['27', '대구'], ['28', '인천'], ['29', '광주'],
  ['30', '대전'], ['31', '울산'], ['36', '세종'], ['41', '경기'], ['51', '강원'],
  ['43', '충북'], ['44', '충남'], ['52', '전북'], ['46', '전남'], ['47', '경북'],
  ['48', '경남'], ['50', '제주'],
]);
const VALID_CODES = new Set([...REGIONS.map(region => region.code), 'unknown']);
const popupCleanups = new WeakMap();

// Label anchors only. The hit targets are the source's administrative polygons,
// not these reference points. Small areas also have native buttons below the map.
const MARKERS = new Map([
  ['11', { point: [126.98, 37.57] }],
  ['26', { point: [129.07, 35.18] }],
  ['27', { point: [128.60, 35.87] }],
  ['28', { point: [126.50, 37.75] }],
  ['29', { point: [126.85, 35.16] }],
  ['30', { point: [127.38, 36.35] }],
  ['31', { point: [129.31, 35.54] }],
  ['36', { point: [127.27, 36.60] }],
  ['41', { point: [127.48, 37.44] }],
  ['51', { point: [128.30, 37.70] }],
  ['43', { point: [127.70, 36.70] }],
  ['44', { point: [126.80, 36.52] }],
  ['52', { point: [127.10, 35.75] }],
  ['46', { point: [126.90, 34.80] }],
  ['47', { point: [128.75, 36.30] }],
  ['48', { point: [128.22, 35.28] }],
  ['50', { point: [126.54, 33.38] }],
]);

/**
 * Presentation mapping only: use the domain's count without summing, coercing,
 * inferring absent rows as zero, or silently choosing between duplicate rows.
 */
export function regionMapEntries(regions) {
  const rows = Array.isArray(regions) ? regions : [];
  const grouped = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !VALID_CODES.has(row.code)) continue;
    grouped.set(row.code, [...(grouped.get(row.code) ?? []), row]);
  }
  const definitions = [...REGIONS.map(({ code, name }) => ({ code, label: name })),
    { code: 'unknown', label: UNKNOWN_REGION_LABEL }];
  return definitions.map(({ code, label }) => {
    const matches = grouped.get(code) ?? [];
    const value = matches[0]?.count;
    const status = matches.length === 0 ? 'missing' : matches.length > 1 ? 'duplicate'
      : Number.isSafeInteger(value) && value >= 0 ? 'available' : 'invalid';
    return {
      code, label, shortLabel: SHORT_LABELS.get(code) ?? label,
      count: status === 'available' ? value : null,
      hasData: status === 'available', status,
    };
  });
}

function svgNode(tag, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

/** Keep a popup within its map even near coasts and on narrow screens. */
export function regionPopupPosition({ x, y, width, height, popupWidth, popupHeight }) {
  const gap = 14;
  const inset = 8;
  const left = x + gap + popupWidth <= width - inset ? x + gap : x - gap - popupWidth;
  const top = y + gap + popupHeight <= height - inset ? y + gap : y - gap - popupHeight;
  return {
    left: Math.max(inset, Math.min(left, width - popupWidth - inset)),
    top: Math.max(inset, Math.min(top, height - popupHeight - inset)),
  };
}

function countText(entry) {
  return entry.hasData ? `수집 사례 ${entry.count.toLocaleString('ko-KR')}건` : '집계 미제공';
}

/**
 * rows: view.byRegion ({code,label,count}); callback receives '', 'unknown',
 * or a canonical two-digit region code. It may synchronously rebuild this view.
 */
export function renderRegionMap(container, { regions, selectedRegion = '', onSelect }) {
  popupCleanups.get(container)?.();
  const entries = regionMapEntries(regions);
  const selected = VALID_CODES.has(selectedRegion) ? selectedRegion : '';
  // Keep a live region across root redraws so selection changes are announced.
  const selection = container.querySelector('.region-map-selection') ??
    el('p', { class: 'region-map-selection', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const listOpen = container.querySelector('.region-map-list')?.open ?? false;
  container.replaceChildren();
  container.classList.add('region-map-panel');

  function choose(code, fromPolygon = false) {
    onSelect(code);
    // Root's render() replaces the clicked node. Find the new equivalent without
    // scrolling the page, preserving the keyboard user's place in the map.
    const selector = fromPolygon ? '[data-region-shape]' : 'button[data-region]';
    const current = [...container.querySelectorAll(selector)].find(node =>
      (fromPolygon ? node.dataset.regionShape : node.dataset.region) === code);
    current?.focus({ preventScroll: true });
  }

  const heading = el('div', { class: 'region-map-heading' }, [
    el('div', {}, [el('p', { class: 'eyebrow' }, 'EXPLORE BY REGION'), el('h2', {}, '지도에서 지역을 선택하세요')]),
    el('span', { class: 'region-map-caption' }, '경계 기준 2026.04.01 · 17개 지역 비교'),
  ]);
  const toolbar = el('div', { class: 'region-map-toolbar' });
  const reset = el('button', {
    type: 'button', 'data-region': '', 'aria-pressed': String(selected === ''),
    'aria-label': '전체 시도 보기, 지역 선택 해제',
  }, '전체 시도');
  reset.addEventListener('click', () => choose(''));
  const unknown = entries.find(entry => entry.code === 'unknown');
  const unknownButton = el('button', {
    type: 'button', 'data-region': 'unknown', 'aria-pressed': String(selected === 'unknown'),
    'aria-label': `${unknown.label}, ${countText(unknown)}`,
  }, `${unknown.label} · ${countText(unknown)}`);
  unknownButton.addEventListener('click', () => choose('unknown'));
  toolbar.append(reset, unknownButton);

  const svg = svgNode('svg', { viewBox: '0 0 560 650', preserveAspectRatio: 'xMidYMid meet',
    class: 'region-map-outline', role: 'group', 'aria-label': '2026년 4월 1일 기준 시도별 지도. Tab으로 이동하고 Enter 또는 Space로 선택합니다.' });
  const canvas = el('div', { class: 'region-map-canvas' }, svg);
  const popup = el('div', { class: 'region-map-popup', role: 'tooltip', id: `${container.id || 'region-map'}-tooltip`, hidden: true });
  canvas.append(popup);
  const shapes = new Map();
  let hoveredCode = null;
  let focusedCode = null;
  let closeTimer;
  let dismissed = false;
  let focusPreview = false;

  function hidePopup() {
    clearTimeout(closeTimer);
    popup.hidden = true;
    document.removeEventListener('keydown', handleEscape);
    for (const shape of shapes.values()) {
      shape.classList.remove('is-previewed');
      shape.removeAttribute('aria-describedby');
    }
  }
  function handleEscape(event) {
    if (event.key === 'Escape') { dismissed = true; hidePopup(); }
  }
  popupCleanups.set(container, hidePopup);
  function showPopup(entry, event) {
    clearTimeout(closeTimer);
    if (dismissed || !canvas.isConnected) return;
    for (const [code, shape] of shapes) {
      shape.classList.toggle('is-previewed', code === entry.code);
      shape.removeAttribute('aria-describedby');
    }
    shapes.get(entry.code)?.setAttribute('aria-describedby', popup.id);
    popup.replaceChildren(
      el('span', { class: 'region-map-popup-kicker' }, '현재 조회 조건'),
      el('strong', { class: 'region-map-popup-name' }, entry.label),
      el('span', { class: 'region-map-popup-count' }, countText(entry)),
      el('span', { class: 'region-map-popup-hint' }, entry.hasData && entry.count === 0
        ? '현재 조건에 맞는 수집 사례가 없습니다.' : '클릭 또는 Enter로 이 지역을 선택하세요.'),
    );
    popup.hidden = false;
    // Hover can open the popup while keyboard focus is outside the map.
    document.addEventListener('keydown', handleEscape);
    const rect = canvas.getBoundingClientRect();
    const point = projectPoint(...MARKERS.get(entry.code).point);
    const position = regionPopupPosition({
      x: event ? event.clientX - rect.left : point.x / 560 * rect.width,
      y: event ? event.clientY - rect.top : point.y / 650 * rect.height,
      width: rect.width, height: rect.height,
      popupWidth: popup.offsetWidth, popupHeight: popup.offsetHeight,
    });
    popup.style.left = `${position.left}px`;
    popup.style.top = `${position.top}px`;
  }
  function leaveRegion() {
    hoveredCode = null;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (focusedCode) showPopup(entries.find(entry => entry.code === focusedCode));
      else hidePopup();
    }, 150);
  }
  function previewPointer(entry, event) {
    if (event.pointerType === 'touch') return;
    // Re-rendering beneath a stationary mouse can emit pointerenter. Preserve
    // keyboard/selection information until the user actually moves the pointer.
    if (focusPreview && event.type !== 'pointermove') return;
    if (event.type === 'pointermove' && !focusPreview) return;
    focusPreview = false;
    dismissed = false;
    hoveredCode = entry.code;
    showPopup(entry, event);
  }
  for (const entry of entries.filter(item => item.code !== 'unknown')) {
    const geometry = KOREA_REGIONS.find(region => region.code === entry.code);
    const shape = svgNode('g', { class: 'region-map-area', 'data-region-shape': entry.code,
      tabindex: '0', role: 'button', 'aria-pressed': String(selected === entry.code),
      'aria-label': `${entry.label}, ${countText(entry)}` });
    for (const d of geometry.paths) shape.append(svgNode('path', { d, 'fill-rule': 'evenodd' }));
    shape.addEventListener('pointerenter', event => previewPointer(entry, event));
    shape.addEventListener('pointermove', event => previewPointer(entry, event));
    shape.addEventListener('pointerleave', leaveRegion);
    shape.addEventListener('focus', () => { focusPreview = true; focusedCode = entry.code; dismissed = false; showPopup(entry); });
    shape.addEventListener('blur', () => { focusedCode = null; if (!hoveredCode) hidePopup(); });
    shape.addEventListener('click', () => choose(entry.code, true));
    shape.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose(entry.code, true);
      }
    });
    shapes.set(entry.code, shape);
    svg.append(shape);
  }
  const labels = svgNode('g', { class: 'region-map-labels', 'aria-hidden': 'true' });
  for (const entry of entries.filter(item => item.code !== 'unknown')) {
    const point = projectPoint(...MARKERS.get(entry.code).point);
    const label = svgNode('text', { x: point.x, y: point.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      class: selected === entry.code ? 'is-selected' : '' });
    label.textContent = `${entry.shortLabel}${selected === entry.code ? ' ✓' : ''}`;
    // Small-city labels may extend beyond the polygon. Clicking the name must
    // still select that named region, rather than the neighbouring region below.
    label.addEventListener('pointerenter', event => previewPointer(entry, event));
    label.addEventListener('pointermove', event => previewPointer(entry, event));
    label.addEventListener('pointerleave', leaveRegion);
    label.addEventListener('click', () => choose(entry.code, true));
    labels.append(label);
  }
  svg.append(labels);
  popup.addEventListener('pointerenter', () => clearTimeout(closeTimer));
  popup.addEventListener('pointerleave', leaveRegion);
  canvas.addEventListener('pointerdown', event => {
    if (event.target === svg || event.target === canvas) { dismissed = true; hidePopup(); }
  });

  const list = el('details', { class: 'region-map-list', open: listOpen },
    el('summary', {}, '지역 이름으로 선택 · 작은 구역은 아래 버튼을 이용하세요'));
  const markers = el('div', { class: 'region-map-markers', role: 'group', 'aria-label': '17개 시도 선택' });
  for (const entry of entries.filter(item => item.code !== 'unknown')) {
    const active = selected === entry.code;
    const button = el('button', {
      type: 'button', class: 'region-map-marker', 'data-region': entry.code,
      'data-count-status': entry.status, 'aria-pressed': String(active),
      'aria-label': `${entry.label}, ${countText(entry)}`,
    }, [
      el('span', { class: 'region-map-name' }, entry.shortLabel),
      el('span', { class: 'region-map-count' }, entry.hasData ? `${entry.count.toLocaleString('ko-KR')}건` : '미제공'),
      el('span', { class: 'region-map-selected-mark', 'aria-hidden': 'true' }, active ? '✓' : ''),
    ]);
    button.addEventListener('click', () => choose(entry.code));
    button.addEventListener('pointerenter', () => { dismissed = false; hoveredCode = entry.code; showPopup(entry); });
    button.addEventListener('pointerleave', leaveRegion);
    button.addEventListener('focus', () => { dismissed = false; focusedCode = entry.code; showPopup(entry); });
    button.addEventListener('blur', () => { focusedCode = null; if (!hoveredCode) hidePopup(); });
    markers.append(button);
  }
  list.append(markers);
  const explanation = el('div', { class: 'region-map-explanation' }, [
    el('p', {}, '숫자는 현재 조회 조건의 수집 사례입니다. 지역을 누르면 시도 선택 상자와 사례·표·내보내기에 같은 조건이 적용됩니다.'),
    el('p', {}, '0건은 현재 조회 결과가 없다는 뜻이며, 해당 지역의 전체 설계사업이 없다는 뜻은 아닙니다. ‘미제공’은 유효한 집계가 전달되지 않은 상태입니다.'),
    el('p', {}, '여러 시도에 걸친 사업은 각 지역에 표시될 수 있어 시도별 숫자의 합과 전체 고유 사업 수가 다를 수 있습니다.'),
    el('p', { class: 'region-map-key' }, [el('span', { class: 'region-map-selected-swatch', 'aria-hidden': 'true' }), '초록색과 ✓는 선택한 지역을 뜻합니다. 색의 진하기는 건수와 관계없습니다.']),
    el('p', { class: 'region-map-geography-note' }, '경계에 마우스를 올리거나 Tab으로 이동하면 지역 정보가 표시됩니다. 클릭·Enter·Space로 선택하고 Esc로 팝업을 닫습니다. 작은 구역은 ‘지역 이름으로 선택’을 펼쳐 누를 수 있습니다.'),
    el('p', { class: 'region-map-source' }, [ '경계 기준 2026.04.01 · 기존 17개 지역 집계와 비교하기 위한 지도입니다. 2026년 7월 이후 행정구역 개편은 반영하지 않았습니다. ',
      el('a', { href: 'https://github.com/yunzecho-eng/school-design-trends/blob/main/docs/MAP_SOURCE.md', target: '_blank', rel: 'noopener noreferrer' }, '자료 출처·가공 방법') ]),
    el('p', { class: 'region-map-source' }, [ '원자료: 통계청 SGIS(공공누리 제1유형) · 가공: ',
      el('a', { href: 'https://github.com/vuski/admdongkor', target: '_blank', rel: 'noopener noreferrer' }, 'vuski/admdongkor'), ' · ',
      el('a', { href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', rel: 'noopener noreferrer' }, 'CC BY 4.0'), ' · 이 페이지에서 시도 합치기·공유 경계 정리·단순화 적용' ]),
  ]);
  container.append(heading, toolbar, selection,
    el('p', { class: 'region-map-instruction' }, '구역 위에 마우스를 올려 살펴보고, 클릭해 지역을 선택하세요.'),
    canvas, list, explanation);
  const selectedEntry = entries.find(entry => entry.code === selected);
  selection.textContent = selectedEntry ? `선택한 지역: ${selectedEntry.label} · ${countText(selectedEntry)}` : '선택한 지역: 전체 시도';
}
