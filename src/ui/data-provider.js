/** Screen adapter for the shared A1/A2 modules. No aggregation or age formula lives here. */
import {parseSnapshot} from '../data/parseSnapshot.js';
import {REGIONS, regionName, UNKNOWN_REGION_LABEL} from '../data/normalize.js';
import levelRules from '../../rules/school_levels.json' with {type: 'json'};
import {filterProjects, summarizeProjects, projectRegions, DATE_BASES} from '../domain/projects.js';
import {isValidDate} from '../domain/dates.js';
import {SUPPORTED_SCHEMA_VERSIONS} from '../data/schema.js';
import {filterProjectsByYearbookYear, summarizeByYearbookYear, yearbookYear} from '../domain/yearbook.js';
import {summarizeFirms} from '../domain/firms.js';
import {summarizeBuildings} from '../domain/buildings.js';
import {summarizeTopics, TOPICS} from '../domain/topics.js';
import {exportSelectedProjectRows} from '../data/export.js';

// Legacy UI fixtures used these five names before the team topic dictionary existed.
// Record-level _raw from parseSnapshot is retained, including the original evidence.
const TOPIC_ALIASES = Object.freeze({
  shared: 'community_sharing', flexible: 'flexible_learning', carbon: 'carbon_energy',
  outdoor: 'outdoor_learning', access: 'safety_accessibility',
});
const TABLES = ['schools', 'buildings', 'projects', 'sources', 'firms'];
const LEVEL_LABELS = new Map(levelRules.levels.map((item) => [item.value, item.label]));
const TOPIC_LABELS = new Map(TOPICS.map((item) => [item.topic_id, item.label]));
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const diagnostic = (code, path, message) => ({code, path, message});

function freezeTree(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeTree(child, seen);
  return Object.freeze(value);
}

function reject(errors) {
  const error = new Error(errors.map(({path, message}) => `${path}: ${message}`).join('\n'));
  error.errors = errors;
  error.diagnostics = errors;
  throw error;
}

function screenSafety(snapshot) {
  const errors = [];
  const field = (value, path, limit = 6000) => {
    if (value !== null && value !== undefined && (typeof value !== 'string' || value.length > limit))
      errors.push(diagnostic('invalid_screen_field', path, `${limit}자 이내 문자열 또는 null이 필요합니다.`));
  };
  field(snapshot.coverage.scope, 'coverage.scope');
  field(snapshot.coverage.source_status, 'coverage.source_status');
  for (const [index, note] of snapshot.coverage.limitations.entries()) field(note, `coverage.limitations[${index}]`);
  for (const table of TABLES) {
    if (snapshot[table].length > 1000) errors.push(diagnostic('too_many_records', table, '화면 입력은 객체별 1,000건 이하로 제한합니다.'));
    for (const [index, row] of snapshot[table].entries()) {
      for (const [key, value] of Object.entries(row)) {
        if (key === '_raw') continue;
        if (typeof value === 'string') field(value, `${table}[${index}].${key}`);
        if (Array.isArray(value) && value.length > 100) errors.push(diagnostic('too_many_values', `${table}[${index}].${key}`, '배열 항목은 100개 이하여야 합니다.'));
      }
    }
  }
  for (const [index, project] of snapshot.projects.entries()) {
    for (const key of ['metrics', 'designers', 'jury_notes', 'data_issues', 'design_tags', 'special_flags']) {
      const check = (value, path) => {
        if (typeof value === 'string') field(value, path);
        else if (Array.isArray(value)) {
          if (value.length > 100) errors.push(diagnostic('too_many_values', path, '배열 항목은 100개 이하여야 합니다.'));
          value.forEach((item, n) => check(item, `${path}[${n}]`));
        } else if (object(value)) for (const [name, item] of Object.entries(value)) check(item, `${path}.${name}`);
      };
      check(project[key], `projects[${index}].${key}`);
    }
    for (const [n, evidence] of project.topic_evidence.entries()) {
      for (const key of ['topic_id', 'source_id', 'evidence_note', 'review_status'])
        field(evidence[key], `projects[${index}].topic_evidence[${n}].${key}`);
    }
    for (const [n, image] of project.images.entries()) {
      for (const key of ['url', 'source_id', 'creator', 'permission_status', 'alt_text'])
        field(image[key], `projects[${index}].images[${n}].${key}`);
    }
  }
  if (errors.length) reject(errors);
}

function readInput(input) {
  if (typeof input === 'string' && input.length > 5_000_000)
    reject([diagnostic('input_too_large', '$', '입력은 5MB 이하의 Snapshot JSON 자료여야 합니다.')]);
  // Clone object inputs: normalization and alias conversion must not mutate callers.
  const parsed = parseSnapshot(typeof input === 'string' ? input : structuredClone(input));
  if (parsed.errors.length || !parsed.snapshot) reject(parsed.errors);
  const snapshot = parsed.snapshot;
  const errors = [];
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(snapshot.schema_version)) errors.push(diagnostic('unsupported_schema', 'schema_version', 'schema_version 0.1 또는 0.2 자료만 지원합니다.'));
  if (errors.length) reject(errors);
  screenSafety(snapshot);
  const warnings = parsed.warnings.map(({code, path, message}) => ({code, path, message}));
  let topicAliasCount = 0;
  for (const project of snapshot.projects) {
    project.topic_evidence = project.topic_evidence.map((evidence, index) => {
      if (!Object.hasOwn(TOPIC_ALIASES, evidence.topic_id)) return evidence;
      const canonical = TOPIC_ALIASES[evidence.topic_id];
      topicAliasCount++;
      return {...evidence, topic_id: canonical};
    });
  }
  if (topicAliasCount) warnings.push({...diagnostic('topic_alias', 'projects.topic_evidence',
    `이전 예시의 주제 표기 ${topicAliasCount}건을 공통 분류표로 맞췄습니다. 원본은 보존합니다.`), level: 'info'});
  // A2 owns evidence validity and the unknown-topic policy.
  // Validate the full snapshot, including undated projects, with the same source
  // lookup carried by A1's filtered arrays. Do not let nonexistent evidence
  // sources disappear merely because a project is outside the current period.
  const evidenceProjects = [...snapshot.projects];
  evidenceProjects.meta = {sources_by_id: new Map(snapshot.sources.map((source) => [source.source_id, source]))};
  warnings.push(...summarizeTopics(evidenceProjects).evidenceIssues);
  return {snapshot: freezeTree(snapshot), warnings: freezeTree(warnings)};
}

/**
 * createDataProvider(JSON text | object) -> the same screen API as the demo adapter.
 * Parse errors stop replacement; recoverable normalization and evidence issues are warnings.
 */
export function createDataProvider(input) {
  const {snapshot, warnings} = readInput(input);
  const schools = new Map(snapshot.schools.map((item) => [item.school_id, item]));
  const firms = new Map(snapshot.firms.map((item) => [item.firm_id, item]));
  const sources = new Map(snapshot.sources.map((item) => [item.source_id, item]));
  const buildings = new Map(snapshot.buildings.map((item) => [item.building_id, item]));
  const options = freezeTree({
    regions: [...REGIONS.map(({code, name}) => ({value: code, label: name})), {value: 'unknown', label: UNKNOWN_REGION_LABEL}],
    schoolLevels: levelRules.levels.map(({value, label}) => ({value, label})),
    topics: [...TOPICS.map(({topic_id, label}) => ({value: topic_id, label})), {value: 'unclassified', label: '미분류'}],
    years: [...new Set(snapshot.projects.map(yearbookYear).filter((year) => year !== null))].sort((a, b) => a - b)
      .map((year) => ({value: String(year), label: `${year}년`})),
    defaultDateBasis: snapshot.is_demo === false && snapshot.projects.some((project) => yearbookYear(project) !== null) ? 'award_year' : 'award_date',
  });
  const unclassified = new Set(snapshot.projects.filter((p) => summarizeTopics([p]).unclassified === 1).map((p) => p.project_id));

  function enrich(project) {
    const regionCodes = project.region_codes ?? projectRegions(project, schools);
    return {
      ...project,
      region_codes: regionCodes,
      region_name: regionCodes.length ? regionCodes.map((code) => regionName(code) ?? code).join(' · ') : UNKNOWN_REGION_LABEL,
      school_level_label: LEVEL_LABELS.get(project.school_level) ?? '미확인',
      firm_names: project.firm_ids.map((id) => firms.get(id)?.name ?? `${id} (사무소 정보 미확인)`),
      school_names: project.school_ids.map((id) => schools.get(id)?.name ?? `${id} (학교 정보 미확인)`),
      topic_evidence: project.topic_evidence.map((evidence) => ({...evidence,
        topic_label: TOPIC_LABELS.get(evidence.topic_id) ?? `${evidence.topic_id ?? '미확인'} (사전 미등록)`})),
    };
  }
  const searchable = new Map(snapshot.projects.map((p) => {
    const item = enrich(p);
    return [p.project_id, [item.title, item.summary, item.region_name, item.school_level_label,
      item.concept_title, item.metrics?.location,
      ...item.school_names, ...item.firm_names, ...(item.designers ?? []).flatMap(d => [d.person,d.firm]), ...item.topic_evidence.map((e) => e.topic_label)]
      .filter((v) => v !== null && v !== undefined).join(' ').toLocaleLowerCase('ko')];
  }));

  function normalizeFilters(inputFilters = {}) {
    if (!object(inputFilters)) throw new Error('조회 조건은 객체여야 합니다.');
    const filters = {query: '', region: '', schoolLevel: '', months: 36,
      dateBasis: options.defaultDateBasis, asOf: snapshot.as_of, topic: '', year: '', ...inputFilters};
    if (typeof filters.query !== 'string' || filters.query.length > 200) throw new Error('검색어는 200자 이내여야 합니다.');
    if (!isValidDate(filters.asOf)) throw new Error('올바른 조회 기준일이 필요합니다.');
    if (!Number.isInteger(filters.months) || filters.months < 1 || filters.months > 120) throw new Error('기간은 1~120개월이어야 합니다.');
    if (![...DATE_BASES, 'award_year'].includes(filters.dateBasis)) throw new Error('지원하지 않는 날짜 기준입니다.');
    if (filters.year !== '' && !options.years.some(({value}) => value === filters.year)) throw new Error('지원하지 않는 작품집 수록연도입니다.');
    for (const [key, values] of [['region', options.regions], ['schoolLevel', options.schoolLevels], ['topic', options.topics]]) {
      if (filters[key] !== '' && !values.some(({value}) => value === filters[key])) throw new Error(`지원하지 않는 조회 조건: ${key}`);
    }
    return filters;
  }

  function context(inputFilters) {
    const filters = normalizeFilters(inputFilters);
    const query = filters.query.trim().toLocaleLowerCase('ko');
    // Both display and shared export receive precisely this search subset.
    // Unclassified uses A2's decision, including unknown-only topic evidence.
    const searchSnapshot = {...snapshot, projects: snapshot.projects.filter((project) =>
      (!query || searchable.get(project.project_id).includes(query))
      && (filters.topic !== 'unclassified' || unclassified.has(project.project_id)))};
    const domainFilters = {
      asOf: filters.asOf, months: filters.months, dateBasis: filters.dateBasis,
      regions: filters.region ? [filters.region] : null,
      schoolLevels: filters.schoolLevel ? [filters.schoolLevel] : null,
      topics: filters.topic && filters.topic !== 'unclassified' ? [filters.topic] : null,
      ...(filters.dateBasis === 'award_year' ? {years: filters.year ? [Number(filters.year)] : null} : {}),
    };
    const projects = filters.dateBasis === 'award_year' ? filterProjectsByYearbookYear(searchSnapshot, domainFilters) : filterProjects(searchSnapshot, domainFilters);
    if (filters.dateBasis === 'award_year') {
      // UI uses the field name award_year; Daniel's independent domain function
      // labels this as yearbook_year. Both mean the publication volume, never a date.
      projects.meta.date_basis = 'award_year';
      projects.meta.query_as_of = filters.asOf;
    }
    return {filters, searchSnapshot, domainFilters, projects};
  }

  function metadataFor(ctx, shared) {
    const sourceIds = [...new Set(ctx.projects.flatMap((p) => p.window_source_ids))];
    return {
      ...shared,
      is_demo: snapshot.is_demo,
      as_of: ctx.filters.asOf,
      snapshot_as_of: snapshot.as_of,
      snapshot_generated_at: snapshot.generated_at,
      months: ctx.filters.dateBasis === 'award_year' ? null : ctx.filters.months,
      selected_year: ctx.filters.dateBasis === 'award_year' ? ctx.filters.year || null : null,
      selected_years: ctx.filters.dateBasis === 'award_year' ? ctx.domainFilters.years : null,
      date_precision: ctx.filters.dateBasis === 'award_year' ? 'yearbook' : 'day',
      scope: snapshot.coverage.scope,
      // Keep A1's array-form filters as well as the form's single-value filters.
      data_filters: shared.filters,
      filters: {...ctx.filters},
      prefilter: {query: ctx.filters.query, unclassified_only: ctx.filters.topic === 'unclassified'},
      source_ids: sourceIds,
      sources: sourceIds.map((id) => {
        const source = sources.get(id);
        return {source_id: id, title: source?.title ?? null, url: source?.url ?? null,
          verification_status: source?.verification_status ?? 'unknown'};
      }),
      source_context: {scope: snapshot.coverage.scope, snapshot_source_count: snapshot.sources.length,
        coverage: structuredClone(snapshot.coverage)},
    };
  }

  function select(inputFilters = {}) {
    const ctx = context(inputFilters);
    const projectSummary = summarizeProjects(ctx.projects);
    const firmSummary = summarizeFirms(ctx.projects, snapshot);
    const topicSummary = summarizeTopics(ctx.projects);
    const schoolIds = new Set(ctx.projects.flatMap((project) => project.school_ids));
    const buildingSnapshot = {...snapshot, buildings: snapshot.buildings.filter((b) => schoolIds.has(b.school_id))};
    const buildingSummary = summarizeBuildings(buildingSnapshot, {asOf: ctx.filters.asOf});
    const exported = exportSelectedProjectRows(snapshot, ctx.projects);
    const yearbookSummary = ctx.filters.dateBasis === 'award_year' ? summarizeByYearbookYear(ctx.projects) : null;
    return {
      projects: ctx.projects.map(enrich),
      summary: {
        projects: projectSummary.uniqueProjects, sources: projectSummary.uniqueArticles,
        schools: projectSummary.uniqueSchools, firms: firmSummary.firms.length,
        unknownFirms: new Set(firmSummary.unresolvedFirmRefs.map((ref) => ref.firm_id)).size,
        unresolvedFirmReferences: firmSummary.unresolvedFirmRefs.length,
        projectsWithOnlyUnresolvedFirms: firmSummary.projectsWithOnlyUnresolvedFirms,
        excludedUnknownDates: projectSummary.excludedUnknownDates ?? 0,
        excludedUnknownYears: ctx.filters.dateBasis === 'award_year' ? ctx.projects.meta.excluded_unknown_years ?? 0 : undefined,
        excludedOutOfRange: projectSummary.excludedOutOfRange,
        unclassifiedProjects: topicSummary.unclassified,
        regionParticipations: projectSummary.regionParticipations,
        multiRegionProjects: projectSummary.multiRegionProjects,
        dataIssueProjects: exported.metadata.data_issue_projects,
        dataIssueCount: exported.metadata.data_issue_count,
        draftTopicProjects: exported.metadata.draft_topic_projects,
      },
      byRegion: projectSummary.byRegion.map((r) => ({label: r.region_name, count: r.projects, code: r.region_code, articles: r.articles})),
      byMonth: projectSummary.byMonth.map((r) => ({label: r.month, count: r.projects,
        articles: r.articles, partial: r.partial, from: r.from, to: r.to})),
      byYear: yearbookSummary?.byYear.map((r) => ({label: String(r.year), year: String(r.year), count: r.projects, articles: r.articles})) ?? [],
      byLevel: projectSummary.bySchoolLevel.map((r) => ({label: LEVEL_LABELS.get(r.school_level), count: r.projects, articles: r.articles})),
      topics: topicSummary.topics.map((r) => ({...r, id: r.topic_id, count: r.projects})),
      firms: firmSummary.firms.map((firm) => ({...firm, known_firm: true, project_count: firm.participations})),
      // Unresolved references are diagnostics, not extra firms or participations.
      unresolvedFirmRefs: firmSummary.unresolvedFirmRefs,
      buildings: buildingSummary.rows.map((row) => ({
        ...buildings.get(row.building_id), ...row,
        name: row.building_name, status: row.building_status,
        region_name: regionName(row.region_code) ?? UNKNOWN_REGION_LABEL,
        // Age and occupancy remain separate in A2; only map labels for the screen.
        domain_age_status: row.age_status,
        age_status: ['demolished', 'closed'].includes(row.building_status) ? 'inactive'
          : row.age_status === 'over' ? 'eligible' : row.age_status,
        age_label: row.min_age === null ? '준공 정보 미확인'
          : `${row.min_age === row.max_age ? row.min_age : `${row.min_age}–${row.max_age}`}년${row.date_precision === 'day' ? '' : ' · 월일 미확인'}`,
      })),
      metadata: metadataFor(ctx, exported.metadata),
      notes: [...projectSummary.notes, ...(yearbookSummary?.notes ?? []), ...snapshot.coverage.limitations],
      firmNotes: firmSummary.notes,
      buildingNotes: buildingSummary.notes,
      topicNotes: topicSummary.notes,
      topicSummary,
      buildingSummary,
      diagnostics: warnings,
      empty: projectSummary.uniqueProjects === 0,
    };
  }

  function exportRows(inputFilters = {}) {
    const ctx = context(inputFilters);
    const exported = exportSelectedProjectRows(snapshot, ctx.projects);
    // Rows and columns come from A2 unchanged; UI only adds its contextual metadata.
    return {...exported, metadata: metadataFor(ctx, exported.metadata)};
  }

  return {snapshot, options, defaultDateBasis: options.defaultDateBasis, warnings, select, exportRows};
}
