// 설계 주제 집계. 한 사업에 여러 주제가 붙을 수 있어 주제별 비율의 합은 100%를 넘을 수 있다.
// 분모는 기간·필터를 통과한 고유 사업 수이며 미분류 사업 수를 함께 보존한다.
import topicRules from '../../rules/topics.json' with { type: 'json' };

export const TOPICS = topicRules.topics;
const known = new Set(TOPICS.map((t) => t.topic_id));

// 검토 상태 값. 허용 목록은 규격에 없으므로 문자열이면 그대로 세고, 비문자·빈 값은 unknown으로 둔다.
function reviewStatusOf(e) {
  const v = e.review_status;
  if (v === null || v === undefined) return { status: 'unknown', invalid: false };
  if (typeof v !== 'string' || v.trim() === '') return { status: 'unknown', invalid: true };
  return { status: v.trim(), invalid: false };
}

// 사업의 주제 근거를 검사한다. 사전에 없는 topic_id는 집계하지 않고 보고한다.
// sourcesById가 있으면 sources에 레코드가 있는 근거 출처만 출처 수로 센다.
function evidenceOf(project, issues, sourcesById) {
  const valid = [];
  (project.topic_evidence ?? []).forEach((e, i) => {
    const path = `${project.project_id}.topic_evidence[${i}]`;
    if (e === null || typeof e !== 'object' || Array.isArray(e)) {
      issues.push({ path, code: 'invalid_evidence', message: '주제 근거는 객체여야 함 — 집계에서 제외' });
      return;
    }
    if (typeof e.topic_id !== 'string' || !known.has(e.topic_id)) {
      issues.push({ path, code: 'unknown_topic', message: `주제 사전에 없는 topic_id ${JSON.stringify(e.topic_id ?? null)} — 집계에서 제외` });
      return;
    }
    if (!e.source_id) issues.push({ path, code: 'missing_evidence_source', message: '근거 출처(source_id) 누락' });
    else if (sourcesById instanceof Map && !sourcesById.has(e.source_id)) {
      issues.push({ path, code: 'unknown_evidence_source', message: `근거 출처 ${JSON.stringify(e.source_id)}가 sources에 없음 — 출처 수에서 제외` });
    }
    if (!e.evidence_note) issues.push({ path, code: 'missing_evidence_note', message: '근거 설명(evidence_note) 누락' });
    if (reviewStatusOf(e).invalid) {
      issues.push({ path, code: 'invalid_review_status', message: `검토 상태 ${JSON.stringify(e.review_status)}는 비어 있지 않은 문자열이어야 함 — unknown으로 셈` });
    }
    valid.push(e);
  });
  return valid;
}

function tally(projects, issues, sourcesById) {
  const perTopic = new Map(TOPICS.map((t) => [t.topic_id, { projects: new Set(), evidence: 0, sources: new Set(), review: new Map() }]));
  let unclassified = 0;
  let multiTag = 0;
  for (const p of projects) {
    const ev = evidenceOf(p, issues, sourcesById);
    const ids = new Set(ev.map((e) => e.topic_id));
    if (ids.size === 0) unclassified++;
    if (ids.size > 1) multiTag++;
    for (const e of ev) {
      const t = perTopic.get(e.topic_id);
      t.projects.add(p.project_id);
      t.evidence++;
      if (e.source_id && (!(sourcesById instanceof Map) || sourcesById.has(e.source_id))) t.sources.add(e.source_id);
      // 일반 객체 대신 Map으로 세어 "__proto__"·"constructor" 같은 상태 이름도 안전하게 센다.
      const { status } = reviewStatusOf(e);
      t.review.set(status, (t.review.get(status) ?? 0) + 1);
    }
  }
  const denominator = projects.length;
  const topics = TOPICS.map((t) => {
    const x = perTopic.get(t.topic_id);
    return {
      topic_id: t.topic_id,
      label: t.label,
      agreement_status: t.agreement_status,
      projects: x.projects.size,
      share: denominator === 0 ? null : x.projects.size / denominator,
      evidence_count: x.evidence,
      source_ids: [...x.sources],
      // 자체 속성으로 만드는 Object.fromEntries를 써서 "__proto__"도 일반 키로 남긴다.
      review_status_counts: Object.fromEntries(x.review),
    };
  });
  return { denominator, classified: denominator - unclassified, unclassified, multiTagProjects: multiTag, topics };
}

// summarizeTopics(projects) — projects는 filterProjects 결과. 연도는 그 결과의 basis_date 기준.
export function summarizeTopics(projects) {
  const issues = [];
  const sourcesById = projects.meta?.sources_by_id;
  const overall = tally(projects, issues, sourcesById);
  const years = [...new Set(projects.map((p) => p.basis_date?.slice(0, 4)).filter(Boolean))].sort();
  const byYear = years.map((year) => ({ year, ...tally(projects.filter((p) => p.basis_date?.startsWith(year)), [], sourcesById) }));

  const notes = [
    '다중 태그: 한 사업에 여러 주제가 붙을 수 있어 주제별 비율의 합이 100%를 넘을 수 있음',
    `분모는 고유 사업 ${overall.denominator}건, 미분류 ${overall.unclassified}건`,
    '주제 정의는 팀 합의 전 초안(rules/topics.json) — 관측된 빈도이며 향후 전망이 아님',
  ];
  if (projects.meta && years.length > 0) notes.push(`연도는 ${projects.meta.date_basis} 기준이며 첫해·마지막 해는 일부 기간일 수 있음`);
  return { ...overall, byYear, evidenceIssues: issues, notes };
}
