import {summarizeTopics} from './topics.js';
import {DATE_BASES} from './projects.js';
import {addDays, inWindow, isValidDate, recentWindow} from './dates.js';
import {yearbookYear, YEARBOOK_BASIS} from './yearbook.js';

export const YEAR_DATE_LABELS = Object.freeze({
  completion_date: '사업 준공일', award_date: '당선일', competition_date: '공모일',
  published_at: '기간 내 최초 기사 게시일',
  award_year: '작품집 수록연도',
});

function topicSummary(projects, sourcesById, dateBasis) {
  const items = [...projects];
  items.meta = {sources_by_id: sourcesById, date_basis: dateBasis};
  return summarizeTopics(items);
}

function pendingOutlook(topics, isDemo) {
  return {
    status: 'awaiting_review', is_demo: isDemo,
    hypotheses: topics.filter((topic) => topic.projects > 0).slice(0, 3).map((topic) => ({
      topic_id: topic.topic_id,
      label: topic.label,
      question: `같은 출처와 분류 기준으로 자료를 모았을 때, ‘${topic.label}’ 사례의 구성비가 다음 연도에도 유지되는지 검토한다.`,
      evidence_project_ids: topic.representative_ids,
      required_evidence: '다음 연도 동일 출처의 전체 사례, 수집 누락 점검, 분류 재검토 기록',
      assumption: '수집 지역·학교급·출처·분류 기준이 연도 사이에 같다는 가정이 필요합니다.',
      alternative: '자료를 더 많이 수집한 출처나 지역이 달라져 보이는 차이일 수 있습니다.',
      reviewer: null,
      reviewed_at: null,
    })),
  };
}

/**
 * Yearly facts for already filtered A1 projects. Calendar windows, project IDs,
 * source existence and topic counting retain the shared domain definitions.
 * No completion date is inferred from an award, school opening or building age.
 */
export function summarizeYearTrends(projects, snapshot, options = {}) {
  const dateBasis = options.dateBasis ?? projects.meta?.date_basis ?? 'completion_date';
  if (['award_year', YEARBOOK_BASIS].includes(dateBasis)) return summarizeYearbookTrends(projects, snapshot, options);
  const asOf = options.asOf ?? projects.meta?.query_as_of ?? snapshot.as_of;
  const months = options.months ?? projects.meta?.months ?? 36;
  if (!DATE_BASES.includes(dateBasis)) throw new Error('지원하지 않는 연도 집계 날짜 기준입니다.');
  const window = recentWindow(asOf, months);
  const first = addDays(window.start, 1);
  const sourcesById = new Map(snapshot.sources.map((source) => [source.source_id, source]));
  const missingIds = new Set();
  const mismatchedIds = new Set();
  const outsideIds = new Set();
  const duplicates = new Set();
  const unique = new Map();
  for (const project of projects) {
    if (!isValidDate(project.basis_date)) { missingIds.add(project.project_id); continue; }
    if (dateBasis !== 'published_at' && project.basis_date !== project[dateBasis]) {
      mismatchedIds.add(project.project_id); continue;
    }
    if (!inWindow(project.basis_date, window)) { outsideIds.add(project.project_id); continue; }
    if (unique.has(project.project_id)) { duplicates.add(project.project_id); continue; }
    unique.set(project.project_id, project);
  }
  const selected = [...unique.values()].sort((a, b) => b.basis_date.localeCompare(a.basis_date) || a.project_id.localeCompare(b.project_id));
  const years = [];
  for (let number = Number(first.slice(0, 4)); number <= Number(asOf.slice(0, 4)); number++) {
    const year = String(number);
    const from = first > `${year}-01-01` ? first : `${year}-01-01`;
    const to = asOf < `${year}-12-31` ? asOf : `${year}-12-31`;
    const members = selected.filter((project) => project.basis_date.startsWith(year));
    const summary = topicSummary(members, sourcesById, dateBasis);
    const topics = summary.topics.map((topic) => ({...topic,
      representative_ids: members.filter((project) => project.topic_evidence.some((e) => e.topic_id === topic.topic_id))
        .slice(0, 3).map((project) => project.project_id),
    })).sort((a, b) => b.projects - a.projects || a.topic_id.localeCompare(b.topic_id));
    const sourceIds = [...new Set(members.flatMap((project) => project.window_source_ids ?? project.source_ids))]
      .filter((id) => sourcesById.has(id));
    const row = {
      year, from, to, partial: from !== `${year}-01-01` || to !== `${year}-12-31`,
      project_count: summary.denominator, project_ids: members.map((project) => project.project_id),
      source_count: sourceIds.length, source_ids: sourceIds,
      unclassified: summary.unclassified, multiTagProjects: summary.multiTagProjects,
      small_sample: summary.denominator > 0 && summary.denominator < 5,
      topics, evidence_issues: summary.evidenceIssues,
      representative_ids: members.slice(0, 3).map((project) => project.project_id),
      outlook: pendingOutlook(topics, snapshot.is_demo === true),
    };
    const previous = years.find((item) => Number(item.year) === number - 1);
    const status = !row.project_count ? 'no_current_data'
      : !previous?.project_count ? 'no_previous_data'
        : row.partial || previous.partial ? 'partial_period' : 'available';
    row.comparison = {
      previous_year: String(number - 1), status,
      project_delta: status === 'available' ? row.project_count - previous.project_count : null,
      small_sample: row.small_sample || Boolean(previous?.small_sample),
      topic_changes: status !== 'available' ? [] : topics.map((topic) => {
        const prior = previous.topics.find((item) => item.topic_id === topic.topic_id);
        return {topic_id: topic.topic_id, label: topic.label, current_share: topic.share,
          previous_share: prior.share, percentage_point_change: 100 * (topic.share - prior.share)};
      }),
    };
    years.push(row);
  }
  const excludedUnknownDates = options.excludedUnknownDates ?? projects.meta?.excluded_unknown_dates ?? 0;
  return {
    years, date_basis: dateBasis, date_basis_label: YEAR_DATE_LABELS[dateBasis],
    query_as_of: asOf, data_as_of: snapshot.as_of, is_demo: snapshot.is_demo,
    window, months, project_count: selected.length,
    excluded_unknown_dates: excludedUnknownDates + missingIds.size,
    missing_basis_ids: [...missingIds], mismatched_basis_ids: [...mismatchedIds],
    outside_window_ids: [...outsideIds], duplicate_ids: [...duplicates],
    outlook_status: 'awaiting_review',
    notes: [
      `${YEAR_DATE_LABELS[dateBasis]} 기준 · 고유 설계사업 단위로 연도에 한 번 배정합니다.`,
      '준공일은 설계사업에 기록된 completion_date만 사용하며 개교일·건물 준공일·당선일로 대신 채우지 않습니다.',
      '키워드는 공통 주제 사전의 분류입니다. 한 사업의 복수 키워드와 미분류를 따로 표시합니다.',
      '전년도 비교는 바로 전 연도와 두 해의 조회 범위가 모두 1월 1일~12월 31일일 때만 표시합니다.',
      '사업 5건 미만은 작은 표본으로 안내합니다. 이 기준은 통계적 유의성 판정이 아닙니다.',
      ...(dateBasis === 'published_at' ? ['기사 기준의 연도는 조회 기간 안의 최초 연결 기사 날짜입니다. 준공연도 또는 최초 보도연도가 아니며 월별 기사 노출 집계와 합산 방식이 다릅니다.'] : []),
      ...(snapshot.is_demo ? ['가상 자료이므로 실제 설계 동향이나 미래의 변화를 추론할 수 없습니다.'] : []),
      '전망은 작성·검토 대기 상태입니다. 질문과 필요한 근거를 제시하며 자동 예측을 만들지 않습니다.',
    ],
  };
}

// Publication-volume years are not dates or evidence of a full calendar-year
// census. Keep their intervals null and classification missingness explicit.
function summarizeYearbookTrends(projects, snapshot, options) {
  const sourcesById = new Map(snapshot.sources.map((source) => [source.source_id, source]));
  const requested = options.years ?? (options.year ? [Number(options.year)] : projects.meta?.years ?? null);
  if (requested !== null && (!Array.isArray(requested) || requested.some((year) => !Number.isInteger(year) || year < 1000 || year > 9999)))
    throw new Error('작품집 수록연도는 1000~9999 정수 배열이어야 합니다.');
  const missing = new Set(), outside = new Set(), duplicates = new Set(), unique = new Map();
  for (const project of projects) {
    const year = yearbookYear(project);
    if (year === null) { missing.add(project.project_id); continue; }
    if (requested && !requested.includes(year)) { outside.add(project.project_id); continue; }
    if (unique.has(project.project_id)) { duplicates.add(project.project_id); continue; }
    unique.set(project.project_id, project);
  }
  const selected = [...unique.values()];
  const yearValues = [...new Set([...(requested ?? []), ...selected.map(yearbookYear)])].sort((a, b) => a - b);
  const years = yearValues.map((number) => {
    const members = selected.filter((project) => yearbookYear(project) === number);
    const summary = topicSummary(members, sourcesById, 'award_year');
    const topicStatus = !summary.denominator || !summary.classified ? 'unavailable' : summary.unclassified ? 'partial' : 'classified';
    const topics = summary.topics.map((topic) => ({...topic,
      share: topicStatus === 'unavailable' ? null : topic.share,
      data_status: topicStatus,
      representative_ids: members.filter((project) => project.topic_evidence.some((e) => e.topic_id === topic.topic_id))
        .slice(0, 3).map((project) => project.project_id),
    })).sort((a, b) => b.projects - a.projects || a.topic_id.localeCompare(b.topic_id));
    const sourceIds = [...new Set(members.flatMap((project) => project.window_source_ids ?? project.source_ids))].filter((id) => sourcesById.has(id));
    return {
      year: String(number), from: null, to: null, partial: false, precision: 'yearbook',
      project_count: summary.denominator, project_ids: members.map((p) => p.project_id),
      source_count: sourceIds.length, source_ids: sourceIds,
      unclassified: summary.unclassified, classified_projects: summary.classified,
      topic_data_status: topicStatus, multiTagProjects: summary.multiTagProjects,
      draft_topic_projects: members.filter((p) => p.topic_evidence.some((e) => /^draft(?:_|$)/.test(e.review_status ?? ''))).length,
      small_sample: summary.denominator > 0 && summary.denominator < 5,
      topics, evidence_issues: summary.evidenceIssues,
      representative_ids: members.slice(0, 3).map((p) => p.project_id),
      outlook: pendingOutlook(topics, snapshot.is_demo === true),
    };
  });
  for (const row of years) {
    const previous = years.find((item) => Number(item.year) === Number(row.year) - 1);
    const status = !row.project_count ? 'no_current_data' : !previous?.project_count ? 'no_previous_data' : 'available';
    const topicStatus = status !== 'available' ? status
      : row.topic_data_status === 'unavailable' || previous.topic_data_status === 'unavailable' ? 'missing_topic_data'
        : row.topic_data_status === 'partial' || previous.topic_data_status === 'partial' ? 'incomplete_classification' : 'available';
    row.comparison = {
      previous_year: String(Number(row.year) - 1), status, topic_status: topicStatus,
      project_delta: status === 'available' ? row.project_count - previous.project_count : null,
      small_sample: row.small_sample || Boolean(previous?.small_sample),
      topic_changes: topicStatus !== 'available' ? [] : row.topics.map((topic) => {
        const prior = previous.topics.find((item) => item.topic_id === topic.topic_id);
        return {topic_id: topic.topic_id, label: topic.label, current_share: topic.share,
          previous_share: prior.share, percentage_point_change: 100 * (topic.share - prior.share)};
      }),
    };
  }
  return {
    years, date_basis: 'award_year', date_basis_label: YEAR_DATE_LABELS.award_year,
    query_as_of: options.asOf ?? projects.meta?.query_as_of ?? snapshot.as_of,
    data_as_of: snapshot.as_of, is_demo: snapshot.is_demo,
    window: null, months: null, precision: 'yearbook', selected_years: requested,
    project_count: selected.length, excluded_unknown_dates: 0,
    excluded_unknown_years: (options.excludedUnknownYears ?? projects.meta?.excluded_unknown_years ?? 0) + missing.size,
    missing_basis_ids: [...missing], mismatched_basis_ids: [], outside_window_ids: [...outside], duplicate_ids: [...duplicates],
    outlook_status: 'awaiting_review',
    notes: [
      '작품집 수록연도 기준이며 실제 당선일·준공연도와 다릅니다. 월일이나 달별 수치를 만들지 않습니다.',
      '수록된 당선작만 집계한 출처별 표본이며 전국 전체 사업이나 당선 확률을 나타내지 않습니다.',
      '주제 근거 미수록은 해당 주제가 없다는 뜻이 아닙니다. 미분류는 별도로 세고 한쪽 연도라도 분류가 불완전하면 주제 증감을 계산하지 않습니다.',
      '주제 근거의 draft_ai 등 초안 검토 상태를 유지합니다. 확인·검수 메모와 출처의 한계를 함께 읽어야 합니다.',
      ...(snapshot.coverage?.limitations ?? []),
      ...(snapshot.is_demo ? ['가상 자료이므로 실제 설계 동향이나 미래의 변화를 추론할 수 없습니다.'] : []),
      '전망은 작성·검토 대기 상태입니다. 질문과 필요한 근거를 제시하며 자동 예측을 만들지 않습니다.',
    ],
  };
}
