import { el, safeUrl, sourceLinks, emptyState, projectImage } from './dom.js';

const ageLabels = {
  eligible: '40년 이상',
  under: '40년 미만',
  uncertain: '경계 연도 · 월일 확인 필요',
  unknown: '준공·사용 상태 미확인',
  inactive: '철거·폐교 등 사용 종료',
};

function text(value, fallback = '미확인') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function definitionList(entries) {
  return el('dl', { class: 'meta-list' }, entries.flatMap(([label, value]) => [
    el('dt', {}, label), el('dd', {}, value),
  ]));
}

function externalLink(url, label) {
  const verifiedUrl = safeUrl(url);
  if (!verifiedUrl) return el('span', { class: 'muted' }, '공식 링크 미확인');
  return el('a', { href: verifiedUrl, target: '_blank', rel: 'noopener noreferrer' }, `${label} ↗`);
}

function projectNames(project, snapshot, key, idKey, arrayKey) {
  const values = project[key];
  if (Array.isArray(values) && values.length) return values.join(', ');
  const ids = project[idKey] ?? [];
  const records = snapshot[arrayKey] ?? [];
  const recordId = arrayKey === 'firms' ? 'firm_id' : 'school_id';
  return ids.map(id => records.find(item => item[recordId] === id)?.name ?? id).join(', ') || '미확인';
}

export function renderFirms(container, view, snapshot, onOpenProject) {
  container.replaceChildren();
  container.append(el('div', { class: 'section-heading' }, [
    el('div', {}, [el('p', { class: 'eyebrow' }, 'DESIGN OFFICES'), el('h2', {}, '당선 참여 사무소')]),
    el('span', { class: 'badge' }, `${view.firms?.length ?? 0}개 사무소`),
  ]));
  container.append(el('p', { class: 'notice' }, '현재 조회 사업에 참여한 사무소입니다. 공동 당선은 사무소마다 1건으로 표시하므로 합계가 전체 사업 수보다 클 수 있습니다. 참여 건수는 시장점유율이나 계약 수주액이 아닙니다.'));
  if (!view.firms?.length) {
    container.append(emptyState('사무소 정보가 없습니다', '조회 조건을 바꾸거나 당선 참여 사무소가 확인된 자료를 연결해 주세요.'));
    return;
  }
  const cards = el('div', { class: 'card-grid' });
  for (const firm of view.firms) {
    const card = el('article', { class: 'firm-card' });
    card.append(el('span', { class: 'badge' }, firm.project_count === null || firm.project_count === undefined ? '참여 당선 건수 미확인' : `참여 당선 ${firm.project_count}건`));
    card.append(el('h3', {}, text(firm.name, '이름 미확인 사무소')));
    if (firm.aliases?.length) card.append(el('p', { class: 'muted' }, `다른 표기: ${firm.aliases.join(', ')}`));
    card.append(definitionList([
      ['사업자등록번호', text(firm.business_registration_number, '미확인 · 추정하지 않음')],
      ['번호 확인 상태', firm.registration_status === 'verified' ? '근거 확인 기록 있음' : '미확인'],
      ['자료 확인일', text(firm.verified_at)],
    ]));
    card.append(externalLink(firm.official_url, '사무소 공식 사이트'));
    const projectList = el('ul', { class: 'firm-projects' });
    for (const id of firm.project_ids ?? []) {
      const project = (view.projects ?? []).find(item => item.project_id === id) ??
        (snapshot.projects ?? []).find(item => item.project_id === id);
      if (!project) continue;
      const button = el('button', { type: 'button', class: 'text-button' }, project.title);
      button.addEventListener('click', () => onOpenProject(project));
      projectList.append(el('li', {}, button));
    }
    if (projectList.childElementCount) {
      card.append(el('h4', {}, '관련 설계사업'), projectList);
    }
    card.append(el('h4', {}, '확인 근거'), sourceLinks(firm.source_ids ?? [], snapshot));
    cards.append(card);
  }
  container.append(cards);
}

export function renderBuildings(container, view, snapshot) {
  // Preserve only the local display filter when the root redraws this view.
  const previousFilter = container.dataset.ageFilter ?? 'all';
  container.replaceChildren();
  container.append(el('div', { class: 'section-heading' }, [
    el('div', {}, [el('p', { class: 'eyebrow' }, 'SCHOOL BUILDINGS'), el('h2', {}, '건물 연령 확인')]),
    el('span', { class: 'badge' }, `기준일 ${text(view.metadata?.as_of ?? snapshot.as_of)}`),
  ]));
  container.append(el('p', { class: 'notice' }, '학교 개교일이 아닌 건물별 준공 정보에 따른 표시입니다. 연령은 안전등급이나 재건축 필요성을 뜻하지 않습니다. 월별 자동 갱신과 이전 달 비교는 아직 연결되지 않았습니다.'));
  const select = el('select', { id: 'building-age-filter', 'aria-label': '건물 연령 확인 상태' });
  select.append(el('option', { value: 'all' }, '모든 확인 상태'));
  for (const [value, label] of Object.entries(ageLabels)) select.append(el('option', { value }, label));
  select.value = ['all', ...Object.keys(ageLabels)].includes(previousFilter) ? previousFilter : 'all';
  const count = el('span', { class: 'muted', role: 'status' });
  container.append(el('div', { class: 'filter-row' }, [
    el('label', { for: 'building-age-filter' }, '표시할 건물'), select, count,
  ]));
  container.append(el('p', { class: 'muted' }, '이 선택은 건물 표만 바꿉니다. 상단 사업 필터와 설계사업 내보내기 건수에는 영향을 주지 않습니다.'));
  const results = el('div');
  container.append(results);

  function drawTable() {
    container.dataset.ageFilter = select.value;
    const buildings = (view.buildings ?? []).filter(building => select.value === 'all' || building.age_status === select.value);
    count.textContent = `표시 건물 ${buildings.length}동`;
    results.replaceChildren();
    if (!buildings.length) {
      results.append(emptyState('해당하는 건물이 없습니다', '확인 상태를 바꾸거나 건물 준공 정보가 포함된 자료를 연결해 주세요.'));
      return;
    }
    const table = el('table', { class: 'data-table' });
    table.append(el('caption', { class: 'sr-only' }, '건물별 준공 정보, 연령 확인 상태와 출처'));
    table.append(el('thead', {}, el('tr', {}, ['학교 / 건물', '지역', '준공 정보', '연령', '확인 상태', '근거 / 확인일'].map(label => el('th', { scope: 'col' }, label)))));
    const body = el('tbody');
    for (const building of buildings) {
      const completion = building.date_precision === 'day' && building.completion_date ? building.completion_date :
        building.completion_year ? `${building.completion_year}년 · 월일 미확인` : '미확인';
      const evidence = el('details', {}, [
        el('summary', {}, '출처와 상태 보기'),
        el('p', { class: 'muted' }, `확인일: ${text(building.verified_at)}`),
        el('p', { class: 'muted' }, `원자료 이용 상태: ${text(building.status)}`),
        sourceLinks(building.source_ids ?? [], snapshot),
      ]);
      body.append(el('tr', {}, [
        el('th', { scope: 'row' }, [el('strong', {}, text(building.school_name)), el('span', { class: 'cell-subtitle' }, text(building.name))]),
        el('td', {}, text(building.region_name)),
        el('td', {}, completion),
        el('td', {}, text(building.age_label)),
        el('td', {}, el('span', { class: `badge age-${Object.hasOwn(ageLabels, building.age_status) ? building.age_status : 'unknown'}` }, ageLabels[building.age_status] ?? ageLabels.unknown)),
        el('td', {}, evidence),
      ]));
    }
    table.append(body);
    results.append(el('div', { class: 'table-wrap', tabindex: '0', 'aria-label': '건물 표, 좁은 화면에서는 좌우 스크롤' }, table));
  }
  select.addEventListener('change', drawTable);
  drawTable();
}

export function renderTopics(container, view) {
  container.replaceChildren();
  const denominator = view.summary?.projects ?? view.projects?.length ?? 0;
  container.append(el('div', { class: 'section-heading' }, [
    el('div', {}, [el('p', { class: 'eyebrow' }, 'DESIGN TOPICS'), el('h2', {}, '관측한 설계 주제')]),
    el('span', { class: 'badge' }, `조회 사업 ${denominator}건 기준`),
  ]));
  container.append(el('p', { class: 'muted' }, '주제별로 해당하는 고유 사업 수를 표시합니다. 하나의 사업에 여러 주제가 포함될 수 있으므로 주제별 합계는 조회 사업 수와 다를 수 있습니다.'));
  container.append(el('p', { class: 'muted' }, view.summary?.unclassifiedProjects === undefined ?
    '미분류 사업 건수: 집계 미제공' : `미분류 사업 ${view.summary.unclassifiedProjects}건 · 근거가 없는 사업은 주제를 추정하지 않습니다.`));
  if (!view.topics?.length || denominator === 0) {
    container.append(emptyState('표시할 주제가 없습니다', '조회 조건과 주제 분류 근거를 확인해 주세요.'));
  } else {
    const list = el('ul', { class: 'topic-list' });
    for (const topic of view.topics) {
      const rawCount = Number(topic.count);
      if (topic.count === null || topic.count === undefined || !Number.isFinite(rawCount) || rawCount < 0) {
        list.append(el('li', { class: 'topic-row' }, [el('span', {}, text(topic.label, topic.id)), el('span', { class: 'muted' }, '집계 미확인')]));
        continue;
      }
      const count = rawCount;
      const meter = el('progress', { class: 'topic-meter', max: Math.max(denominator, count, 1), value: count, 'aria-label': `${text(topic.label)}: ${count}건, 조회 사업 ${denominator}건` });
      list.append(el('li', { class: 'topic-row' }, [
        el('span', {}, text(topic.label, topic.id)), meter, el('strong', {}, `${count} / ${denominator}건`),
      ]));
    }
    container.append(list);
  }
  container.append(el('aside', { class: 'notice outlook-note' }, [
    el('h3', {}, '전망을 읽기 전에'),
    el('p', {}, view.metadata?.is_demo ?
      '현재 화면은 가상 자료의 분류 예시입니다. 실제 최근 설계 경향이나 미래 동향을 추론할 수 없습니다.' :
      '이 화면은 수집한 사례의 주제 분포를 보여줍니다. 표본 범위와 출처 편향을 확인하기 전에는 전국 설계시장이나 미래 당선 가능성으로 일반화할 수 없습니다.'),
    el('p', { class: 'muted' }, '미래 전망은 관측 결과와 구분하여 근거·가정·한계를 검토한 뒤 별도로 작성합니다. 자동 예측 기능은 제공하지 않습니다.'),
  ]));
}

export function openProjectDialog(dialog, project, snapshot) {
  dialog.replaceChildren();
  dialog.setAttribute('aria-labelledby', 'project-dialog-title');
  const close = el('button', { type: 'button', class: 'dialog-close', 'aria-label': '설계사업 상세 닫기', autofocus: '' }, '닫기 ×');
  close.addEventListener('click', () => dialog.close());
  const content = el('article', { class: 'detail-panel' });
  content.append(close, el('p', { class: 'eyebrow' }, 'PROJECT DETAILS'),
    el('h2', { id: 'project-dialog-title' }, text(project.title, '설계사업 상세')));
  if (snapshot.is_demo) content.append(el('p', { class: 'notice' }, '가상 설계사업입니다. 실제 학교·공모·사무소와 관계없는 화면 확인용 자료입니다.'));
  content.append(projectImage(project));
  content.append(el('p', {}, text(project.summary, '직접 작성한 요약이 아직 없습니다. 연결된 출처를 확인해 주세요.')));
  content.append(definitionList([
    ['학교', projectNames(project, snapshot, 'school_names', 'school_ids', 'schools')],
    ['지역 / 학교급', `${text(project.region_name)} / ${text(project.school_level_label)}`],
    ['공모일', text(project.competition_date)],
    ['당선일', text(project.award_date)],
    ['준공일', text(project.completion_date)],
    ['당선 참여 사무소', projectNames(project, snapshot, 'firm_names', 'firm_ids', 'firms')],
  ]));
  content.append(el('p', { class: 'muted' }, '공모일·당선일·준공일은 각각의 사건 날짜이며, 미확인 날짜를 다른 날짜로 대신하지 않습니다. 공동 당선 사무소의 참여는 계약 체결이나 수주액을 뜻하지 않습니다.'));
  content.append(el('h3', {}, '주제 분류 근거'));
  if (!project.topic_evidence?.length) {
    content.append(el('p', { class: 'muted' }, '미분류 · 확인된 주제 근거가 없습니다.'));
  } else {
    const evidenceList = el('ul', { class: 'topic-evidence' });
    for (const evidence of project.topic_evidence) {
      evidenceList.append(el('li', {}, [
        el('strong', {}, text(evidence.topic_label ?? evidence.topic_id)),
        el('p', {}, text(evidence.evidence_note, '근거 설명 미확인')),
        el('p', { class: 'muted' }, `검토 상태: ${text(evidence.review_status)}`),
        sourceLinks(evidence.source_id ? [evidence.source_id] : [], snapshot),
      ]));
    }
    content.append(evidenceList);
  }
  content.append(el('h3', {}, '자료 출처'), sourceLinks(project.source_ids ?? [], snapshot));
  dialog.append(content);
  if (!dialog.open) dialog.showModal();
}
