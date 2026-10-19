import {el, safeUrl} from './dom.js';

/** Public connection status; unreviewed matches never become confirmed records. */
export function officialStatus(kind, enrichment) {
  const service = enrichment?.schema_version === 'official-enrichment-1' ? enrichment.services?.[kind] : null;
  const title = kind === 'firms' ? '경기도 건축사사무소 공식 정보' : '건물별 사용승인일 연결';
  const text = !service ? '공식 데이터 연결 상태를 확인하지 못했습니다.' : kind === 'firms'
    ? service.complete ? `공식 자료 ${service.retrieved_count ?? 0}건 조회 · 사무소별 일치 여부 확인 필요`
      : service.status === 'sample_only' && service.checked_at ? `API 접속 확인 · 시험 응답 ${service.sample_count ?? 0}건 · 전체 조회는 인증키 설정 후 가능`
        : '전체 사무소 조회를 위한 인증키 설정이 필요합니다.'
    : service.complete ? '건물대장 조회 완료 · 학교·건물별 연결 검토 필요'
      : '건물대장 인증키와 정확한 지번이 필요합니다. 개교일로 건물 나이를 계산하지 않습니다.';
  const panel = el('aside',{class:'connection-status'},el('div',{},[el('strong',{},title),el('p',{},text)]));
  const url = safeUrl(service?.source_url);
  if (url) panel.append(el('a',{href:url,target:'_blank',rel:'noopener noreferrer'},'공식 자료 안내 ↗'));
  const details = el('details',{class:'external-data-details'},[el('summary',{},'연결 방법과 제공 범위'),
    el('p',{},kind === 'firms' ? '사무소명·주소·신고 구분을 조회합니다. 사업자번호·홈페이지·영업 상태는 이 API가 제공하지 않습니다. 같은 이름도 확인 전에는 연결 후보로만 표시합니다.' : '학교 개교일과 건물 사용승인일을 구분합니다. 학교에 건물이 여러 동 있으면 각 동의 날짜와 식별자를 확인합니다.'),
    el('p',{},'인증키는 공개 웹페이지에 넣지 않고 로컬 수집 도구에서 사용합니다. 조회한 후보를 검토한 뒤 공개용 결과를 갱신합니다.'),
    el('a',{href:'https://github.com/yunzecho-eng/school-design-trends/blob/main/docs/OFFICIAL_DATA.md',target:'_blank',rel:'noopener noreferrer'},'설정 안내와 연결 현황 ↗')]);
  if (service?.checked_at) details.append(el('p',{class:'small'},`접속 확인: ${service.checked_at} · 원자료 기준일: ${service.source_date || '미제공'}`));
  return el('div',{},[panel,details]);
}

export function firmCandidates(firmId, enrichment) {
  const match = enrichment?.firm_matches?.find(item => item.firm_id === firmId);
  if (!match || !Array.isArray(match.candidates) || !match.candidates.length) return null;
  return el('details',{class:'firm-match-candidate'},[
    el('summary',{},`공식 자료 일치 후보 ${match.candidates.length}곳 · 확인 전`),
    el('p',{},'작품집 참여 사무소와 동일한 곳인지 주소·등록정보를 대조해야 합니다.'),
    el('ul',{},match.candidates.map(c => el('li',{},[c.name,c.road_address || c.lot_address,c.organization_type].filter(v => typeof v === 'string').join(' · '))))]);
}
