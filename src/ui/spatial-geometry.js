/** Local concept geometry; dimensions are invented model units, never survey data. */
const PALETTE = Object.freeze({wall: '#ddd8c9', roof: '#f1eee3', glass: '#63938e', trim: '#456b63', wood: '#b58a59', green: '#8fae81', ground: '#e1e7d8', path: '#c8cbbd', active: '#c58b35'});
export const SPATIAL_TOPICS = Object.freeze([
  Object.freeze({id: 'outdoor_learning', label: '외부학습공간', space: '중정 · 학습 데크 · 실내외 연결',
    interpretation: '교실 사이의 중정에 데크와 계단형 좌석을 두어 실내 수업이 외부 활동으로 이어지는 구성을 제안합니다.',
    assumption: '기후·소음·관리 동선과 실제 수업 운영은 검증하지 않았습니다.', point: [0, 0.7, -1.5]}),
  Object.freeze({id: 'community_sharing', label: '지역공유', space: '공유 도서관 · 별도 진입부 · 경계',
    interpretation: '앞쪽 도서관에 별도 진입부를 두고 학생 영역과 구분합니다. 연결과 분리를 함께 고려하는 공간 해석입니다.',
    assumption: '운영 시간·이용 권한·피난·보안 성능은 검증하지 않았습니다.', point: [-9, 3.6, -9]}),
  Object.freeze({id: 'flexible_learning', label: '가변학습공간', space: '학습 공용 공간 · 이동식 구획',
    interpretation: '앞쪽 학습 공용동에 이동식 구획과 모둠 가구를 배치합니다. 구획의 변화로 활동 규모를 달리하는 개념입니다.',
    assumption: '구조·음향·수용 인원·학습 효과는 검증하지 않았습니다.', point: [9, 3.6, -6]}),
]);

export const SPATIAL_MODEL = Object.freeze({
  model_id: 'concept-campus-01', type: 'fictional_concept', label: '가상 학교 공간 개념 모델',
  creator: 'School Design Trends · Yunze', date: '2026-10-19',
  source: '직접 작성한 공간 구성과 형상 · 외부 도면/사진 미사용',
  rights: '자체 제작 개념도 · 별도 공개 라이선스 미정, 외부 재사용 조건 확인 필요',
  assumptions: '치수·배치·재료는 설명용 가정입니다. 실제 학교 재현·BIM·성능 검증·미래 예측이 아닙니다.',
});

const escapeXml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[char]));
const clamp = (value, low, high, fallback) => Number.isFinite(Number(value)) ? Math.max(low, Math.min(high, Number(value))) : fallback;
export function normalizeSpatialView(state = {}) {
  return {angle: clamp(state.angle, -180, 180, 32), zoom: clamp(state.zoom, 80, 130, 100),
    transparency: clamp(state.transparency ?? (state.cutaway === true ? 100 : 0), 0, 100, 0)};
}

/** Returns faces from real 3D vertices, with stable geometry for all topics. */
export function createSpatialGeometry(view = {}) {
  const {transparency}=normalizeSpatialView(view);
  const faces = [];
  let layer='site',enclosure=false;
  function face(points, color, topic = null) {
    faces.push({points, color, topic, layer, enclosure, opacity: enclosure ? 1-transparency/100 : 1});
  }
  function box(x, y, z, w, h, d, color, topic = null, topColor = null) {
    const a = [x,y,z], b = [x+w,y,z], c = [x+w,y,z+d], e = [x,y,z+d];
    const f = [x,y+h,z], g = [x+w,y+h,z], j = [x+w,y+h,z+d], k = [x,y+h,z+d];
    face([a,b,g,f], color, topic); face([b,c,j,g], color, topic);
    face([c,e,k,j], color, topic); face([e,a,f,k], color, topic);
    face([f,g,j,k], topColor ?? color, topic);
  }
  box(-20,-0.45,-16,40,0.45,33,PALETTE.ground);
  box(-18,0,-13,36,0.03,4,PALETTE.path);
  box(-6,0,-9,12,0.035,19,'#cdd6c3');
  const outdoor = 'outdoor_learning', community = 'community_sharing', flexible = 'flexible_learning';
  box(-6,0.05,-4.8,12,0.22,9.8,PALETTE.wood,outdoor);
  for (let i=0;i<26;i++) box(-6+i*0.46,0.275,-4.8,0.025,0.012,9.8,'#8f704b',outdoor);
  box(-2.8,0.3,-2.7,5.6,0.14,4.4,PALETTE.green,outdoor);
  for(let step=0;step<3;step++) box(-4,0.3+step*0.3,3.2+step*0.6,8,0.3,0.6,'#c7a274',outdoor);
  layer='building';

  function schoolBlock(x,z,w,d) {
    box(x,0.1,z,w,6.5,d,PALETTE.wall,null,PALETTE.roof);
    for(let floor=0;floor<2;floor++) {
      const y=0.7+floor*3;
      for(let px=x+0.65;px<x+w-0.7;px+=1.75) {
        box(px,y,z-0.035,1.12,1.95,0.05,PALETTE.glass);
        box(px+0.53,y,z-0.07,0.06,1.95,0.08,PALETTE.trim);
        box(px,y,z+d-0.01,1.12,1.95,0.05,PALETTE.glass);
      }
      for(let pz=z+0.7;pz<z+d-0.8;pz+=1.8) {
        box(x-0.04,y,pz,0.06,1.95,1.15,PALETTE.glass);
        box(x+w-0.02,y,pz,0.06,1.95,1.15,PALETTE.glass);
      }
      box(x-0.15,y-0.28,z-0.18,w+0.3,0.13,d+0.36,'#ece9df');
    }
    box(x-0.23,6.6,z-0.23,w+0.46,0.22,d+0.46,PALETTE.roof);
    box(x+0.5,6.85,z+0.5,w-1,0.08,d-1,'#b4bcb0');
  }
  schoolBlock(-13,6,26,5.3);
  schoolBlock(-13,-3.2,5,9.2);
  schoolBlock(8,-3.2,5,9.2);

  function pavilion(x,z,w,d,topic) {
    box(x,0.1,z,w,0.24,d,PALETTE.wall,topic);
    box(x,0.34,z+d-0.14,w,3.2,0.14,PALETTE.wall,topic);
    for(let px=x+0.2;px<x+w;px+=1.5) box(px,0.34,z+d-0.3,0.13,3.18,0.15,PALETTE.wood,topic);
    enclosure=true;
    if(transparency<100) {
      box(x,0.34,z,w,2.95,0.06,PALETTE.glass,topic);
      box(x,0.34,z,0.06,2.95,d,PALETTE.glass,topic);
      box(x+w-0.06,0.34,z,0.06,2.95,d,PALETTE.glass,topic);
      for(let px=x;px<x+w;px+=1.5) box(px,0.34,z-0.05,0.09,3.2,0.12,PALETTE.wood,topic);
      box(x-0.35,3.54,z-0.35,w+0.7,0.22,d+0.7,PALETTE.roof,topic);
    }
    enclosure=false;
    for(let i=0;i<3;i++) {
      const px=x+1+i*(w-2)/3;
      box(px,0.35,z+d-0.8,1.45,1.8,0.45,PALETTE.wood,topic);
      for(let shelf=0;shelf<3;shelf++) box(px+0.1,0.65+shelf*0.48,z+d-0.92,1.23,0.21,0.13,PALETTE.glass,topic);
    }
    for(let i=0;i<3;i++) {
      box(x+1+i*(w-2)/3,0.75,z+1.5,1.4,0.12,0.9,PALETTE.wood,topic);
      box(x+1.5+i*(w-2)/3,0.34,z+1.8,0.12,0.41,0.12,PALETTE.trim,topic);
    }
    if(topic===flexible) {
      box(x+w/2,0.35,z+2.7,0.13,2,1.5,'#b1bda6',topic);
      box(x+w/2+0.15,0.35,z+3.9,1.8,2,0.13,'#b1bda6',topic);
    }
  }
  pavilion(-14,-10,9,5,community);
  pavilion(5,-8,9,5,flexible);
  layer='site';
  box(-11.1,0.04,-13,3.2,0.08,3,PALETTE.wood,community);
  layer='building';
  for(let i=0;i<4;i++) box(-4.9,0.05,-10+i*1.2,0.15,1.1,0.15,PALETTE.trim,community);
  box(-4.9,1.05,-10,0.15,0.1,4.8,PALETTE.wood,community);
  function tree(x,z,size=1) {
    box(x-0.13,0,z-0.13,0.26,2.4*size,0.26,PALETTE.wood);
    const y=2.5*size, r=1.25*size, height=2.3*size;
    const base=[[x-r,y,z],[x,y,z-r],[x+r,y,z],[x,y,z+r]], top=[x,y+height,z];
    for(let i=0;i<4;i++) face([base[i],base[(i+1)%4],top],['#789777','#91ae83','#7e9e78','#a0b991'][i]);
  }
  for(const [x,z,s] of [[-17,7,1.2],[-17,-3,1],[17,8,1.2],[17,-4,1],[-15,14,0.9],[14,14,1],[-1,14,0.85]]) tree(x,z,s);
  return faces;
}

export function projectSpatialPoint([x,y,z], view={}) {
  const {angle,zoom}=normalizeSpatialView(view), theta=angle*Math.PI/180, tilt=0.55;
  const xr=x*Math.cos(theta)+z*Math.sin(theta), zr=-x*Math.sin(theta)+z*Math.cos(theta);
  const scale=12.3*zoom/100;
  // Screen-up and depth form an orthogonal camera basis; farther ground points move upward.
  return {x:400+xr*scale,y:260-(zr*Math.sin(tilt)+y*Math.cos(tilt))*scale,depth:zr*Math.cos(tilt)-y*Math.sin(tilt)};
}

/** Site surfaces must be painted first: their average depth can otherwise cover entire buildings. */
export function projectSpatialFaces(view={}) {
  return createSpatialGeometry(view).map(face=>{
    const projected=face.points.map(point=>projectSpatialPoint(point,view));
    return {...face,projected,depth:projected.reduce((sum,p)=>sum+p.depth,0)/projected.length};
  }).filter(face=>{
    // The boxes use inward winding. A negative projected area is the outward-visible face.
    const [a,b,c]=face.projected;
    return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<-0.001;
  }).sort((a,b)=>Number(a.layer==='building')-Number(b.layer==='building') || b.depth-a.depth);
}

function svgScene(view, topic) {
  const polygons=projectSpatialFaces(view).map(face=>`<polygon points="${face.projected.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="${face.color}" opacity="${face.opacity}" stroke="${face.topic===topic.id?'#92703b':'#47564c'}" stroke-opacity="${face.topic===topic.id?'.5':'.13'}" stroke-width=".45"/>`).join('');
  const p=projectSpatialPoint(topic.point,view);
  const marker=`<g aria-hidden="true"><line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${p.y-40}" stroke="#8c5b1c" stroke-width="2"/><circle cx="${p.x}" cy="${p.y}" r="7" fill="#dfb463" stroke="#fff" stroke-width="2"/><rect x="${p.x-72}" y="${p.y-67}" width="144" height="28" rx="5" fill="#fffaf0" stroke="#a57937"/><text x="${p.x}" y="${p.y-48}" text-anchor="middle" fill="#573c16" font-size="13" font-weight="700">${escapeXml(topic.label)}</text></g>`;
  return `<g>${polygons}${marker}</g>`;
}

/** Self-contained SVG: no remote images/fonts/scripts or source HTML. */
export function buildSpatialSvg({topicId='outdoor_learning',view={},report=null,idPrefix='spatial-image'}={}) {
  const topic=SPATIAL_TOPICS.find(item=>item.id===topicId)??SPATIAL_TOPICS[0];
  const normal=normalizeSpatialView(view);
  const lines=report ? [
    `${SPATIAL_MODEL.label} · ${topic.label}`, `공간: ${topic.space}`,
    `제작: ${SPATIAL_MODEL.creator} · 기준일: ${SPATIAL_MODEL.date}`,
    `형상 출처: ${SPATIAL_MODEL.source}`, `이용 조건: ${SPATIAL_MODEL.rights}`,
    `자료 범위: ${report.scopeLabel || '현재 조회 조건'} · 연결 사업 ${report.projectIds?.length ?? 0}건`,
    `키워드 근거: ${(report.sourceIds ?? []).join(', ') || '연결된 출처 없음'}`,
    ...[...new Map((report.sources ?? []).map(source=>[source.source_id,source])).values()].map(source=>`${source.source_id}: ${source.title} · ${source.url || '원문 링크 없음'}`),
    `근거 자료: ${report.is_demo ? '가상 자료' : '수집 자료'} · 출처 연결 미확인 ${report.missingSourceCount ?? 0}건`,
    '근거는 키워드 분류용이며 이 학교 형상·치수의 출처가 아닙니다.',
    SPATIAL_MODEL.assumptions, `추가 가정: ${topic.assumption}`,
  ] : [];
  const wrapped=lines.flatMap(line=>Array.from(String(line)).reduce((rows,char,i)=>{if(i%58===0)rows.push('');rows[rows.length-1]+=char;return rows;},[]));
  const height=report ? 490+wrapped.length*23 : 470;
  const prefix=String(idPrefix).replace(/[^a-zA-Z0-9_-]/g,'') || 'spatial-image';
  const metadata={...SPATIAL_MODEL,topic_id:topic.id,space:topic.space,interpretation:topic.interpretation,topic_assumption:topic.assumption,view:normal,...(report ? {report} : {})};
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${height}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc"><title id="${prefix}-title">${escapeXml(`${topic.label} 강조 · 가상 학교 공간 모델`)}</title><desc id="${prefix}-desc">${escapeXml(`${topic.space}. ${SPATIAL_MODEL.assumptions}`)}</desc><metadata>${escapeXml(JSON.stringify(metadata))}</metadata><rect width="800" height="${height}" fill="#f2f5ec"/><g font-family="Malgun Gothic,Arial,sans-serif">${svgScene(normal,topic)}<text x="24" y="440" fill="#39594d" font-size="13">가상 공간 해석 · 실제 학교 재현 아님 · 노란 표시는 선택 공간</text>${wrapped.map((line,i)=>`<text x="24" y="${485+i*23}" fill="#233f36" font-size="13">${escapeXml(line)}</text>`).join('')}</g></svg>`;
}
