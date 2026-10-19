import { el, safeUrl } from './dom.js';
import previewRegistry from '../../public/project-previews.json' with {type:'json'};

export function officialProjectPreview(project) {
  const preview = previewRegistry.entries.find(item => item.project_id === project?.project_id && item.title === project?.title && project.source_ids?.includes(item.source_id));
  if (!preview) return null;
  const url = safeUrl(preview.viewer_url);
  if (!url || !/^https:\/\/www\.goe\.go\.kr\/resource\/ebook\/h\/ebook_(76|82|85)\/index\.html#page=\d+$/.test(url)) return null;
  return {...preview, viewer_url:url};
}

function officialFrame(preview) {
  return el('iframe',{class:'official-viewer-frame',src:preview.viewer_url,title:`${preview.title} · 경기도교육청 공식 작품집`,loading:'lazy',referrerpolicy:'no-referrer',sandbox:'allow-scripts allow-same-origin'});
}

/** One original viewer per panel avoids loading a copy of the book for every card. */
export function createOfficialPreviewPanel(projects, onOpen = () => {}) {
  const candidates = projects.map(project => ({project,preview:officialProjectPreview(project)})).filter(item => item.preview);
  if (!candidates.length) return null;
  const select = el('select',{'aria-label':'이미지로 볼 사례'});
  candidates.forEach(({project}) => select.append(el('option',{value:project.project_id},project.title)));
  const stage = el('div',{class:'official-viewer-stage'});
  const title = el('h3');
  const note = el('p',{class:'small'});
  const link = el('a',{target:'_blank',rel:'noopener noreferrer'},'원문 크게 보기 ↗');
  const detail = el('button',{type:'button',class:'text-button'},'이 사례 자세히 보기 →');
  const panel = el('section',{class:'official-preview-panel','aria-label':'공식 작품집 이미지 미리보기'},[
    stage,el('div',{class:'official-preview-info'},[el('p',{class:'eyebrow'},'OFFICIAL YEARBOOK'),el('h2',{},'도판으로 보는 학교'),select,title,note,link,detail])]);
  function draw() {
    const item = candidates.find(item => item.project.project_id === select.value) ?? candidates[0];
    stage.replaceChildren(officialFrame(item.preview));
    title.textContent = item.project.concept_title || item.project.title;
    note.textContent = `${item.project.award_year}년 작품집 · ${item.preview.viewer_page}쪽 · 경기도교육청 원문 뷰어`;
    link.href = item.preview.viewer_url;
  }
  select.addEventListener('change',draw);
  detail.addEventListener('click',()=>onOpen(candidates.find(item=>item.project.project_id===select.value).project));
  draw();
  return panel;
}

const CONCEPT_IMAGES = new Set([
  'public/illustrations/courtyard.svg',
  'public/illustrations/pavilion.svg',
  'public/illustrations/terrace.svg',
]);
const IMAGE_PERMISSIONS = new Set(['owned', 'licensed', 'public_domain']);
const permissionLabels = new Map([
  ['owned', '직접 제작'], ['licensed', '사용 허가 기록 있음'], ['public_domain', '공개 이용 기록 있음'],
]);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (value, fallback) => typeof value === 'string' && value.trim() ? value : fallback;

/** Same image permissions and URL policy as the existing projectImage helper. */
export function allowedProjectImages(project) {
  const images = Array.isArray(project?.images) ? project.images : [];
  const seen = new Set();
  const allowed = [];
  for (const item of images) {
    if (!record(item) || !IMAGE_PERMISSIONS.has(item.permission_status)) continue;
    const isConcept = CONCEPT_IMAGES.has(item.url);
    const url = isConcept ? item.url : safeUrl(item.url);
    if (!url || (!isConcept && !url.startsWith('https:')) || seen.has(url)) continue;
    seen.add(url);
    allowed.push({
      url,
      source_id: typeof item.source_id === 'string' ? item.source_id : null,
      creator: label(item.creator, null),
      permission_status: item.permission_status,
      alt_text: label(item.alt_text, '설계 이미지'),
      is_concept: isConcept,
    });
  }
  return allowed;
}

function linkedSource(sourceId, snapshot) {
  if (typeof sourceId !== 'string' || !Array.isArray(snapshot?.sources)) return null;
  const source = snapshot.sources.find(item => record(item) && item.source_id === sourceId);
  const url = safeUrl(source?.url);
  return source && url ? { ...source, url } : null;
}

/** Never guess a source from the image URL or from unrelated snapshot records. */
export function primaryProjectSource(project, snapshot) {
  const projectIds = Array.isArray(project?.source_ids) ? project.source_ids : [];
  const imageIds = Array.isArray(project?.images) ? project.images.filter(record).map(item => item.source_id) : [];
  for (const sourceId of new Set([...projectIds, ...imageIds])) {
    const source = linkedSource(sourceId, snapshot);
    if (source) return source;
  }
  return null;
}

function sourceAnchor(source, text) {
  return el('a', {
    href: source.url, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer',
  }, text);
}

function imageElement(image, className, onError, decorative = false) {
  const img = el('img', {
    src: image.url, alt: decorative ? '' : image.alt_text, class: className,
    loading: 'lazy', referrerpolicy: 'no-referrer',
  });
  img.addEventListener('error', () => onError(img), { once: true });
  return img;
}

/** A semantic internal-detail button. The external source is a separate action. */
export function createProjectThumbnail(project, onOpen) {
  const figure = el('figure', { class: 'project-image project-thumbnail-figure' });
  const button = el('button', {
    type: 'button', class: 'project-thumbnail-button', 'aria-haspopup': 'dialog',
    'aria-label': `${label(project?.title, '설계사업')} 상세 보기`,
  });
  const image = allowedProjectImages(project)[0];
  if (image) {
    button.append(imageElement(image, 'project-thumbnail-image', img => {
      img.replaceWith(el('span', { class: 'image-placeholder' }, '이미지를 불러올 수 없습니다. 상세에서 출처를 확인하세요.'));
    }));
    figure.append(el('figcaption', {}, image.is_concept ? '가상 건축 개념도 · 실제 학교 사진 아님' : `이미지: ${image.creator || '제작자 미확인'}`));
  } else {
    figure.classList.add('project-thumbnail-unavailable');
    button.append(el('span', { class: 'image-placeholder' }, [el('span', {class:'media-book-icon', 'aria-hidden':'true'}, '▤'), el('span', {}, '작품집 이미지 확인')]));
  }
  button.append(el('span', { class: 'thumbnail-open-label', 'aria-hidden': 'true' }, '상세 보기 ↗'));
  button.addEventListener('click', () => onOpen(project));
  // A figure may contain a button; a button must not contain a figure/figcaption.
  figure.prepend(button);
  return figure;
}

/** Internal gallery for all eligible images, with per-image provenance. */
export function renderProjectGallery(project, snapshot) {
  const images = allowedProjectImages(project);
  const gallery = el('section', { class: 'project-gallery', 'aria-label': '설계사업 이미지' });
  if (!images.length) {
    const preview = officialProjectPreview(project);
    if (preview) {
      gallery.append(officialFrame(preview),el('p',{class:'small'},`경기도교육청 공식 작품집 · ${preview.viewer_page}쪽 · 아래 원문 화면에서 페이지를 넘기거나 확대할 수 있습니다.`),sourceAnchor({url:preview.viewer_url},'원문 뷰어를 새 탭에서 열기 ↗'));
      return gallery;
    }
    gallery.classList.add('project-gallery-unavailable');
    const source = primaryProjectSource(project, snapshot);
    gallery.append(el('p', {class:'small'}, '이 사례의 사진·도판은 원문에서 확인할 수 있습니다.'));
    if (source) gallery.append(sourceAnchor(source, '공식 작품집에서 이미지 보기 ↗'));
    return gallery;
  }
  const stage = el('figure', { class: 'project-image gallery-main' });
  const selectionStatus = el('p', { class: 'gallery-status', role: 'status', 'aria-live': 'polite' });
  const thumbnails = el('div', { class: 'gallery-thumbnails', role: 'group', 'aria-label': '상세 이미지 선택' });
  const buttons = [];

  function selectImage(index) {
    const image = images[index];
    const source = linkedSource(image.source_id, snapshot);
    const img = imageElement(image, 'gallery-main-image', failed => {
      failed.replaceWith(el('span', { class: 'image-placeholder', role: 'status' }, '이미지를 불러올 수 없습니다. 다른 이미지나 연결된 원문을 확인하세요.'));
    });
    const caption = el('figcaption', { class: 'gallery-caption' }, [
      el('span', {}, image.is_concept ? '가상 건축 개념도 · 실제 학교 사진 아님' : image.alt_text),
      el('span', { class: 'muted' }, `제작: ${image.creator || '미확인'} · 이용 상태 기록: ${permissionLabels.get(image.permission_status)}`),
    ]);
    if (source) {
      caption.append(sourceAnchor(source, '이미지 원문 사이트 ↗'));
      if (source.title) caption.append(el('span', { class: 'muted' }, source.title));
      if (source.rights_note) caption.append(el('span', { class: 'muted' }, `출처 이용 안내: ${source.rights_note}`));
    } else caption.append(el('span', { class: 'muted' }, '연결된 이미지 원문 링크 없음'));
    stage.replaceChildren(img, caption);
    selectionStatus.textContent = `이미지 ${index + 1} / ${images.length}`;
    buttons.forEach((button, buttonIndex) => button.setAttribute('aria-pressed', String(buttonIndex === index)));
  }

  if (images.length > 1) {
    images.forEach((image, index) => {
      const button = el('button', {
        type: 'button', class: 'gallery-thumbnail', 'aria-pressed': String(index === 0),
        'aria-label': `${index + 1}번 이미지 보기: ${image.alt_text}`,
      });
      button.append(imageElement(image, 'gallery-thumbnail-image', failed => {
        failed.replaceWith(el('span', { class: 'gallery-thumbnail-fallback' }, `${index + 1}번 이미지`));
      }, true), el('span', { class: 'gallery-thumbnail-number', 'aria-hidden': 'true' }, String(index + 1)));
      button.addEventListener('click', () => selectImage(index));
      buttons.push(button);
      thumbnails.append(button);
    });
  }
  gallery.append(stage, selectionStatus);
  if (buttons.length) gallery.append(thumbnails);
  selectImage(0);
  return gallery;
}
