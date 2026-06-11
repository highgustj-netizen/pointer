// ── DOM 참조 ──────────────────────────────────────────────
const waitingScreen  = document.getElementById('waiting-screen');
const photoScreen    = document.getElementById('photo-screen');
const pointerPhoto   = document.getElementById('pointer-photo');
const fingerMarker   = document.getElementById('finger-marker');
const coordsLabel    = document.getElementById('coords-label');
const adminPanel     = document.getElementById('admin-panel');
const adminBtn       = document.getElementById('admin-btn');
const tagPhoto       = document.getElementById('tag-photo');
const tagCrosshair   = document.getElementById('tag-crosshair');
const photoUpload    = document.getElementById('photo-upload');
const saveTagBtn     = document.getElementById('save-tag');
const skipTagBtn     = document.getElementById('skip-tag');
const dbPreview      = document.getElementById('db-preview');
const manageBtn      = document.getElementById('manage-btn');
const deleteSection  = document.getElementById('delete-section');
const uploadSection  = document.getElementById('upload-section');
const dropZone       = document.getElementById('drop-zone');
const tagOverlay     = document.getElementById('tag-overlay');
const tagPhotoWrap   = document.getElementById('tag-photo-wrap');
const tagCounter     = document.getElementById('tag-counter');
const previewOverlay = document.getElementById('preview-overlay');
const previewCount   = document.getElementById('preview-count');
const previewImg     = document.getElementById('preview-img');
const previewCursor  = document.getElementById('preview-cursor');
const previewViewport = document.getElementById('preview-viewport');

// ── 커서 / 카운트다운 상태 ────────────────────────────────
let cursorX = 0.5, cursorY = 0.5;
let stillTimer   = null;
let countdownRAF = null;
let isShowingPhoto = false;

const STILL_DELAY = 1500;
const MOVE_THRESH = 3;
let lastPxX = 0, lastPxY = 0;

// ── 카운트다운 링 ──────────────────────────────────────────
const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;
const ringEl = document.createElement('div');
ringEl.id = 'countdown-ring';
ringEl.innerHTML = `
  <svg width="60" height="60" viewBox="0 0 60 60">
    <circle cx="30" cy="30" r="${RING_R}" fill="none" stroke="#2a2a2a" stroke-width="3"/>
    <circle id="ring-progress" cx="30" cy="30" r="${RING_R}"
      fill="none" stroke="#ff4d1c" stroke-width="3"
      stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"
      stroke-linecap="round" transform="rotate(-90 30 30)"/>
  </svg>`;
document.body.appendChild(ringEl);
const ringProgress = document.getElementById('ring-progress');

function updateCursorCSS(x, y) {
  document.documentElement.style.setProperty('--cx', x + 'px');
  document.documentElement.style.setProperty('--cy', y + 'px');
  ringEl.style.left = x + 'px';
  ringEl.style.top  = y + 'px';
}

let countdownStart = null;

function startCountdown() {
  cancelAnimationFrame(countdownRAF);
  countdownStart = performance.now();
  ringEl.style.display = 'block';
  animateRing();
}

function animateRing() {
  const elapsed  = performance.now() - countdownStart;
  const progress = Math.min(elapsed / STILL_DELAY, 1);
  ringProgress.style.strokeDashoffset = RING_C * (1 - progress);
  if (progress < 1) countdownRAF = requestAnimationFrame(animateRing);
}

function stopCountdown() {
  cancelAnimationFrame(countdownRAF);
  ringProgress.style.strokeDashoffset = RING_C;
  ringEl.style.display = 'none';
}

// ── 사진 표시 ──────────────────────────────────────────────
function showPhoto() {
  if (PhotoDB.count() === 0) { showNoPhotosHint(); return; }
  const photo = PhotoDB.findNearest(cursorX, cursorY);
  if (!photo) return;

  isShowingPhoto = true;
  stopCountdown();
  waitingScreen.style.opacity = '0';
  setTimeout(() => waitingScreen.classList.add('hidden'), 600);
  photoScreen.classList.remove('hidden');
  pointerPhoto.classList.remove('visible');
  pointerPhoto.src = photo.src;

  pointerPhoto.onload = () => {
    pointerPhoto.classList.add('visible');

    if (photo.displayX !== undefined) {
      // 새 형식: 태깅 때와 동일한 위치/크기로 사진 배치 (모니터 프레임 반화면 → 전체화면으로 2배 스케일)
      const vw = window.innerWidth, vh = window.innerHeight;
      pointerPhoto.style.position  = 'absolute';
      pointerPhoto.style.left      = (photo.displayX * vw) + 'px';
      pointerPhoto.style.top       = (photo.displayY * vh) + 'px';
      pointerPhoto.style.width     = (photo.displayW * vw) + 'px';
      pointerPhoto.style.height    = (photo.displayH * vh) + 'px';
      pointerPhoto.style.objectFit = 'fill';
      updateCursorCSS(photo.fingerScreenX * vw, photo.fingerScreenY * vh);
    } else {
      // 구 형식: object-fit: cover 보정
      pointerPhoto.style.position  = '';
      pointerPhoto.style.left      = '';
      pointerPhoto.style.top       = '';
      pointerPhoto.style.width     = '';
      pointerPhoto.style.height    = '';
      pointerPhoto.style.objectFit = '';
      const rect = pointerPhoto.getBoundingClientRect();
      const imgAspect = pointerPhoto.naturalWidth / pointerPhoto.naturalHeight;
      const boxAspect = rect.width / rect.height;
      let renderW, renderH, offsetX, offsetY;
      if (imgAspect > boxAspect) {
        renderH = rect.height; renderW = renderH * imgAspect;
        offsetX = (rect.width - renderW) / 2; offsetY = 0;
      } else {
        renderW = rect.width; renderH = renderW / imgAspect;
        offsetX = 0; offsetY = (rect.height - renderH) / 2;
      }
      updateCursorCSS(rect.left + offsetX + photo.fingerX * renderW,
                      rect.top  + offsetY + photo.fingerY * renderH);
    }

    coordsLabel.textContent =
      `x: ${(cursorX * 100).toFixed(1)}%  y: ${(cursorY * 100).toFixed(1)}%  ·  ${PhotoDB.count()} photos`;
  };
}

function hidePhoto() {
  isShowingPhoto = false;
  photoScreen.classList.add('hidden');
  pointerPhoto.src = '';
  pointerPhoto.style.position  = '';
  pointerPhoto.style.left      = '';
  pointerPhoto.style.top       = '';
  pointerPhoto.style.width     = '';
  pointerPhoto.style.height    = '';
  pointerPhoto.style.objectFit = '';
  waitingScreen.style.opacity = '1';
  waitingScreen.classList.remove('hidden');
}

function showNoPhotosHint() {}

// ── 마우스 이벤트 ──────────────────────────────────────────
document.addEventListener('mousemove', (e) => {
  const dx = e.clientX - lastPxX;
  const dy = e.clientY - lastPxY;
  if (!isShowingPhoto) updateCursorCSS(e.clientX, e.clientY);
  cursorX = e.clientX / window.innerWidth;
  cursorY = e.clientY / window.innerHeight;
  if (Math.abs(dx) < MOVE_THRESH && Math.abs(dy) < MOVE_THRESH) return;
  lastPxX = e.clientX; lastPxY = e.clientY;
  const uiOpen = !adminPanel.classList.contains('hidden') || !tagOverlay.classList.contains('hidden');
  if (isShowingPhoto && !uiOpen) hidePhoto();
  clearTimeout(stillTimer);
  stopCountdown();
  if (!isShowingPhoto && !uiOpen) {
    stillTimer = setTimeout(() => {
      startCountdown();
      stillTimer = setTimeout(showPhoto, STILL_DELAY);
    }, 200);
  }
});

document.addEventListener('click', (e) => {
  if (isShowingPhoto &&
      !adminPanel.contains(e.target) &&
      e.target !== adminBtn) {
    hidePhoto();
  }
});

// ══════════════════════════════════════════════════════════
// 관리자 / 태깅
// ══════════════════════════════════════════════════════════

const ADMIN_PASSWORD = '1234';

let pendingPhotos   = [];
let currentTagIdx   = 0;
let currentTagPoint = null;
let sessionTagged   = [];

// ── 태그 오버레이: 이동 / 크기 조절 ──────────────────────────
let wrapX = 0, wrapY = 0, wrapW = 100, wrapH = 100;
let fingerVX = null, fingerVY = null;
let tagDragMode    = null;
let tagResizeDir   = '';
let tagDragStartX  = 0, tagDragStartY = 0;
let tagDragStartWrap = {};
let tagDidDrag     = false;

function initPhotoWrap() {
  const mX = window.innerWidth / 4, mY = window.innerHeight / 4;
  const mW = window.innerWidth / 2, mH = window.innerHeight / 2;
  const aspect = tagPhoto.naturalWidth / tagPhoto.naturalHeight;
  const m = Math.min(mW, mH) * 0.06;
  let w = mW - m * 2, h = w / aspect;
  if (h > mH - m * 2) { h = mH - m * 2; w = h * aspect; }
  wrapX = mX + (mW - w) / 2; wrapY = mY + (mH - h) / 2;
  wrapW = w; wrapH = h;
  fingerVX = null; fingerVY = null;
  currentTagPoint = null;
  tagCrosshair.style.display = 'none';
  applyWrapStyle();
}

function applyWrapStyle() {
  tagPhotoWrap.style.left   = wrapX + 'px';
  tagPhotoWrap.style.top    = wrapY + 'px';
  tagPhotoWrap.style.width  = wrapW + 'px';
  tagPhotoWrap.style.height = wrapH + 'px';

  // 사진 이미지를 모니터 프레임 경계에서 clip
  const mX = window.innerWidth / 4,  mY = window.innerHeight / 4;
  const mW = window.innerWidth / 2,  mH = window.innerHeight / 2;
  const t = Math.max(0, mY - wrapY);
  const r = Math.max(0, (wrapX + wrapW) - (mX + mW));
  const b = Math.max(0, (wrapY + wrapH) - (mY + mH));
  const l = Math.max(0, mX - wrapX);
  tagPhoto.style.clipPath = `inset(${t}px ${r}px ${b}px ${l}px)`;

  if (fingerVX !== null) {
    tagCrosshair.style.left = (fingerVX - wrapX) + 'px';
    tagCrosshair.style.top  = (fingerVY - wrapY) + 'px';
  }
}

tagPhotoWrap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  tagDragStartX = e.clientX; tagDragStartY = e.clientY;
  tagDragStartWrap = { x: wrapX, y: wrapY, w: wrapW, h: wrapH };
  tagDidDrag = false;
  tagDragMode = e.target.classList.contains('rh') ? 'resize' : 'move';
  if (tagDragMode === 'resize') tagResizeDir = e.target.dataset.d;
  if (tagDragMode === 'move') tagPhotoWrap.style.cursor = 'grabbing';
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!tagDragMode) return;
  const dx = e.clientX - tagDragStartX;
  const dy = e.clientY - tagDragStartY;
  if (Math.abs(dx) + Math.abs(dy) > 2) tagDidDrag = true;
  const MIN = 60, s = tagDragStartWrap;
  if (tagDragMode === 'move') {
    wrapX = s.x + dx; wrapY = s.y + dy;
  } else {
    let nx = s.x, ny = s.y, nw = s.w, nh = s.h;
    const d = tagResizeDir;
    if (d.includes('e')) nw = Math.max(MIN, s.w + dx);
    if (d.includes('s')) nh = Math.max(MIN, s.h + dy);
    if (d.includes('w')) { nw = Math.max(MIN, s.w - dx); nx = s.x + s.w - nw; }
    if (d.includes('n')) { nh = Math.max(MIN, s.h - dy); ny = s.y + s.h - nh; }
    wrapX = nx; wrapY = ny; wrapW = nw; wrapH = nh;
  }
  applyWrapStyle();
});

window.addEventListener('mouseup', () => {
  tagDragMode = null;
  tagPhotoWrap.style.cursor = '';
});

tagPhotoWrap.addEventListener('click', (e) => {
  if (tagDidDrag || e.target.classList.contains('rh')) return;
  const mX = window.innerWidth / 4,  mY = window.innerHeight / 4;
  const mW = window.innerWidth / 2,  mH = window.innerHeight / 2;
  // 모니터 프레임 밖 클릭 무시
  if (e.clientX < mX || e.clientX > mX + mW || e.clientY < mY || e.clientY > mY + mH) return;
  fingerVX = e.clientX; fingerVY = e.clientY;
  tagCrosshair.style.left = (fingerVX - wrapX) + 'px';
  tagCrosshair.style.top  = (fingerVY - wrapY) + 'px';
  tagCrosshair.style.display = 'block';
  currentTagPoint = { x: (fingerVX - mX) / mW, y: (fingerVY - mY) / mH };
});

// ── 유저 ID ────────────────────────────────────────────────
function getUserId() {
  let uid = localStorage.getItem('pointer-uid');
  if (!uid) {
    uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem('pointer-uid', uid);
  }
  return uid;
}

// ── 패널 열기 / 닫기 ──────────────────────────────────────
function closeAdmin() {
  adminPanel.classList.add('hidden');
  tagOverlay.classList.add('hidden');
  document.body.classList.remove('admin-open');
  deleteSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  pendingPhotos = [];
  currentTagIdx = 0;
}

function cancelTagging() {
  pendingPhotos = [];
  currentTagIdx = 0;
  tagOverlay.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  uploadSection.classList.remove('hidden');
}

function openAdmin() {
  adminPanel.classList.remove('hidden');
  document.body.classList.add('admin-open');
  isShowingPhoto = false;
  hidePhoto();
  clearTimeout(stillTimer);
  stopCountdown();
  uploadSection.classList.remove('hidden');
}

adminBtn.addEventListener('click', openAdmin);
document.getElementById('back-btn').addEventListener('click', closeAdmin);
document.getElementById('close-tag').addEventListener('click', cancelTagging);

manageBtn.addEventListener('click', () => {
  if (!deleteSection.classList.contains('hidden')) {
    deleteSection.classList.add('hidden');
    return;
  }
  const pw = prompt('비밀번호를 입력하세요:');
  if (pw === ADMIN_PASSWORD) {
    renderDBPreview();
    deleteSection.classList.remove('hidden');
  } else if (pw !== null) {
    alert('비밀번호가 틀렸습니다.');
  }
});

// ── 파일 처리 ──────────────────────────────────────────────
function handleFiles(files) {
  pendingPhotos = [];
  currentTagIdx = 0;
  sessionTagged = [];
  Promise.all(
    files.map(file => new Promise(resolve => {
      const fr = new FileReader();
      fr.onload = ev => resolve({ file, src: ev.target.result });
      fr.readAsDataURL(file);
    }))
  ).then(results => {
    pendingPhotos = results;
    loadTagPhoto(0);
  });
}

photoUpload.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length) handleFiles(files);
  e.target.value = '';
});

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length) handleFiles(files);
});

// ── 태깅 플로우 ────────────────────────────────────────────
function loadTagPhoto(idx) {
  if (idx >= pendingPhotos.length) {
    pendingPhotos = [];
    currentTagIdx = 0;
    tagOverlay.classList.add('hidden');
    if (sessionTagged.length > 0) {
      showPreview([...sessionTagged]);
      sessionTagged = [];
    } else {
      adminPanel.classList.remove('hidden');
      uploadSection.classList.remove('hidden');
    }
    return;
  }
  tagPhoto.src = '';
  tagCounter.textContent = `${idx + 1}  /  ${pendingPhotos.length}`;
  adminPanel.classList.add('hidden');
  tagOverlay.classList.remove('hidden');
  tagPhoto.onload = () => initPhotoWrap();
  tagPhoto.src = pendingPhotos[idx].src;
}

saveTagBtn.addEventListener('click', () => {
  if (!currentTagPoint) {
    alert('먼저 사진에서 손가락 끝 위치를 클릭하세요!');
    return;
  }
  // 모니터 프레임(= 실제 화면 ½)을 기준으로 좌표를 실제 뷰포트 비율로 변환
  const mX = window.innerWidth / 4, mY = window.innerHeight / 4;
  const mW = window.innerWidth / 2, mH = window.innerHeight / 2;
  const record = {
    src:           pendingPhotos[currentTagIdx].src,
    displayX:      (wrapX - mX) / mW,
    displayY:      (wrapY - mY) / mH,
    displayW:      wrapW / mW,
    displayH:      wrapH / mH,
    fingerScreenX: currentTagPoint.x,
    fingerScreenY: currentTagPoint.y,
    userId:        getUserId(),
  };
  PhotoDB.add(record);
  sessionTagged.push(record);

  currentTagIdx++;
  loadTagPhoto(currentTagIdx);
});

skipTagBtn.addEventListener('click', () => {
  currentTagIdx++;
  loadTagPhoto(currentTagIdx);
});

// ── 삭제 패널 ──────────────────────────────────────────────
function renderDBPreview() {
  const uid = getUserId();
  const mine = PhotoDB.getAll().filter(p => !p.userId || p.userId === uid);
  dbPreview.innerHTML = '';
  if (mine.length === 0) {
    dbPreview.innerHTML = '<span style="color:#2a2a2a;font-size:0.72rem;letter-spacing:0.1em">올린 사진이 없습니다</span>';
    return;
  }
  mine.forEach(p => {
    const wrap = document.createElement('div');
    wrap.className = 'db-thumb-wrap';
    const img = document.createElement('img');
    img.className = 'db-thumb';
    img.src = p.src;
    const del = document.createElement('button');
    del.className = 'db-thumb-del';
    del.textContent = '✕';
    del.onclick = () => { PhotoDB.remove(p.id); renderDBPreview(); updateEmptyState(); };
    wrap.appendChild(img);
    wrap.appendChild(del);
    dbPreview.appendChild(wrap);
  });
}

// ══════════════════════════════════════════════════════════
// 미리보기
// ══════════════════════════════════════════════════════════

let previewPhotos = [];
let previewIdx    = 0;

function showPreview(photos) {
  previewPhotos = photos;
  previewIdx    = 0;
  previewOverlay.classList.remove('hidden');
  renderPreview();
}

function renderPreview() {
  const p = previewPhotos[previewIdx];
  previewCount.textContent = `${previewIdx + 1}  /  ${previewPhotos.length}`;
  previewCursor.style.display = 'none';
  previewImg.className = '';
  previewImg.removeAttribute('style');
  previewImg.src = p.src;

  previewImg.onload = () => {
    const vw = previewViewport.offsetWidth;
    const vh = previewViewport.offsetHeight;

    if (p.displayX !== undefined) {
      previewImg.className = 'positioned';
      previewImg.style.left   = (p.displayX * vw) + 'px';
      previewImg.style.top    = (p.displayY * vh) + 'px';
      previewImg.style.width  = (p.displayW * vw) + 'px';
      previewImg.style.height = (p.displayH * vh) + 'px';
      previewCursor.style.left = (p.fingerScreenX * vw) + 'px';
      previewCursor.style.top  = (p.fingerScreenY * vh) + 'px';
    } else {
      const imgAspect = previewImg.naturalWidth / previewImg.naturalHeight;
      const boxAspect = vw / vh;
      let renderW, renderH, offsetX, offsetY;
      if (imgAspect > boxAspect) {
        renderH = vh; renderW = renderH * imgAspect;
        offsetX = (vw - renderW) / 2; offsetY = 0;
      } else {
        renderW = vw; renderH = renderW / imgAspect;
        offsetX = 0; offsetY = (vh - renderH) / 2;
      }
      previewCursor.style.left = (offsetX + p.fingerX * renderW) + 'px';
      previewCursor.style.top  = (offsetY + p.fingerY * renderH) + 'px';
    }
    previewCursor.style.display = 'block';
  };
}

document.getElementById('preview-prev').addEventListener('click', () => {
  previewIdx = (previewIdx - 1 + previewPhotos.length) % previewPhotos.length;
  renderPreview();
});
document.getElementById('preview-next').addEventListener('click', () => {
  previewIdx = (previewIdx + 1) % previewPhotos.length;
  renderPreview();
});
document.getElementById('preview-close').addEventListener('click', () => {
  previewOverlay.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  uploadSection.classList.remove('hidden');
});

// ── 시작 ──────────────────────────────────────────────────
ringEl.style.display = 'none';
updateEmptyState();
