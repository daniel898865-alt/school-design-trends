// 설계 주제 집계. 한 사업에 여러 주제가 붙을 수 있어 주제별 비율의 합은 100%를 넘을 수 있다.
// 분모는 기간·필터를 통과한 고유 사업 수이며 미분류 사업 수를 함께 보존한다.
import topicRules from '../../rules/topics.json' with { type: 'json' };

export const TOPICS = topicRules.topics;
const known = new Set(TOPICS.map((t) => t.topic_id));

// 사업의 주제 근거를 검사한다. 사전에 없는 topic_id는 집계하지 않고 보고한다.
function evidenceOf(project, issues) {
  const valid = [];
  project.topic_evidence.forEach((e, i) => {
    const path = `${project.project_id}.topic_evidence[${i}]`;
    if (!e.topic_id || !known.has(e.topic_id)) {
      issues.push({ path, code: 'unknown_topic', message: `주제 사전에 없는 topic_id ${JSON.stringify(e.topic_id ?? null)} — 집계에서 제외` });
      return;
    }
    if (!e.source_id) issues.push({ path, code: 'missing_evidence_source', message: '근거 출처(source_id) 누락' });
    if (!e.evidence_note) issues.push({ path, code: 'missing_evidence_note', message: '근거 설명(evidence_note) 누락' });
    valid.push(e);
  });
  return valid;
}

function tally(projects, issues) {
  const perTopic = new Map(TOPICS.map((t) => [t.topic_id, { projects: new Set(), evidence: 0, sources: new Set(), review: {} }]));
  let unclassified = 0;
  let multiTag = 0;
  for (const p of projects) {
    const ev = evidenceOf(p, issues);
    const ids = new Set(ev.map((e) => e.topic_id));
    if (ids.size === 0) unclassified++;
    if (ids.size > 1) multiTag++;
    for (const e of ev) {
      const t = perTopic.get(e.topic_id);
      t.projects.add(p.project_id);
      t.evidence++;
      if (e.source_id) t.sources.add(e.source_id);
      const status = e.review_status ?? 'unknown';
      t.review[status] = (t.review[status] ?? 0) + 1;
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
      review_status_counts: x.review,
    };
  });
  return { denominator, classified: denominator - unclassified, unclassified, multiTagProjects: multiTag, topics };
}

// summarizeTopics(projects) — projects는 filterProjects 결과. 연도는 그 결과의 basis_date 기준.
export function summarizeTopics(projects) {
  const issues = [];
  const overall = tally(projects, issues);
  const years = [...new Set(projects.map((p) => p.basis_date?.slice(0, 4)).filter(Boolean))].sort();
  const byYear = years.map((year) => ({ year, ...tally(projects.filter((p) => p.basis_date?.startsWith(year)), []) }));

  const notes = [
    '다중 태그: 한 사업에 여러 주제가 붙을 수 있어 주제별 비율의 합이 100%를 넘을 수 있음',
    `분모는 고유 사업 ${overall.denominator}건, 미분류 ${overall.unclassified}건`,
    '주제 정의는 팀 합의 전 초안(rules/topics.json) — 관측된 빈도이며 향후 전망이 아님',
  ];
  if (projects.meta && years.length > 0) notes.push(`연도는 ${projects.meta.date_basis} 기준이며 첫해·마지막 해는 일부 기간일 수 있음`);
  return { ...overall, byYear, evidenceIssues: issues, notes };
}
