// docs/DATA_CONTRACT.md v0.1의 필드 목록. 규격이 바뀌면 이 파일과 문서를 함께 고친다.

export const SCHEMA_VERSION = '0.1';

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
