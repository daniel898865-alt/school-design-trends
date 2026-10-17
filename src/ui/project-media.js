import { el, safeUrl } from './dom.js';

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
    button.append(el('span', { class: 'image-placeholder' }, '공개 사용을 확인한 이미지가 없습니다. 상세에서 출처를 확인하세요.'));
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
    gallery.append(el('div', { class: 'image-placeholder' }, '공개 사용을 확인한 이미지가 없습니다. 원문 링크에서 자료를 확인하세요.'));
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
