import {el, emptyState} from './dom.js';
import {createProjectThumbnail, primaryProjectSource} from './project-media.js';
import {summarizeYearTrends, YEAR_DATE_LABELS} from '../domain/year-trends.js';
import {renderSpatialModel} from './spatial-model.js';

const percent = (value) => value === null ? '—' : `${(value * 100).toLocaleString('ko-KR', {maximumFractionDigits: 1})}%`;
const signed = (value, suffix = '') => `${value > 0 ? '+' : ''}${value.toLocaleString('ko-KR', {maximumFractionDigits: 1})}${suffix}`;

function blockHeading(step, title, text) {
  return el('div', {class: 'year-block-heading'}, [
    el('span', {class: 'year-step', 'aria-hidden': 'true'}, step),
    el('div', {}, [el('h3', {}, title), el('p', {class: 'muted'}, text)]),
  ]);
}

function observationBlock(year, result, onSelectTopic) {
  const section = el('section', {class: 'year-block year-observations'}, [
    blockHeading('01', '관측한 내용', year.precision === 'yearbook' ? `${year.year}년 공모집에 수록된 당선작 · 실제 사건 날짜 미확인` : `${year.year}년 · ${year.from} ~ ${year.to}${year.partial ? ' · 일부 기간' : ' · 연간 전체 기간'}`),
  ]);
  section.append(el('div', {class: 'year-facts', 'aria-label': '선택 연도 자료 건수'}, [
    el('p', {}, [el('strong', {}, String(year.project_count)), el('span', {}, '고유 사업')]),
    el('p', {}, [el('strong', {}, String(year.source_count)), el('span', {}, '연결 출처')]),
    el('p', {}, [el('strong', {}, String(year.unclassified)), el('span', {}, '미분류 사업')]),
    el('p', {}, [el('strong', {}, String(year.multiTagProjects)), el('span', {}, '복수 키워드 사업')]),
  ]));
  if (!year.project_count) {
    section.append(emptyState('이 연도에 집계할 사업이 없습니다',
      result.date_basis === 'completion_date'
        ? '설계사업의 준공일을 확인한 자료가 필요합니다. 다른 날짜를 준공일로 대신하지 않습니다.'
        : '기간·날짜 기준·지역·학교급 조건을 확인해 주세요. 날짜가 미확인인 사업은 제외합니다.'));
    return section;
  }
  const active = year.topics.filter((topic) => topic.projects > 0);
  if (!active.length) section.append(el('p', {class: 'notice'}, '주제 정보 미수록 · 등록된 키워드가 없습니다. 0건을 실제 해당 공간이 없다는 뜻으로 해석하지 않습니다.'));
  else {
    const list = el('ul', {class: 'year-keywords', 'aria-label': `${year.year}년 설계 키워드`});
    for (const topic of active) {
      const title = ['outdoor_learning','community_sharing','flexible_learning'].includes(topic.topic_id)
        ? el('button', {type:'button',class:'text-button','aria-label':`${topic.label} 공간 해석 보기`}, `${topic.label} · 공간 보기`)
        : el('span', {}, topic.label);
      if (title.tagName === 'BUTTON') title.addEventListener('click', () => onSelectTopic?.(topic.topic_id));
      list.append(el('li', {}, [
        title,
        el('progress', {max: year.project_count, value: topic.projects,
          'aria-label': `${topic.label}: ${topic.projects}/${year.project_count}건`}),
        el('strong', {}, `${topic.projects}건 · ${percent(topic.share)}`),
      ]));
    }
    section.append(list, el('p', {class: 'muted'}, '분모는 이 연도의 고유 사업 수입니다. 복수 키워드이므로 비율 합계가 100%를 넘을 수 있습니다.'));
  }
  const comparison = year.comparison;
  const compare = el('div', {class: 'year-comparison'});
  if (comparison.status === 'available') {
    compare.append(el('h4', {}, `${comparison.previous_year}년과 비교`),
      el('p', {}, year.precision === 'yearbook' ? `공모집 수록 당선작 수 ${signed(comparison.project_delta, '건')}. 발주 전체의 증감이 아닙니다.` : `동일하게 전체 연도를 포함한 조회에서 사업 수 ${signed(comparison.project_delta, '건')}.`));
    const changes = comparison.topic_changes.filter((item) => item.current_share > 0 || item.previous_share > 0);
    const table = el('table', {class: 'data-table year-change-table'}, [
      el('caption', {class: 'sr-only'}, '전년도 대비 키워드 구성비 변화'),
      el('thead', {}, el('tr', {}, ['키워드', comparison.previous_year, year.year, '구성비 차이'].map((label) => el('th', {scope: 'col'}, label)))),
      el('tbody', {}, changes.map((item) => el('tr', {}, [
        el('th', {scope: 'row'}, item.label), el('td', {}, percent(item.previous_share)),
        el('td', {}, percent(item.current_share)), el('td', {}, signed(item.percentage_point_change, '%p')),
      ]))),
    ]);
    if (changes.length) compare.append(el('div', {class: 'table-wrap'}, table));
    if (comparison.topic_status && comparison.topic_status !== 'available') compare.append(el('p', {class:'notice'}, '키워드 비교 보류 · 한쪽 연도에 주제 분류가 없거나 일부 자료만 분류되어 있습니다. 미수록을 감소로 계산하지 않습니다.'));
  } else {
    compare.append(el('h4', {}, '전년도 비교 보류'), el('p', {class: 'muted'},
      comparison.status === 'partial_period'
        ? '선택 연도 또는 바로 전 연도가 조회 기간에 일부만 포함됩니다. 연간 증감으로 표시하지 않습니다.'
        : `${comparison.previous_year}년 또는 선택 연도에 비교할 자료가 없습니다. 여러 해 전 자료로 대신하지 않습니다.`));
  }
  if (comparison.small_sample) compare.append(el('p', {class: 'notice'}, '선택 연도 또는 비교 연도의 사업이 5건 미만입니다. 작은 표본의 구성비 변화로 전체 설계시장의 흐름을 판단하지 마세요.'));
  section.append(compare);
  return section;
}

function examplesBlock(year, projects, snapshot, onOpenProject) {
  const section = el('section', {class: 'year-block'}, [
    blockHeading('02', '사례와 이미지로 확인', year.precision === 'yearbook' ? '같은 수록연도에서 식별자 순으로 최대 3건을 표시합니다. 통계적 대표성을 평가한 표본은 아닙니다.' : '선택 연도의 기준 날짜 최신순으로 최대 3건을 표시합니다. 통계적 대표성을 평가한 표본은 아닙니다.'),
  ]);
  const cards = el('div', {class: 'year-project-grid'});
  for (const id of year.representative_ids) {
    const project = projects.get(id);
    if (!project) continue;
    const title = project.title || '사업명 미확인';
    const button = el('button', {type: 'button', class: 'text-button'}, title);
    button.addEventListener('click', () => onOpenProject(project));
    const card = el('article', {class: 'year-project-card'}, [
      createProjectThumbnail(project, onOpenProject),
      el('div', {class: 'year-project-content'}, [el('h4', {}, button),
        el('p', {class: 'muted'}, `${year.precision === 'yearbook' ? `${year.year}년 수록` : project.basis_date} · ${project.region_name || '지역 미확인'}`),
        el('p', {}, project.summary || '직접 작성한 요약이 아직 없습니다.')]),
    ]);
    const source = primaryProjectSource(project, snapshot);
    if (source) card.lastElementChild.append(el('a', {href: source.url, target: '_blank', rel: 'noopener noreferrer',
      referrerpolicy: 'no-referrer'}, '연결된 원문 확인 ↗'));
    else card.lastElementChild.append(el('p', {class: 'muted'}, '원문 링크 미확인 · 상세에서 출처 기록을 확인하세요.'));
    cards.append(card);
  }
  section.append(cards.childElementCount ? cards : emptyState('살펴볼 사례를 기다리고 있습니다', '준공일과 이용 조건을 확인한 사례가 연결되면 이미지와 상세 내용을 함께 표시합니다.'));
  return section;
}

function outlookBlock(year, result, projects, onOpenProject) {
  const section = el('section', {class: 'year-block year-outlook'}, [
    blockHeading('03', '향후 전망 · 작성 대기', '관측한 내용과 전망을 구분합니다. 아래는 검토할 질문과 작성 항목이며 자동 예측 결과가 아닙니다.'),
    el('p', {class: 'notice'}, result.is_demo
      ? '가상 자료를 이용한 작성 틀입니다. 실제 설계 동향이나 향후 수요를 예측하지 않습니다.'
      : '분석 대상의 수집 범위와 누락을 확인하고 별도 검토를 마치기 전까지 전망을 확정하지 않습니다.'),
  ]);
  if (!year.outlook.hypotheses.length) {
    section.append(el('dl', {class: 'year-outlook-fields'}, [
      el('dt', {}, '검토할 가설'), el('dd', {}, '키워드 근거가 있는 사례 연결 후 작성'),
      el('dt', {}, '필요한 근거'), el('dd', {}, '연도별 동일 출처·범위의 자료, 누락 점검, 분류 검토'),
      el('dt', {}, '가정과 대안'), el('dd', {}, '자료 범위의 변화로 결과가 달라지는지 확인 필요'),
      el('dt', {}, '검토자 / 검토일'), el('dd', {}, '미지정 / 미검토'),
    ]));
    return section;
  }
  const grid = el('div', {class: 'year-outlook-grid'});
  for (const hypothesis of year.outlook.hypotheses) {
    const card = el('article', {class: 'year-hypothesis'}, [
      el('span', {class: 'badge'}, '검토 전 질문'), el('h4', {}, hypothesis.label),
      el('p', {}, hypothesis.question),
      el('dl', {class: 'year-outlook-fields'}, [
        el('dt', {}, '필요한 근거'), el('dd', {}, hypothesis.required_evidence),
        el('dt', {}, '가정'), el('dd', {}, hypothesis.assumption),
        el('dt', {}, '대안 설명'), el('dd', {}, hypothesis.alternative),
        el('dt', {}, '검토자 / 검토일'), el('dd', {}, '미지정 / 미검토'),
      ]),
    ]);
    const links = el('div', {class: 'year-evidence-links', 'aria-label': '질문에 연결된 사례'});
    for (const id of hypothesis.evidence_project_ids) {
      const project = projects.get(id);
      if (!project) continue;
      const button = el('button', {type: 'button', class: 'text-button'}, project.title || id);
      button.addEventListener('click', () => onOpenProject(project));
      links.append(button);
    }
    card.append(el('h5', {}, '확인할 사례'), links);
    grid.append(card);
  }
  section.append(grid);
  return section;
}

/** The parent owns global filtering/export; this view only selects a displayed year. */
export function renderYearTrends(container, view, snapshot, {
  dateBasis = view.metadata.date_basis,
  asOf = view.metadata.as_of,
  months = view.metadata.months,
  onDateBasisChange,
  onOpenProject = () => {},
} = {}) {
  const result = summarizeYearTrends(view.projects, snapshot, {
    dateBasis, asOf, months, year: view.metadata.selected_year ?? '', excludedUnknownDates: view.summary.excludedUnknownDates,
  });
  const projectMap = new Map(view.projects.map((project) => [project.project_id, project]));
  container.classList.add('year-trends');
  container.replaceChildren(el('div', {class: 'section-heading'}, [
    el('div', {}, [el('p', {class: 'eyebrow'}, 'YEARLY DESIGN REVIEW'), el('h2', {}, '연도별 학교 설계 살펴보기')]),
    el('span', {class: 'badge'}, result.is_demo ? '가상 자료' : '수집 자료'),
  ]));
  const basis = el('select', {id: 'year-date-basis', 'aria-label': '연도별 집계 날짜 기준'});
  for (const [value, label] of Object.entries(YEAR_DATE_LABELS)) basis.append(el('option', {value}, label));
  basis.value = dateBasis;
  basis.disabled = typeof onDateBasisChange !== 'function';
  basis.addEventListener('change', () => {
    onDateBasisChange?.(basis.value);
    // The parent may synchronously repaint this panel when global filters change.
    container.querySelector('#year-date-basis')?.focus({preventScroll: true});
  });
  const yearSelect = el('select', {id: 'year-selection', 'aria-label': '살펴볼 연도'});
  for (const year of [...result.years].reverse()) yearSelect.append(el('option', {value: year.year}, `${year.year}년 · ${year.project_count}건${year.partial ? ' · 일부 기간' : ''}`));
  const preferred = container.dataset.selectedYear;
  const selected = result.years.find((year) => year.year === preferred)
    ?? [...result.years].reverse().find((year) => year.project_count > 0) ?? result.years.at(-1);
  if (!selected) { container.append(emptyState('연도 정보가 없습니다', '수록연도 또는 선택한 기준 날짜가 있는 자료가 필요합니다.')); return result; }
  yearSelect.value = selected.year;
  container.append(el('div', {class: 'year-controls'}, [
    el('label', {for: 'year-date-basis'}, ['날짜 기준', basis]),
    el('label', {for: 'year-selection'}, ['살펴볼 연도', yearSelect]),
  ]), el('p', {class: 'muted'}, '날짜 기준은 전체 화면과 내보내기에 함께 적용됩니다. 연도 선택은 이 패널만 바꾸며 전체 내보내기 기간은 유지합니다.'));
  const period = el('p', {class: 'year-period-note'}, dateBasis === 'award_year' ? `${result.date_basis_label} 기준 · 자료 기준일 ${result.data_as_of || '미확인'} · 실제 당선일·준공일 아님 · 수록연도 미확인 제외 ${view.summary.excludedUnknownYears ?? 0}건` : `${result.date_basis_label} 기준 · 자료 기준일 ${result.data_as_of || '미확인'} · 조회 기준일 ${result.query_as_of} · 날짜 미확인으로 제외 ${result.excluded_unknown_dates}건`);
  container.append(period);
  if (result.date_basis === 'published_at') container.append(el('p', {class: 'notice'}, '이 연도는 조회 기간 안의 최초 연결 기사에 따라 배정합니다. 실제 준공연도·최초 보도연도와 다르며 월별 기사 노출 집계와 합산 방식도 다릅니다.'));
  if (result.mismatched_basis_ids.length) container.append(el('p', {class: 'notice'}, `선택한 날짜 기준과 맞지 않는 사업 ${result.mismatched_basis_ids.length}건을 제외했습니다. 자료 연결을 확인해 주세요.`));
  const body = el('div', {class: 'year-body'});
  const spatial = el('div');
  const status = el('p', {class: 'sr-only', role: 'status', 'aria-live': 'polite'});
  container.append(status, body);
  function drawYear() {
    const year = result.years.find((item) => item.year === yearSelect.value);
    container.dataset.selectedYear = year.year;
    status.textContent = `${year.year}년 ${year.project_count}건 표시`;
    const spatialApi = renderSpatialModel(spatial, {projects:year.project_ids.map(id => projectMap.get(id)).filter(Boolean),snapshot,onOpenProject,
      scopeLabel:`${year.year}년 · ${result.date_basis_label} · 현재 조회 조건`});
    body.replaceChildren(observationBlock(year, result, topic => {
      spatialApi.setTopic(topic);
      const panel = spatial.querySelector('details');
      if (panel) panel.open = true;
      spatial.querySelector('summary')?.focus();
      spatial.scrollIntoView({block:'nearest',behavior:'instant'});
    }), examplesBlock(year, projectMap, snapshot, onOpenProject), spatial,
      outlookBlock(year, result, projectMap, onOpenProject));
  }
  yearSelect.addEventListener('change', drawYear);
  drawYear();
  container.append(el('details', {class: 'year-method'}, [el('summary', {}, '집계 기준과 해석 범위'),
    el('ul', {}, result.notes.map((note) => el('li', {}, note)))]));
  return result;
}
