import { el, safeUrl, sourceLinks, emptyState } from './dom.js';
import { primaryProjectSource, renderProjectGallery } from './project-media.js';
import { renderSpatialModel } from './spatial-model.js';
import {officialStatus, firmCandidates} from './official-status.js';

const ageLabels = {
  eligible: '40년 이상',
  under: '40년 미만',
  uncertain: '경계 연도 · 월일 확인 필요',
  unknown: '연령 판정 미확인',
  inactive: '철거·폐교 등 사용 종료',
};

function text(value, fallback = '미확인') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

const reviewLabels = new Map([['demo', '가상'], ['checked', '확인'], ['reviewed', '검토 완료'], ['draft', '초안'], ['draft_ai', 'AI 분류 초안 · 사람 검토 전'], ['unknown', '미확인']]);
const buildingStatusLabels = new Map([['in_use', '사용 중'], ['unknown', '사용 상태 미확인'], ['demolished', '철거'], ['closed', '폐교·사용 종료']]);
function reviewStatus(value) { return reviewLabels.get(value) ?? text(value); }

function definitionList(entries) {
  return el('dl', { class: 'meta-list' }, entries.flatMap(([label, value]) => [
    el('dt', {}, label), el('dd', {}, value),
  ]));
}

function appendNotes(container, notes, label) {
  if (!notes?.length) return;
  container.append(el('ul', { class: 'domain-notes', 'aria-label': label }, [...new Set(notes)].map(note => el('li', {}, note))));
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

export function renderFirms(container, view, snapshot, onOpenProject, enrichment) {
  container.replaceChildren();
  container.append(el('div', { class: 'section-heading' }, [
    el('div', {}, [el('p', { class: 'eyebrow' }, 'DESIGN OFFICES'), el('h2', {}, '당선 참여 사무소')]),
    el('span', { class: 'badge' }, `목록이 연결된 사무소 ${view.summary?.firms ?? view.firms?.length ?? 0}곳`),
  ]));
  container.append(el('p', { class: 'notice' }, '현재 조회 사업에 참여한 사무소입니다. 공동 당선은 사무소마다 1건으로 표시하므로 합계가 전체 사업 수보다 클 수 있습니다. 참여 건수는 시장점유율이나 계약 수주액이 아닙니다.'));
  appendNotes(container, view.firmNotes, '사무소 집계 기준과 확인 사항');
  if (!snapshot.is_demo) container.append(officialStatus('firms', enrichment));
  if (!snapshot.is_demo && view.projects.some(p => Number(p.award_year) === 2024 && !p.firm_ids?.length)) container.append(el('p', {class: 'notice'}, '2024년 사례의 설계자 표기는 상세에서 볼 수 있지만 사무소 식별자 연결은 미완료입니다. 참여 건수 0을 실제 당선 없음으로 해석하지 않습니다.'));
  if (view.unresolvedFirmRefs?.length) {
    container.append(el('details', { class: 'notice' }, [
      el('summary', {}, `집계에서 제외한 미확인 사무소 연결 ${view.unresolvedFirmRefs.length}건`),
      el('p', {}, '사업에 사무소 식별자는 있지만 대응하는 사무소 자료가 없습니다. 사무소 수와 참여 건수에 포함하지 않으며, 이름·사업자번호를 추정하지 않습니다.'),
      el('ul', {}, view.unresolvedFirmRefs.map(ref => {
        const title = (view.projects ?? []).find(project => project.project_id === ref.project_id)?.title || ref.project_id;
        return el('li', {}, `${title} · 사무소 식별자 ${ref.firm_id}`);
      })),
    ]));
  }
  if (!view.firms?.length) {
    container.append(emptyState('사무소 정보가 없습니다', '조회 조건을 바꾸거나 당선 참여 사무소가 확인된 자료를 연결해 주세요.'));
    return;
  }
  const cards = el('div', { class: 'card-grid' });
  for (const firm of view.firms) {
    const card = el('article', { class: 'firm-card' });
    card.append(el('span', { class: 'badge' }, firm.project_count === null || firm.project_count === undefined ? '참여 당선 건수 미확인' : `참여 당선 ${firm.project_count}건`));
    card.append(el('h3', {}, text(firm.name, '이름 미확인 사무소')));
    const candidate = firmCandidates(firm.firm_id, enrichment);
    if (candidate) card.append(candidate);
    if (firm.known_firm === false) card.append(el('p', { class: 'notice' }, `사무소 목록에 없는 식별자 ${firm.firm_id}입니다. 이름·번호를 추정하지 않습니다.`));
    const metadata = el('details', {class:'firm-metadata'}, el('summary', {}, '등록 정보·출처 보기'));
    if (firm.aliases?.length) metadata.append(el('p', { class: 'muted' }, `다른 표기: ${firm.aliases.join(', ')}`));
    metadata.append(definitionList([
      ['사업자등록번호', text(firm.business_registration_number, '미확인 · 추정하지 않음')],
      ['등록 상태 기록', text(firm.registration_status === 'unknown' ? null : firm.registration_status)],
      ['번호 형식 검사', ({ format_ok: '형식·검증번호 통과 · 실재·영업 상태 확인과 다름', invalid_format: '형식 확인 필요', checksum_mismatch: '검증번호 불일치 · 원자료 확인 필요' })[firm.brn_format] ?? '미확인'],
      ['단독 / 공동 참여', `${text(firm.solo_awards)} / ${text(firm.joint_awards)}건`],
      ['자료 확인일', text(firm.verified_at)],
    ]));
    if (firm.official_url) card.append(externalLink(firm.official_url, '사무소 공식 사이트'));
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
    metadata.append(el('h4', {}, '확인 근거'), sourceLinks(firm.source_ids ?? [], snapshot));
    card.append(metadata);
    cards.append(card);
  }
  container.append(cards);
}

export function renderBuildings(container, view, snapshot, enrichment) {
  // Preserve only the local display filter when the root redraws this view.
  const previousFilter = container.dataset.ageFilter ?? 'all';
  container.replaceChildren();
  container.append(el('div', { class: 'section-heading' }, [
    el('div', {}, [el('p', { class: 'eyebrow' }, 'SCHOOL BUILDINGS'), el('h2', {}, '건물 연령 확인')]),
    el('span', { class: 'badge' }, `기준일 ${text(view.metadata?.as_of ?? snapshot.as_of)}`),
  ]));
  container.append(el('p', { class: 'notice' }, '학교 개교일이 아닌 건물별 준공 정보에 따른 표시입니다. 연령은 안전등급이나 재건축 필요성을 뜻하지 않습니다. 월별 자동 갱신과 이전 달 비교는 아직 연결되지 않았습니다.'));
  appendNotes(container, view.buildingNotes, '건물 연령 판정 기준과 확인 사항');
  if (!snapshot.is_demo) container.append(officialStatus('buildings', enrichment));
  container.append(el('p', { class: 'muted' }, '준공 정보로 판단한 연령과 사용 상태는 별개입니다. 사용 상태 미확인 건물도 준공일이 확인되면 연령을 표시하며, 철거·폐교 건물은 별도로 구분합니다.'));
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
        el('p', { class: 'muted' }, `원자료 이용 상태: ${buildingStatusLabels.get(building.status) ?? text(building.status)}`),
        el('p', { class: 'muted' }, `연령 판정 근거: ${text(building.age_reason)}`),
        el('p', { class: 'muted' }, `40년 이상 기본 목록: ${building.listed === true ? '포함' : building.listed === false ? '제외' : '미확인'}`),
        sourceLinks(building.source_ids ?? [], snapshot),
      ]);
      body.append(el('tr', {}, [
        el('th', { scope: 'row' }, [el('strong', {}, text(building.school_name)), el('span', { class: 'cell-subtitle' }, text(building.name))]),
        el('td', {}, text(building.region_name)),
        el('td', {}, completion),
        el('td', {}, text(building.age_label)),
        el('td', {}, [el('span', { class: `badge age-${Object.hasOwn(ageLabels, building.age_status) ? building.age_status : 'unknown'}` }, ageLabels[building.age_status] ?? ageLabels.unknown), el('span', { class: 'cell-subtitle' }, buildingStatusLabels.get(building.status) ?? '사용 상태 미확인')]),
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
  appendNotes(container, view.topicNotes, '주제 집계 기준과 확인 사항');
  if (denominator > 0 && view.summary.unclassifiedProjects === denominator) {
    container.append(emptyState('주제 정보 미수록', `${denominator}건 모두 주제 분류 근거가 없습니다. 주제별 0건을 실제 해당 공간이 없다는 뜻으로 해석하지 않습니다.`));
    return;
  }
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
      const review = Object.entries(topic.review_status_counts ?? {}).map(([status, amount]) => `${reviewStatus(status)} ${amount}건`).join(' · ');
      const agreement = topic.agreement_status === 'needs_agreement' ? '분류 기준 합의 전' : `분류 기준: ${text(topic.agreement_status)}`;
      list.append(el('li', { class: 'topic-row' }, [
        el('span', {}, [text(topic.label, topic.id), el('small', { class: 'topic-review' }, `${agreement}${review ? ` · 근거 상태: ${review}` : ''}`)]), meter, el('strong', {}, `${count} / ${denominator}건`),
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
  if (!dialog.open) {
    const opener = document.activeElement;
    dialog.addEventListener('close', () => {
      if (opener?.isConnected && typeof opener.focus === 'function') opener.focus();
    }, { once: true });
  }
  dialog.replaceChildren();
  dialog.setAttribute('aria-labelledby', 'project-dialog-title');
  const close = el('button', { type: 'button', class: 'dialog-close', 'aria-label': '설계사업 상세 닫기', autofocus: '' }, '닫기 ×');
  close.addEventListener('click', () => dialog.close());
  const content = el('article', { class: 'detail-panel' });
  content.append(close, el('p', { class: 'eyebrow' }, 'PROJECT DETAILS'),
    el('h2', { id: 'project-dialog-title' }, text(project.title, '설계사업 상세')));
  if (snapshot.is_demo) content.append(el('p', { class: 'notice' }, '가상 설계사업입니다. 실제 학교·공모·사무소와 관계없는 화면 확인용 자료입니다.'));
  const original = primaryProjectSource(project, snapshot);
  const originalAction = el('div', { class: 'project-original-actions' });
  if (original) {
    originalAction.append(el('a', {
      class: 'project-original-link', href: original.url, target: '_blank',
      rel: 'noopener noreferrer', referrerpolicy: 'no-referrer',
    }, '원문 사이트 보기 ↗'));
    if (original.title) originalAction.append(el('span', { class: 'muted' }, original.title));
  } else originalAction.append(el('span', { class: 'muted' }, '연결된 원문 사이트가 없습니다. 아래 출처의 확인 상태를 참고하세요.'));
  content.append(originalAction, renderProjectGallery(project, snapshot));
  content.append(el('p', {class:'detail-intro'}, text(project.summary, '설계 개요는 연결된 원문에서 확인하세요.')));
  const m = project.metrics ?? {};
  const metric = (label, value) => el('div', {}, [el('span', {}, label), el('strong', {}, value)]);
  content.append(el('div',{class:'detail-overview'},[
    metric('지역', project.locality?.cityName || project.region_name || '미확인'),
    metric('수록연도', project.award_year ? `${project.award_year}년` : '미확인'),
    metric('학교급', project.school_level_label || '미확인'),
    metric('지상 규모', Number.isFinite(m.floors_above) ? `${m.floors_above}층` : '미확인'),
    metric('연면적', Number.isFinite(m.gross_floor_area) ? `${m.gross_floor_area.toLocaleString('ko-KR')} ㎡` : '미확인'),
    metric('설계 개념', project.concept_title || '미수록'),
  ]));
  const basic = el('details', {class:'detail-disclosure'}, el('summary', {}, '사업·일정·설계 개요'));
  basic.append(definitionList([
    ['학교', projectNames(project, snapshot, 'school_names', 'school_ids', 'schools')],
    ['지역 / 학교급', `${text(project.region_name)} / ${text(project.school_level_label)}`],
    ['공모일', text(project.competition_date)],
    ['당선일', text(project.award_date)],
    ['준공일', text(project.completion_date)],
    ['공모집 수록연도', project.award_year ? `${project.award_year}년 · 실제 당선일·준공일 아님` : '미확인'],
    ['현재 조회의 날짜', text(project.basis_date, '미확인 · 수록연도로 대체하지 않음')],
    ['당선 참여 사무소', projectNames(project, snapshot, 'firm_names', 'firm_ids', 'firms')],
  ]));
  basic.append(el('p', { class: 'muted' }, '수록연도와 실제 공모·당선·준공일은 다릅니다. 확인되지 않은 날짜는 비워 둡니다.'));
  if (project.metrics) {
    const m = project.metrics;
    const amount = (value, unit) => typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('ko-KR')} ${unit}` : '미확인';
    basic.append(el('h3', {}, '작품집에 기재된 설계 개요'), definitionList([
      ['개념 제목', text(project.concept_title)], ['시설 종류', text(({school:'학교',housing:'사택·관사',kindergarten:'유치원',education_facility:'교육시설',special_school:'특수학교'})[project.facility_kind], project.facility_kind || '미확인')],
      ['발주처', text(m.client)], ['위치', text(m.location)], ['원문 용도', text(m.program)],
      ['대지 / 건축 / 연면적', [m.site_area,m.building_area,m.gross_floor_area].map(v => amount(v,'㎡')).join(' / ')],
      ['건폐율 / 용적률', [m.building_coverage,m.floor_area_ratio].map(v => amount(v,'%')).join(' / ')],
      ['지상 / 지하', [m.floors_above,m.floors_below].map(v => amount(v,'층')).join(' / ')],
      ['구조', text(m.structure)], ['외장', text(m.exterior)], ['수치 범위 메모', text(m.scope_note)],
      ['작품집 쪽수', `${text(project.yearbook_page)} · PDF/인쇄/목차 번호가 다를 수 있으므로 아래 확인 사항 참조`],
    ]));
  }
  if (project.designers?.length) basic.append(el('h3', {}, '작품집 설계자 표기'), el('ul', {}, project.designers.map(d => el('li', {}, `${text(d.person)} · ${text(d.firm)}`))), el('p', {class:'muted'}, '사무소 등록정보 확인과는 별개입니다.'));
  content.append(basic);
  if (project.jury_notes?.length) content.append(el('details',{class:'detail-disclosure'},[el('summary',{},'심사평 요지'),el('ul', {}, project.jury_notes.map(n => el('li', {}, text(n.note)))),el('p',{class:'small'},'직접 정리한 요약 · 원문 인용이나 평가 점수 아님')]));
  const evidencePanel = el('details',{class:'detail-disclosure'},el('summary',{},`출처·분류 근거·확인 메모${project.data_issues?.length ? ` ${project.data_issues.length}개` : ''}`));
  if (!snapshot.is_demo) evidencePanel.append(el('p',{class:'small'},'수작업·AI 보조 입력 자료 · 사람의 원문 검수 전'));
  if (project.data_issues?.length) evidencePanel.append(el('h3', {}, '자료 확인 사항'), el('ul', {class:'domain-notes'}, project.data_issues.map(note => el('li', {}, note))));
  evidencePanel.append(el('h3', {}, '주제 분류 근거'));
  if (!project.topic_evidence?.length) {
    evidencePanel.append(el('p', { class: 'muted' }, '미분류 · 확인된 주제 근거가 없습니다.'));
  } else {
    const evidenceList = el('ul', { class: 'topic-evidence' });
    for (const evidence of project.topic_evidence) {
      evidenceList.append(el('li', {}, [
        el('strong', {}, text(evidence.topic_label ?? evidence.topic_id)),
        el('p', {}, text(evidence.evidence_note, '근거 설명 미확인')),
        el('p', { class: 'muted' }, `검토 상태: ${reviewStatus(evidence.review_status)}`),
        sourceLinks(evidence.source_id ? [evidence.source_id] : [], snapshot),
      ]));
    }
    evidencePanel.append(evidenceList);
  }
  evidencePanel.append(el('h3', {}, '자료 출처'), sourceLinks(project.source_ids ?? [], snapshot));
  content.append(evidencePanel);
  const spatial = el('div');
  renderSpatialModel(spatial, {projects:[project],snapshot,scopeLabel:project.title || project.project_id});
  content.append(spatial);
  dialog.append(content);
  if (!dialog.open) dialog.showModal();
}
