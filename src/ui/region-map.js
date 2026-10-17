import { REGIONS, UNKNOWN_REGION_LABEL } from '../data/normalize.js';
import { el } from './dom.js';

const SHORT_LABELS = new Map([
  ['11', '서울'], ['26', '부산'], ['27', '대구'], ['28', '인천'], ['29', '광주'],
  ['30', '대전'], ['31', '울산'], ['36', '세종'], ['41', '경기'], ['51', '강원'],
  ['43', '충북'], ['44', '충남'], ['52', '전북'], ['46', '전남'], ['47', '경북'],
  ['48', '경남'], ['50', '제주'],
]);
const VALID_CODES = new Set([...REGIONS.map(region => region.code), 'unknown']);

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

function outline() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 560 650');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'region-map-outline');
  const path = (d, className) => {
    const node = document.createElementNS(svgNS, 'path');
    node.setAttribute('d', d);
    node.setAttribute('class', className);
    svg.append(node);
  };
  // Authored here as a deliberately simplified backdrop, not traced boundaries.
  path('M150 62 C182 42 212 76 248 60 L298 30 L350 10 C390 32 405 83 432 132 '
    + 'L470 207 C488 245 502 280 507 321 L521 365 L506 405 L479 438 '
    + 'L438 457 L405 477 L367 465 L337 482 L301 473 L268 502 L229 513 '
    + 'L206 532 L168 508 L145 479 L109 464 L79 445 L55 407 L77 377 '
    + 'L92 346 L80 308 L70 271 L51 242 L66 214 L45 178 L67 143 '
    + 'L74 112 L108 101 L133 80 Z', 'region-map-land');
  path('M83 618 C104 598 139 592 173 598 C194 602 210 610 197 625 '
    + 'C179 642 139 645 105 637 C88 634 77 627 83 618 Z', 'region-map-land');
  path('M79 558 L225 558', 'region-map-inset-line');
  return svg;
}

function countText(entry) {
  return entry.hasData ? `수집 사례 ${entry.count.toLocaleString('ko-KR')}건` : '집계 미제공';
}

/**
 * rows: view.byRegion ({code,label,count}); callback receives '', 'unknown',
 * or a canonical two-digit region code. It may synchronously rebuild this view.
 */
export function renderRegionMap(container, { regions, selectedRegion = '', onSelect }) {
  const entries = regionMapEntries(regions);
  const selected = VALID_CODES.has(selectedRegion) ? selectedRegion : '';
  // Keep a live region across root redraws so selection changes are announced.
  const selection = container.querySelector('.region-map-selection') ??
    el('p', { class: 'region-map-selection', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  container.replaceChildren();
  container.classList.add('region-map-panel');

  function choose(code) {
    onSelect(code);
    // Root's render() replaces the clicked node. Find the new equivalent without
    // scrolling the page, preserving the keyboard user's place in the map.
    const current = [...container.querySelectorAll('button[data-region]')].find(button => button.dataset.region === code);
    current?.focus({ preventScroll: true });
  }

  const heading = el('div', { class: 'region-map-heading' }, [
    el('div', {}, [el('p', { class: 'eyebrow' }, 'EXPLORE BY REGION'), el('h2', {}, '지도에서 지역을 선택하세요')]),
    el('span', { class: 'region-map-caption' }, '위치 이해를 돕는 개략도 · 실제 행정경계 아님'),
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

  const canvas = el('div', { class: 'region-map-canvas' }, outline());
  const markers = el('div', { class: 'region-map-markers', role: 'group', 'aria-label': '17개 시도 선택' });
  for (const entry of entries.filter(item => item.code !== 'unknown')) {
    const active = selected === entry.code;
    const button = el('button', {
      type: 'button', class: 'region-map-marker', 'data-region': entry.code,
      'data-count-status': entry.status, 'aria-pressed': String(active),
      'aria-label': `${entry.label}, ${countText(entry)}`,
      title: `${entry.label} · ${countText(entry)}`,
    }, [
      el('span', { class: 'region-map-name' }, entry.shortLabel),
      el('span', { class: 'region-map-count' }, entry.hasData ? `${entry.count.toLocaleString('ko-KR')}건` : '미제공'),
      el('span', { class: 'region-map-selected-mark', 'aria-hidden': 'true' }, active ? '✓' : ''),
    ]);
    button.addEventListener('click', () => choose(entry.code));
    markers.append(button);
  }
  canvas.append(markers);
  const explanation = el('div', { class: 'region-map-explanation' }, [
    el('p', {}, '숫자는 현재 조회 조건의 수집 사례입니다. 지역을 누르면 시도 선택 상자와 사례·표·내보내기에 같은 조건이 적용됩니다.'),
    el('p', {}, '0건은 현재 조회 결과가 없다는 뜻이며, 해당 지역의 전체 설계사업이 없다는 뜻은 아닙니다. ‘미제공’은 유효한 집계가 전달되지 않은 상태입니다.'),
    el('p', {}, '여러 시도에 걸친 사업은 각 지역에 표시될 수 있어 시도별 숫자의 합과 전체 고유 사업 수가 다를 수 있습니다.'),
    el('p', { class: 'region-map-key' }, [el('span', { class: 'region-map-selected-swatch', 'aria-hidden': 'true' }), '초록색과 ✓는 선택한 지역을 뜻합니다. 색의 진하기는 건수와 관계없습니다.']),
    el('p', { class: 'region-map-geography-note' }, '수도권·광역시를 누르기 쉽게 벌려 배치했습니다. 위치·면적·거리·해안선·섬의 생략은 실제 지형이나 행정 경계를 나타내지 않습니다.'),
  ]);
  container.append(heading, toolbar, selection, canvas, explanation);
  const selectedEntry = entries.find(entry => entry.code === selected);
  selection.textContent = selectedEntry ? `선택한 지역: ${selectedEntry.label} · ${countText(selectedEntry)}` : '선택한 지역: 전체 시도';
}
