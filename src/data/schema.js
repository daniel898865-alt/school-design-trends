// docs/DATA_CONTRACT.md v0.2. v0.1은 선택 확장 필드 없이 계속 읽을 수 있다.

export const SCHEMA_VERSION = '0.2';
export const SUPPORTED_SCHEMA_VERSIONS = ['0.1', '0.2'];
export const PROJECT_EXTENSION_FIELDS = {
  award_year: 'year', yearbook_page: 'positive_int', facility_kind: 'text',
  concept_title: 'text', design_tags: 'list', special_flags: 'list',
  designers: 'designers', jury_notes: 'jury_notes', metrics: 'metrics', data_issues: 'list',
};

export const ENUMS = {
  source_type: ['magazine', 'competition', 'news', 'official_school', 'official_building', 'official_company'],
  status: ['in_use', 'demolished', 'closed', 'unknown'],
  date_precision: ['day', 'year', 'unknown'],
};

// 필드 형식: text, date, datetime, int, list, objects, url, level, region, enum:<이름>, brn
export const KINDS = {
  schools: {
    id: 'school_id',
    fields: {
      name: 'text', official_code: 'text', school_level: 'level', region_code: 'region',
      region_name: 'text', address: 'text', source_ids: 'list',
    },
    refs: { source_ids: 'sources' },
  },
  buildings: {
    id: 'building_id',
    fields: {
      school_id: 'text', name: 'text', completion_date: 'date', completion_year: 'int',
      date_precision: 'enum:date_precision', status: 'enum:status', source_ids: 'list', verified_at: 'datetime',
    },
    refs: { school_id: 'schools', source_ids: 'sources' },
  },
  projects: {
    id: 'project_id',
    fields: {
      title: 'text', school_ids: 'list', region_code: 'region', school_level: 'level', project_type: 'text',
      competition_date: 'date', award_date: 'date', completion_date: 'date', firm_ids: 'list',
      source_ids: 'list', summary: 'text', topic_evidence: 'objects', images: 'objects',
      ...PROJECT_EXTENSION_FIELDS,
    },
    refs: { school_ids: 'schools', firm_ids: 'firms', source_ids: 'sources' },
  },
  sources: {
    id: 'source_id',
    fields: {
      source_type: 'enum:source_type', title: 'text', publisher: 'text', url: 'url', published_at: 'datetime',
      retrieved_at: 'datetime', rights_note: 'text', verification_status: 'text',
    },
    refs: {},
  },
  firms: {
    id: 'firm_id',
    fields: {
      name: 'text', aliases: 'list', business_registration_number: 'brn', registration_status: 'text',
      official_url: 'url', source_ids: 'list', verified_at: 'datetime',
    },
    refs: { source_ids: 'sources' },
  },
};

export const KIND_NAMES = Object.keys(KINDS);
