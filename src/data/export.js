// 내보내기 데이터. 화면과 같은 filterProjects 조건을 사용하고 가상 자료 표시·출처·기준일을 함께 담는다.
import { filterProjects } from '../domain/projects.js';
import { summarizeBuildings } from '../domain/buildings.js';
import { TOPICS } from '../domain/topics.js';
import { regionName, UNKNOWN_REGION_LABEL } from './normalize.js';

const LIST_SEP = ' | ';
const KNOWN_TOPICS = new Set(TOPICS.map((t) => t.topic_id));
const DEMO_LABEL = '가상 예시 자료 — 실제 통계 아님';

function baseMetadata(snapshot, extra) {
  return {
    is_demo: snapshot.is_demo,
    demo_label: snapshot.is_demo === false ? null : DEMO_LABEL,
    data_as_of: snapshot.as_of,
    coverage_scope: snapshot.coverage?.scope ?? null,
    coverage_limitations: snapshot.coverage?.limitations ?? [],
    ...extra,
  };
}

// exportRows(snapshot, filters) -> {rows[], columns[], metadata}
// filters는 filterProjects 옵션과 같다. 화면에 전달한 값을 그대로 넘긴다.
export function exportRows(snapshot, filters = {}) {
  const projects = filterProjects(snapshot, filters);
  const schools = new Map(snapshot.schools.map((s) => [s.school_id, s]));
  const firms = new Map(snapshot.firms.map((f) => [f.firm_id, f]));
  const sources = new Map(snapshot.sources.map((s) => [s.source_id, s]));
  const demo = snapshot.is_demo === false ? 'false' : 'true';

  const columns = [
    { key: 'is_demo', label: '가상 자료' },
    { key: 'project_id', label: '사업 ID' },
    { key: 'title', label: '사업명' },
    { key: 'school_names', label: '학교' },
    { key: 'school_level', label: '학교급' },
    { key: 'region_names', label: '시도' },
    { key: 'basis_date', label: `기준 날짜(${projects.meta.date_basis})` },
    { key: 'competition_date', label: '공모일' },
    { key: 'award_date', label: '당선일' },
    { key: 'firm_names', label: '당선 사무소' },
    { key: 'topic_ids', label: '설계 주제' },
    { key: 'article_count', label: '기사 수' },
    { key: 'source_titles', label: '출처' },
    { key: 'source_urls', label: '출처 링크' },
    { key: 'summary', label: '요약' },
  ];

  const rows = projects.map((p) => {
    const srcIds = p.window_source_ids;
    return {
      is_demo: demo,
      project_id: p.project_id,
      title: p.title,
      school_names: p.school_ids.map((id) => schools.get(id)?.name ?? `${id}(학교 정보 없음)`).join(LIST_SEP),
      school_level: p.school_level,
      region_names: p.region_codes.length ? p.region_codes.map((c) => regionName(c) ?? c).join(LIST_SEP) : UNKNOWN_REGION_LABEL,
      basis_date: p.basis_date,
      competition_date: p.competition_date,
      award_date: p.award_date,
      firm_names: p.firm_ids.map((id) => firms.get(id)?.name ?? `${id}(사무소 정보 없음)`).join(LIST_SEP),
      // 주제 집계(summarizeTopics)와 같이 사전에 있는 주제만 내보낸다.
      topic_ids: [...new Set(p.topic_evidence.map((e) => e.topic_id).filter((id) => KNOWN_TOPICS.has(id)))].join(LIST_SEP),
      article_count: srcIds.length,
      source_titles: srcIds.map((id) => {
        const s = sources.get(id);
        return s ? [s.publisher, s.title, s.published_at].filter(Boolean).join(', ') : id;
      }).join(LIST_SEP),
      source_urls: srcIds.map((id) => sources.get(id)?.url).filter(Boolean).join(LIST_SEP),
      summary: p.summary,
    };
  });

  const m = projects.meta;
  return {
    rows,
    columns,
    metadata: baseMetadata(snapshot, {
      kind: 'projects',
      query_as_of: m.query_as_of,
      date_basis: m.date_basis,
      window: `(${m.window.start}, ${m.window.end}]`,
      filters: m.filters,
      row_count: rows.length,
      excluded_unknown_dates: m.excluded_unknown_dates,
      excluded_out_of_range: m.excluded_out_of_range,
    }),
  };
}

// 건물 목록 내보내기. summarizeBuildings와 같은 조건을 사용한다.
export function exportBuildingRows(snapshot, options = {}) {
  const s = summarizeBuildings(snapshot, options);
  const columns = [
    { key: 'is_demo', label: '가상 자료' },
    { key: 'building_id', label: '건물 ID' },
    { key: 'building_name', label: '건물명' },
    { key: 'school_name', label: '학교' },
    { key: 'school_level', label: '학교급' },
    { key: 'region_name', label: '시도' },
    { key: 'completion_date', label: '준공일' },
    { key: 'completion_year', label: '준공연도' },
    { key: 'date_precision', label: '날짜 정밀도' },
    { key: 'age_status', label: `${s.threshold}년 판정` },
    { key: 'age_range', label: '연령' },
    { key: 'age_reason', label: '판정 근거' },
    { key: 'building_status', label: '건물 상태' },
    { key: 'verified_at', label: '마지막 확인일' },
    { key: 'source_ids', label: '출처 ID' },
  ];
  const demo = snapshot.is_demo === false ? 'false' : 'true';
  const rows = s.rows.map((r) => ({
    is_demo: demo,
    building_id: r.building_id,
    building_name: r.building_name,
    school_name: r.school_name,
    school_level: r.school_level,
    region_name: r.region_code ? regionName(r.region_code) : UNKNOWN_REGION_LABEL,
    completion_date: r.completion_date,
    completion_year: r.completion_year,
    date_precision: r.date_precision,
    age_status: r.age_status,
    age_range: r.min_age === null ? null : r.min_age === r.max_age ? `${r.min_age}` : `${r.min_age}~${r.max_age}`,
    age_reason: r.age_reason,
    building_status: r.building_status,
    verified_at: r.verified_at,
    source_ids: r.source_ids.join(LIST_SEP),
  }));
  return {
    rows,
    columns,
    metadata: baseMetadata(snapshot, {
      kind: 'buildings',
      query_as_of: s.query_as_of,
      threshold: s.threshold,
      row_count: rows.length,
      notes: s.notes,
    }),
  };
}

// 스프레드시트가 수식으로 해석할 수 있는 문자열 앞에 작은따옴표를 붙인다.
const FORMULA_START = /^[\s\uFEFF]*[=+\-@]/u;
const CONTROL_START = /^[\s\uFEFF]*[\t\r\n]/u;
export function safeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return FORMULA_START.test(s) || CONTROL_START.test(s) ? `'${s}` : s;
}

function quote(s) {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// toCsv({rows, columns, metadata}) -> 문자열. 앞부분에 메타데이터(항목,값) 줄을 두고 빈 줄 뒤에 표를 쓴다.
// Excel 한글 표시를 위해 BOM을 붙인다.
export function toCsv({ rows, columns, metadata }, { preamble = true, bom = true } = {}) {
  const lines = [];
  if (preamble && metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      const value = Array.isArray(v) ? v.join(LIST_SEP) : v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      lines.push([k, value].map((x) => quote(safeCell(x))).join(','));
    }
    lines.push('');
  }
  lines.push(columns.map((c) => quote(safeCell(c.label))).join(','));
  for (const row of rows) lines.push(columns.map((c) => quote(safeCell(row[c.key]))).join(','));
  return (bom ? '﻿' : '') + lines.join('\r\n') + '\r\n';
}
