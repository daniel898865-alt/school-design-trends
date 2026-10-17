/**
 * UI fixture adapter only. This is not Daniel's production ingestion or domain layer.
 * It accepts explicit demo snapshots so the screens can be reviewed independently.
 */
const LEVELS = {
  elementary: '초등학교', middle: '중학교', high: '고등학교',
  combined: '통합학교', other: '기타', unknown: '미확인',
};
const TOPICS = {
  shared: '지역 공유', flexible: '가변 학습공간', carbon: '탄소·에너지',
  outdoor: '외부 학습공간', access: '안전·접근성',
};
const COLLECTIONS = {
  schools: 'school_id', buildings: 'building_id', projects: 'project_id',
  sources: 'source_id', firms: 'firm_id',
};
const DAY = 86_400_000;
const unique = (values) => [...new Set(values)];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (map, key) => Object.hasOwn(map, key);

function calendar(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day ? date : null;
}

function timestamp(value) {
  return typeof value === 'string' && calendar(value.slice(0, 10))
    && (value.length === 10 || (/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      && Number.isFinite(Date.parse(value))));
}

/** Returns validation diagnostics; does not coerce, render, fetch, or normalize input. */
export function validateDemoSnapshot(snapshot) {
  const errors = [];
  const fail = (message) => { if (errors.length < 60) errors.push(message); };
  if (!object(snapshot)) return {valid: false, errors: ['Snapshot은 JSON 객체여야 합니다.']};
  if (snapshot.is_demo !== true) fail('화면 예시에는 is_demo: true 자료만 사용할 수 있습니다.');
  if (snapshot.schema_version !== '0.1') fail('지원하는 schema_version은 0.1입니다.');
  if (!calendar(snapshot.as_of)) fail('as_of는 실제 달력 날짜 YYYY-MM-DD여야 합니다.');
  if (!timestamp(snapshot.generated_at)) fail('generated_at은 시간대가 있는 ISO 시각 또는 날짜여야 합니다.');

  const text = (value, path, nullable = false, max = 2000) => {
    if (nullable && value === null) return;
    if (typeof value !== 'string' || value.length > max || (!nullable && !value.trim()))
      fail(`${path}: 비어 있지 않은 ${max}자 이내 문자열이 필요합니다.`);
  };
  const date = (value, path) => {
    if (value !== null && !calendar(value)) fail(`${path}: 날짜는 YYYY-MM-DD 또는 null이어야 합니다.`);
  };
  const time = (value, path) => {
    if (value !== null && !timestamp(value)) fail(`${path}: ISO 시각·날짜 또는 null이어야 합니다.`);
  };
  const list = (value, path, limit = 100) => {
    if (!Array.isArray(value) || value.length > limit) {
      fail(`${path}: ${limit}개 이하의 배열이 필요합니다.`); return [];
    }
    return value;
  };
  if (!object(snapshot.coverage)) fail('coverage 객체가 필요합니다.');
  else {
    text(snapshot.coverage.scope, 'coverage.scope');
    text(snapshot.coverage.source_status, 'coverage.source_status', false, 80);
    list(snapshot.coverage.limitations, 'coverage.limitations').forEach((v) => text(v, 'coverage.limitations[]'));
  }

  const collections = {};
  const maps = {};
  for (const [name, idKey] of Object.entries(COLLECTIONS)) {
    collections[name] = list(snapshot[name], name, 1000);
    maps[name] = new Map();
    for (const item of collections[name]) {
      if (!object(item)) { fail(`${name} 항목은 객체여야 합니다.`); continue; }
      const id = item[idKey];
      if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))
        fail(`${name}.${idKey}: 영문·숫자·_·- 식별자가 필요합니다.`);
      else if (maps[name].has(id)) fail(`${name}.${idKey}: 중복 식별자 ${id}`);
      else maps[name].set(id, item);
    }
  }
  const refs = (values, collection, path) => {
    const ids = list(values, path);
    const seen = new Set();
    for (const id of ids) {
      if (typeof id !== 'string' || !maps[collection].has(id)) fail(`${path}: 존재하지 않는 참조`);
      if (seen.has(id)) fail(`${path}: 중복 참조`);
      seen.add(id);
    }
    return ids;
  };
  const rows = (name) => collections[name].filter(object);
  for (const school of rows('schools')) {
    text(school.name, 'school.name', false, 200);
    text(school.official_code, 'school.official_code', true, 80);
    text(school.region_code, 'school.region_code', false, 80);
    text(school.region_name, 'school.region_name', false, 100);
    text(school.address, 'school.address', true, 500);
    if (!has(LEVELS, school.school_level)) fail('school.school_level 값이 올바르지 않습니다.');
    refs(school.source_ids, 'sources', 'school.source_ids');
  }
  const regionNames = new Map();
  for (const school of rows('schools')) {
    if (regionNames.has(school.region_code) && regionNames.get(school.region_code) !== school.region_name)
      fail('같은 지역코드에 서로 다른 지역 이름이 있습니다.');
    regionNames.set(school.region_code, school.region_name);
  }
  for (const source of rows('sources')) {
    text(source.title, 'source.title', false, 300);
    text(source.publisher, 'source.publisher', false, 200);
    text(source.url, 'source.url', true, 2000);
    text(source.rights_note, 'source.rights_note');
    if (!['magazine', 'competition', 'news', 'official_school', 'official_building', 'official_company'].includes(source.source_type))
      fail('source.source_type 값이 올바르지 않습니다.');
    if (source.verification_status !== 'demo') fail('모든 출처의 verification_status는 demo여야 합니다.');
    date(source.published_at, 'source.published_at');
    time(source.retrieved_at, 'source.retrieved_at');
  }
  for (const firm of rows('firms')) {
    text(firm.name, 'firm.name', false, 200);
    list(firm.aliases, 'firm.aliases').forEach((v) => text(v, 'firm.aliases[]', false, 200));
    if (firm.business_registration_number !== null) fail('예시에는 사업자등록번호를 저장하지 않습니다.');
    if (firm.registration_status !== 'unknown') fail('예시 사무소의 등록 상태는 unknown이어야 합니다.');
    text(firm.official_url, 'firm.official_url', true, 2000);
    refs(firm.source_ids, 'sources', 'firm.source_ids');
    time(firm.verified_at, 'firm.verified_at');
  }
  for (const building of rows('buildings')) {
    text(building.name, 'building.name', false, 200);
    if (!maps.schools.has(building.school_id)) fail('building.school_id: 존재하지 않는 학교 참조');
    date(building.completion_date, 'building.completion_date');
    if (building.completion_year !== null && (!Number.isInteger(building.completion_year)
      || building.completion_year < 1000 || building.completion_year > 9999))
      fail('building.completion_year 값이 올바르지 않습니다.');
    if (!['day', 'year', 'unknown'].includes(building.date_precision)) fail('building.date_precision 값이 올바르지 않습니다.');
    if (building.date_precision === 'day' && (!calendar(building.completion_date)
      || Number(building.completion_date.slice(0, 4)) !== building.completion_year))
      fail('일 단위 준공일과 준공연도가 일치해야 합니다.');
    if (building.date_precision === 'year' && (building.completion_date !== null || !Number.isInteger(building.completion_year)))
      fail('연도 단위는 준공일 null과 준공연도가 필요합니다.');
    if (building.date_precision === 'unknown' && (building.completion_date !== null || building.completion_year !== null))
      fail('준공일 미상은 준공일·준공연도 모두 null이어야 합니다.');
    if (!['in_use', 'demolished', 'closed', 'unknown'].includes(building.status)) fail('building.status 값이 올바르지 않습니다.');
    refs(building.source_ids, 'sources', 'building.source_ids');
    time(building.verified_at, 'building.verified_at');
  }
  for (const project of rows('projects')) {
    text(project.title, 'project.title', false, 300);
    text(project.summary, 'project.summary', false, 6000);
    text(project.project_type, 'project.project_type', false, 100);
    if (!regionNames.has(project.region_code)) fail('project.region_code: 학교 목록에 없는 지역');
    if (!has(LEVELS, project.school_level)) fail('project.school_level 값이 올바르지 않습니다.');
    refs(project.school_ids, 'schools', 'project.school_ids');
    refs(project.firm_ids, 'firms', 'project.firm_ids');
    const sourceIds = refs(project.source_ids, 'sources', 'project.source_ids');
    for (const field of ['competition_date', 'award_date', 'completion_date']) date(project[field], `project.${field}`);
    for (const entry of list(project.topic_evidence, 'project.topic_evidence', 30)) {
      if (!object(entry)) { fail('topic_evidence 항목은 객체여야 합니다.'); continue; }
      if (!has(TOPICS, entry.topic_id)) fail('예시에서 지원하지 않는 topic_id입니다.');
      if (!sourceIds.includes(entry.source_id)) fail('topic_evidence 출처는 해당 사업의 출처여야 합니다.');
      text(entry.evidence_note, 'topic.evidence_note');
      if (entry.review_status !== 'demo') fail('예시 주제의 review_status는 demo여야 합니다.');
    }
    for (const entry of list(project.images, 'project.images', 12)) {
      if (!object(entry)) { fail('images 항목은 객체여야 합니다.'); continue; }
      text(entry.url, 'image.url', false, 2000);
      text(entry.creator, 'image.creator', false, 200);
      text(entry.alt_text, 'image.alt_text', false, 500);
      if (!sourceIds.includes(entry.source_id)) fail('이미지 출처는 해당 사업의 출처여야 합니다.');
      if (!['owned', 'licensed', 'unknown', 'restricted'].includes(entry.permission_status)) fail('image.permission_status 값이 올바르지 않습니다.');
    }
  }
  return {valid: errors.length === 0, errors};
}

function shiftMonths(date, offset) {
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
  const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  monthStart.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return monthStart;
}

function ageOn(completion, asOf) {
  let age = asOf.getUTCFullYear() - completion.getUTCFullYear();
  const anniversary = new Date(Date.UTC(asOf.getUTCFullYear(), completion.getUTCMonth(), completion.getUTCDate()));
  if (asOf < anniversary) age -= 1;
  return age;
}

function demoAge(building, asOf) {
  if (['demolished', 'closed'].includes(building.status)) return {age_status: 'inactive', age_label: '철거·폐쇄 · 집계 제외'};
  if (building.status === 'unknown') return {age_status: 'unknown', age_label: '사용 상태 미확인'};
  if (building.date_precision === 'unknown') return {age_status: 'unknown', age_label: '준공일 미확인'};
  if (building.date_precision === 'day') {
    const completion = calendar(building.completion_date);
    if (completion > asOf) return {age_status: 'unknown', age_label: '기준일 이후 준공일'};
    const age = ageOn(completion, asOf);
    return {age_status: age >= 40 ? 'eligible' : 'under', age_label: `${age}년`};
  }
  const minAge = ageOn(calendar(`${building.completion_year}-12-31`), asOf);
  const maxAge = ageOn(calendar(`${building.completion_year}-01-01`), asOf);
  if (minAge < 0) return {age_status: 'unknown', age_label: '기준일 이후 준공연도 포함'};
  return {
    age_status: minAge >= 40 ? 'eligible' : maxAge < 40 ? 'under' : 'uncertain',
    age_label: `${minAge === maxAge ? minAge : `${minAge}–${maxAge}`}년 · 월일 미확인`,
  };
}

/** Implements the injectable screen provider interface for fictitious data only. */
export function createDemoProvider(input) {
  const validation = validateDemoSnapshot(input);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const snapshot = structuredClone(input);
  const schools = new Map(snapshot.schools.map((item) => [item.school_id, item]));
  const firms = new Map(snapshot.firms.map((item) => [item.firm_id, item]));
  const sources = new Map(snapshot.sources.map((item) => [item.source_id, item]));
  const regions = new Map(snapshot.schools.map((item) => [item.region_code, item.region_name]));
  const options = {
    regions: [...regions].map(([value, label]) => ({value, label})),
    schoolLevels: Object.entries(LEVELS).map(([value, label]) => ({value, label})),
    topics: Object.entries(TOPICS).map(([value, label]) => ({value, label})),
  };
  const enriched = snapshot.projects.map((project) => ({
    ...project,
    region_name: regions.get(project.region_code),
    school_level_label: LEVELS[project.school_level],
    firm_names: project.firm_ids.map((id) => firms.get(id).name),
    school_names: project.school_ids.map((id) => schools.get(id).name),
  }));

  const normalize = (inputFilters = {}) => {
    const filters = {query: '', region: '', schoolLevel: '', months: 36, dateBasis: 'award_date',
      asOf: snapshot.as_of, topic: '', ...inputFilters};
    if (typeof filters.query !== 'string' || filters.query.length > 200) throw new Error('검색어는 200자 이내여야 합니다.');
    if (!calendar(filters.asOf)) throw new Error('올바른 기준일이 필요합니다.');
    if (!Number.isInteger(filters.months) || filters.months < 1 || filters.months > 120) throw new Error('기간은 1~120개월이어야 합니다.');
    if (!['award_date', 'competition_date'].includes(filters.dateBasis)) throw new Error('지원하지 않는 날짜 기준입니다.');
    if (filters.region !== '' && !regions.has(filters.region)) throw new Error('지원하지 않는 지역입니다.');
    if (filters.schoolLevel !== '' && !has(LEVELS, filters.schoolLevel)) throw new Error('지원하지 않는 학교급입니다.');
    if (filters.topic !== '' && !has(TOPICS, filters.topic)) throw new Error('지원하지 않는 주제입니다.');
    return filters;
  };

  function select(inputFilters = {}) {
    const filters = normalize(inputFilters);
    const asOf = calendar(filters.asOf);
    const cutoff = shiftMonths(asOf, -filters.months);
    const query = filters.query.trim().toLocaleLowerCase('ko');
    const matching = enriched.filter((project) => {
      if (filters.region && project.region_code !== filters.region) return false;
      if (filters.schoolLevel && project.school_level !== filters.schoolLevel) return false;
      if (filters.topic && !project.topic_evidence.some((item) => item.topic_id === filters.topic)) return false;
      if (!query) return true;
      return [project.title, project.summary, project.region_name, project.school_level_label,
        ...project.school_names, ...project.firm_names,
        ...project.topic_evidence.map((item) => TOPICS[item.topic_id])].join(' ').toLocaleLowerCase('ko').includes(query);
    });
    const excludedUnknownDates = matching.filter((p) => p[filters.dateBasis] === null).length;
    const projects = matching.filter((project) => {
      const date = calendar(project[filters.dateBasis]);
      return date && date > cutoff && date <= asOf;
    }).sort((a, b) => b[filters.dateBasis].localeCompare(a[filters.dateBasis]) || a.project_id.localeCompare(b.project_id));
    const schoolIds = new Set(projects.flatMap((p) => p.school_ids));
    const firmIds = new Set(projects.flatMap((p) => p.firm_ids));
    const sourceIds = new Set(projects.flatMap((p) => p.source_ids));
    const byMonth = [];
    const firstIncluded = new Date(cutoff.getTime() + DAY);
    let month = new Date(Date.UTC(firstIncluded.getUTCFullYear(), firstIncluded.getUTCMonth(), 1));
    while (month <= asOf) {
      const label = month.toISOString().slice(0, 7);
      byMonth.push({label, count: projects.filter((p) => p[filters.dateBasis].startsWith(label)).length});
      month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    }
    return {
      projects,
      summary: {projects: projects.length, sources: sourceIds.size, schools: schoolIds.size, firms: firmIds.size,
        excludedUnknownDates, unclassifiedProjects: projects.filter((p) => p.topic_evidence.length === 0).length},
      byRegion: options.regions.map(({value, label}) => ({label, count: projects.filter((p) => p.region_code === value).length})),
      byMonth,
      byLevel: options.schoolLevels.map(({value, label}) => ({label, count: projects.filter((p) => p.school_level === value).length})),
      topics: options.topics.map(({value, label}) => ({id: value, label, count: projects.filter((p) => p.topic_evidence.some((item) => item.topic_id === value)).length})),
      firms: snapshot.firms.filter((f) => firmIds.has(f.firm_id)).map((firm) => {
        const projectIds = projects.filter((p) => p.firm_ids.includes(firm.firm_id)).map((p) => p.project_id);
        return {...firm, project_count: projectIds.length, project_ids: projectIds};
      }).sort((a, b) => b.project_count - a.project_count || a.firm_id.localeCompare(b.firm_id)),
      buildings: snapshot.buildings.filter((b) => schoolIds.has(b.school_id)).map((building) => ({
        ...building, school_name: schools.get(building.school_id).name,
        region_name: schools.get(building.school_id).region_name, ...demoAge(building, asOf),
      })),
      metadata: {is_demo: true, as_of: filters.asOf, snapshot_as_of: snapshot.as_of,
        snapshot_generated_at: snapshot.generated_at, date_basis: filters.dateBasis, months: filters.months,
        scope: snapshot.coverage.scope, filters: {...filters},
        source_ids: [...sourceIds],
        sources: [...sourceIds].map((id) => {
          const source = sources.get(id);
          return {source_id: id, title: source.title, url: source.url, verification_status: source.verification_status};
        }),
        source_context: {scope: snapshot.coverage.scope, snapshot_source_count: snapshot.sources.length,
          coverage: structuredClone(snapshot.coverage)}},
      empty: projects.length === 0,
    };
  }

  function exportRows(filters = {}) {
    const selected = select(filters);
    const columns = [
      ['project_id', '사업 ID'], ['title', '사업명'], ['region_name', '시도'],
      ['school_level_label', '학교급'], ['award_date', '당선일'], ['competition_date', '공모일'],
      ['event_date', '선택한 기준 날짜'], ['event_date_basis', '선택한 날짜 기준'],
      ['firm_names', '참여 사무소'], ['summary', '요약'], ['source_urls', '출처 URL'],
      ['is_demo', '가상 자료'], ['as_of', '조회 기준일'],
    ].map(([key, label]) => ({key, label}));
    const rows = selected.projects.map((project) => ({
      project_id: project.project_id, title: project.title, region_name: project.region_name,
      school_level_label: project.school_level_label, award_date: project.award_date ?? '',
      competition_date: project.competition_date ?? '',
      event_date: project[selected.metadata.date_basis] ?? '', event_date_basis: selected.metadata.date_basis,
      firm_names: project.firm_names.join(' · '), summary: project.summary,
      source_urls: unique(project.source_ids.map((id) => sources.get(id).url).filter(Boolean)).join(' | '),
      is_demo: true, as_of: selected.metadata.as_of,
    }));
    return {columns, rows, metadata: selected.metadata};
  }

  return {snapshot, options, select, exportRows};
}
