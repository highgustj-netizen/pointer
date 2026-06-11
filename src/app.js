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
const pendingBadge   = document.getElementById('pending-badge');
const approveSection = document.getElementById('approve-section');
const approvePreview = document.getElementById('approve-preview');
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
const loadingHint    = document.getElementById('loading-hint');
const loadingBar     = document.getElementById('loading-bar');
const loadingFill    = document.getElementById('loading-bar-fill');
const densityCanvas  = document.getElementById('density-canvas');
const noPhotoHint    = document.getElementById('no-photo-hint');

// ── 커서 / 카운트다운 상태 ────────────────────────────────
let cursorX = 0.5, cursorY = 0.5;
let stillTimer        = null;
let waitingHideTimer  = null;
let isShowingPhoto = false;

const STILL_DELAY = 1500;
const MOVE_THRESH = 3;
let lastPxX = 0, lastPxY = 0;

function showLoading() {
  loadingHint.classList.add('visible');
  loadingFill.classList.remove('filling');
  void loadingFill.offsetWidth; // restart animation
  loadingFill.classList.add('filling');
  loadingBar.classList.add('visible');
}
function hideLoading() {
  loadingHint.classList.remove('visible');
  loadingBar.classList.remove('visible');
  loadingFill.classList.remove('filling');
}

function updateCursorCSS(px, py) {
  fingerMarker.style.left = px + 'px';
  fingerMarker.style.top  = py + 'px';
  fingerMarker.style.display = 'block';
}
function startCountdown() {}
function stopCountdown() {}

// ── 포인터 분포 (stats.html과 동일 방식) ──────────────────
const _DENSITY_LEVELS = [
  { min: 1, max: 1,        r:  5, hex: '#8BC34A', label: '1장'   },
  { min: 2, max: 2,        r:  7, hex: '#4CAF50', label: '2장'   },
  { min: 3, max: 3,        r:  9, hex: '#FFEB3B', label: '3장'   },
  { min: 4, max: 5,        r: 11, hex: '#FF9800', label: '4~5장' },
  { min: 6, max: 7,        r: 13, hex: '#FF5722', label: '6~7장' },
  { min: 8, max: Infinity, r: 15, hex: '#F44336', label: '8장+'  },
];

function _densityStyle(n) {
  for (const lv of _DENSITY_LEVELS) if (n >= lv.min && n <= lv.max) return lv;
  return _DENSITY_LEVELS[_DENSITY_LEVELS.length - 1];
}

function _hexRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

async function renderDensityMap(extraPhotos = []) {
  const mW = window.innerWidth / 2, mH = window.innerHeight / 2;
  densityCanvas.width  = mW;
  densityCanvas.height = mH;
  const ctx = densityCanvas.getContext('2d');
  ctx.clearRect(0, 0, mW, mH);

  let photos;
  try { photos = (await PhotoDB.getAllAdmin()).filter(p => p.status !== 'rejected'); } catch { return; }

  // 현재 세션 사진 합산
  const allPhotos = [...photos];
  for (const ep of extraPhotos) {
    if (!allPhotos.some(p => p.src === ep.src)) allPhotos.push(ep);
  }
  if (!allPhotos.length) return;

  // finger_x/y (이미지 내 상대좌표) → 모니터 프레임 내 좌표 (0~1)
  // 공식: monitorX = displayX + fingerX * displayW
  const pts = allPhotos.map(p => {
    if (p.displayX != null) {
      return {
        x: p.displayX + p.fingerX * p.displayW,
        y: p.displayY + p.fingerY * p.displayH,
      };
    }
    return { x: p.fingerX, y: p.fingerY };
  });
  const used = new Set();
  const clusters = [];

  for (let i = 0; i < pts.length; i++) {
    if (used.has(i)) continue;
    const mem = [i];
    used.add(i);
    for (let j = i + 1; j < pts.length; j++) {
      if (used.has(j)) continue;
      const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
      if (Math.sqrt(dx*dx + dy*dy) <= 0.05) { mem.push(j); used.add(j); }
    }
    clusters.push({
      x: mem.reduce((s,k) => s + pts[k].x, 0) / mem.length,
      y: mem.reduce((s,k) => s + pts[k].y, 0) / mem.length,
      n: mem.length,
    });
  }

  // 점 그리기
  for (const cl of clusters) {
    const cx = cl.x * mW, cy = cl.y * mH;
    const { r, hex } = _densityStyle(cl.n);
    const [R, G, B]  = _hexRgb(hex);

    const grd = ctx.createRadialGradient(cx, cy, r*0.2, cx, cy, r*2.8);
    grd.addColorStop(0, `rgba(${R},${G},${B},0.22)`);
    grd.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r*2.8, 0, Math.PI*2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${R},${G},${B},0.88)`;
    ctx.fill();
  }

}

function clearDensityMap() {
  const ctx = densityCanvas.getContext('2d');
  ctx.clearRect(0, 0, densityCanvas.width, densityCanvas.height);
}

// ── 사진 표시 ──────────────────────────────────────────────
async function showPhoto() {
  const photo = await PhotoDB.findNearest(cursorX, cursorY);

  // await 대기 중 UI가 열렸거나 이미 사진 표시 중이면 취소
  const uiNowOpen = !adminPanel.classList.contains('hidden') || !tagOverlay.classList.contains('hidden');
  if (uiNowOpen || isShowingPhoto) return;

  if (!photo) {
    hideLoading();
    noPhotoHint.classList.remove('hidden');
    return;
  }
  noPhotoHint.classList.add('hidden');

  isShowingPhoto = true;
  hideLoading();
  waitingScreen.style.opacity = '0';
  waitingHideTimer = setTimeout(() => { waitingHideTimer = null; waitingScreen.classList.add('hidden'); }, 600);
  photoScreen.classList.remove('hidden');
  pointerPhoto.classList.remove('visible');
  pointerPhoto.onload = () => {
    pointerPhoto.classList.add('visible');

    const vw = window.innerWidth, vh = window.innerHeight;
    if (photo.displayX != null) {
      pointerPhoto.style.position  = 'fixed';
      pointerPhoto.style.left      = (photo.displayX * vw) + 'px';
      pointerPhoto.style.top       = (photo.displayY * vh) + 'px';
      pointerPhoto.style.width     = (photo.displayW * vw) + 'px';
      pointerPhoto.style.height    = (photo.displayH * vh) + 'px';
      pointerPhoto.style.objectFit = 'fill';
    } else {
      // 구버전 (display 정보 없음): cover 방식
      const iw = pointerPhoto.naturalWidth, ih = pointerPhoto.naturalHeight;
      const scale = Math.max(vw / iw, vh / ih);
      const rW = iw * scale, rH = ih * scale;
      const ox = (vw - rW) / 2, oy = (vh - rH) / 2;
      pointerPhoto.style.position  = 'fixed';
      pointerPhoto.style.left      = ox + 'px';
      pointerPhoto.style.top       = oy + 'px';
      pointerPhoto.style.width     = rW + 'px';
      pointerPhoto.style.height    = rH + 'px';
      pointerPhoto.style.objectFit = 'fill';
    }

    coordsLabel.textContent =
      `x: ${(cursorX * 100).toFixed(1)}%  y: ${(cursorY * 100).toFixed(1)}%`;
  };
  pointerPhoto.src = photo.src;
  if (pointerPhoto.complete && pointerPhoto.naturalWidth > 0) pointerPhoto.onload();
}

function hidePhoto() {
  isShowingPhoto = false;
  clearTimeout(waitingHideTimer);
  waitingHideTimer = null;
  photoScreen.classList.add('hidden');
  pointerPhoto.src = '';
  pointerPhoto.style.position  = '';
  pointerPhoto.style.left      = '';
  pointerPhoto.style.top       = '';
  pointerPhoto.style.width     = '';
  pointerPhoto.style.height    = '';
  pointerPhoto.style.objectFit = '';
  fingerMarker.style.display = 'none';
  waitingScreen.style.opacity = '1';
  waitingScreen.classList.remove('hidden');
}

function showNoPhotosHint() {}

// ── 마우스 이벤트 ──────────────────────────────────────────
document.addEventListener('mousemove', (e) => {
  const dx = e.clientX - lastPxX;
  const dy = e.clientY - lastPxY;
  cursorX = e.clientX / window.innerWidth;
  cursorY = e.clientY / window.innerHeight;
  if (Math.abs(dx) < MOVE_THRESH && Math.abs(dy) < MOVE_THRESH) return;
  lastPxX = e.clientX; lastPxY = e.clientY;
  const uiOpen = !adminPanel.classList.contains('hidden') || !tagOverlay.classList.contains('hidden');
  if (isShowingPhoto && !uiOpen) hidePhoto();
  noPhotoHint.classList.add('hidden');
  clearTimeout(stillTimer);
  hideLoading();
  if (!isShowingPhoto && !uiOpen) {
    showLoading();
    stillTimer = setTimeout(showPhoto, STILL_DELAY);
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

// SHA-256 of the admin password — never store the plaintext here
const ADMIN_HASH = '593ec08d1e1f7a6f0d901e9dd4a4cb9361011e1a62f84d9f99ff7ef32977da3e';
let adminFailCount = 0;
let adminLockUntil = 0;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let isAdminMode = false;

function setAdminMode(on) {
  isAdminMode = on;
  adminPanel.classList.toggle('admin-mode', on);
  if (on) {
    uploadSection.classList.add('hidden');
    approveSection.classList.remove('hidden');
    deleteSection.classList.remove('hidden');
    renderApprovePanel();
    renderDBPreview();
  } else {
    uploadSection.classList.remove('hidden');
    approveSection.classList.add('hidden');
    deleteSection.classList.add('hidden');
  }
}


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
  if (e.clientX < mX || e.clientX > mX + mW || e.clientY < mY || e.clientY > mY + mH) return;
  fingerVX = e.clientX; fingerVY = e.clientY;
  tagCrosshair.style.left = (fingerVX - wrapX) + 'px';
  tagCrosshair.style.top  = (fingerVY - wrapY) + 'px';
  tagCrosshair.style.display = 'block';
  currentTagPoint = {
    x: (fingerVX - mX) / mW,
    y: (fingerVY - mY) / mH,
    // 이미지 내 상대 좌표 (Supabase 저장용)
    imgX: Math.max(0, Math.min(1, (fingerVX - wrapX) / wrapW)),
    imgY: Math.max(0, Math.min(1, (fingerVY - wrapY) / wrapH)),
  };
});

// ── 패널 열기 / 닫기 ──────────────────────────────────────
function closeAdmin() {
  adminPanel.classList.add('hidden');
  tagOverlay.classList.add('hidden');
  document.body.classList.remove('admin-open');
  deleteSection.classList.add('hidden');
  approveSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  pendingPhotos = [];
  currentTagIdx = 0;
  setAdminMode(false);
  clearTimeout(waitingHideTimer);
  waitingHideTimer = null;
  waitingScreen.classList.remove('hidden');
  waitingScreen.style.opacity = '1';
}

function cancelTagging() {
  pendingPhotos = [];
  currentTagIdx = 0;
  clearDensityMap();
  tagOverlay.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  uploadSection.classList.remove('hidden');
}

async function openAdmin() {
  adminPanel.classList.remove('hidden');
  document.body.classList.add('admin-open');
  isShowingPhoto = false;
  hidePhoto();
  clearTimeout(stillTimer);
  stopCountdown();
  uploadSection.classList.remove('hidden');
  // 대기 중 배지 갱신
  try {
    const pending = await PhotoDB.getPending();
    if (pending.length > 0) {
      pendingBadge.textContent = pending.length;
      pendingBadge.classList.remove('hidden');
    } else {
      pendingBadge.classList.add('hidden');
    }
  } catch { pendingBadge.classList.add('hidden'); }
}

adminBtn.addEventListener('click', openAdmin);
document.getElementById('back-btn').addEventListener('click', closeAdmin);
document.getElementById('close-tag').addEventListener('click', cancelTagging);


async function renderApprovePanel() {
  approvePreview.innerHTML = '<span style="color:#555;font-size:0.72rem">불러오는 중...</span>';
  try {
    const pending = await PhotoDB.getPending();
    document.getElementById('approve-hint').textContent =
      `대기 중 ${pending.length}장 · ✓ 승인 / ✗ 거절`;
    approvePreview.innerHTML = '';

    if (pending.length === 0) {
      approvePreview.innerHTML = '<span style="color:#2a2a2a;font-size:0.72rem;letter-spacing:0.1em">대기 중인 사진이 없습니다</span>';
      return;
    }

    pending.forEach(p => {
      const wrap = document.createElement('div');
      wrap.className = 'ap-wrap';

      const img = document.createElement('img');
      img.className = 'ap-thumb';
      img.src = p.src;

      const actions = document.createElement('div');
      actions.className = 'ap-actions';

      const okBtn = document.createElement('button');
      okBtn.className = 'ap-btn ap-btn-ok';
      okBtn.textContent = '✓';
      okBtn.onclick = async () => {
        okBtn.disabled = true; noBtn.disabled = true;
        try {
          await PhotoDB.setStatus(p.id, 'approved');
          wrap.style.opacity = '0.3';
          wrap.style.pointerEvents = 'none';
          document.getElementById('approve-hint').textContent =
            (await PhotoDB.getPending()).length + '장 대기 중';
        } catch { alert('승인 실패'); okBtn.disabled = false; noBtn.disabled = false; }
      };

      const noBtn = document.createElement('button');
      noBtn.className = 'ap-btn ap-btn-no';
      noBtn.textContent = '✗';
      noBtn.onclick = async () => {
        okBtn.disabled = true; noBtn.disabled = true;
        try {
          await PhotoDB.setStatus(p.id, 'rejected');
          wrap.style.opacity = '0.3';
          wrap.style.pointerEvents = 'none';
          document.getElementById('approve-hint').textContent =
            (await PhotoDB.getPending()).length + '장 대기 중';
        } catch { alert('거절 실패'); okBtn.disabled = false; noBtn.disabled = false; }
      };

      actions.appendChild(okBtn);
      actions.appendChild(noBtn);
      wrap.appendChild(img);
      wrap.appendChild(actions);
      approvePreview.appendChild(wrap);
    });
  } catch {
    approvePreview.innerHTML = '<span style="color:#c00;font-size:0.72rem">불러오기 실패</span>';
  }
}


// ── 관리자 버튼 ────────────────────────────────────────────
manageBtn.addEventListener('click', async () => {
  if (isAdminMode) { setAdminMode(false); return; }
  const now = Date.now();
  if (now < adminLockUntil) {
    const mins = Math.ceil((adminLockUntil - now) / 60000);
    alert(`${mins}분 후에 다시 시도하세요.`);
    return;
  }
  const pw = prompt('비밀번호:');
  if (pw === null) return;
  const hash = await sha256(pw);
  if (hash === ADMIN_HASH) {
    adminFailCount = 0;
    setAdminMode(true);
  } else {
    adminFailCount++;
    if (adminFailCount >= 3) {
      adminLockUntil = Date.now() + 15 * 60 * 1000;
      adminFailCount = 0;
      alert('3회 실패. 15분 후 다시 시도하세요.');
    } else {
      alert(`비밀번호가 틀렸습니다. (${adminFailCount}/3)`);
    }
  }
});

// ── 파일 처리 ──────────────────────────────────────────────
const dropText = dropZone.querySelector('.drop-text');

function setDropLoading(on) {
  if (!dropText) return;
  dropText.textContent = on ? '업로드 중...' : '파일을 드래그하거나 클릭해서 선택';
  dropZone.style.pointerEvents = on ? 'none' : '';
}

function handleFiles(files) {
  const valid = files.filter(f => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024);
  if (valid.length === 0) {
    alert('이미지 파일만 업로드 가능합니다 (최대 5MB)');
    return;
  }
  if (valid.length < files.length) {
    alert(`${files.length - valid.length}개 파일이 형식/크기 제한으로 제외되었습니다`);
  }

  pendingPhotos = [];
  currentTagIdx = 0;
  sessionTagged = [];

  setDropLoading(true);
  Promise.all(
    valid.map(file => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = ev => {
        // base64는 태깅 미리보기용, Cloudinary 업로드는 백그라운드에서 병렬 진행
        resolve({ file, src: ev.target.result, urlPromise: uploadToCloudinary(file) });
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    }))
  ).then(results => {
    setDropLoading(false);
    pendingPhotos = results;
    loadTagPhoto(0);
  }).catch(() => {
    setDropLoading(false);
    alert('파일 읽기 실패');
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
    clearDensityMap();
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
  tagPhoto.onload = () => { initPhotoWrap(); renderDensityMap(sessionTagged); };
  tagPhoto.src = pendingPhotos[idx].src;
}

saveTagBtn.addEventListener('click', async () => {
  if (!currentTagPoint) {
    alert('먼저 사진에서 손가락 끝 위치를 클릭하세요!');
    return;
  }

  const origText = saveTagBtn.textContent;
  saveTagBtn.disabled = true;
  saveTagBtn.textContent = '저장 중...';

  try {
    const src = await pendingPhotos[currentTagIdx].urlPromise;

    const mX = window.innerWidth / 4, mY = window.innerHeight / 4;
    const mW = window.innerWidth / 2, mH = window.innerHeight / 2;
    const displayX = (wrapX - mX) / mW;
    const displayY = (wrapY - mY) / mH;
    const displayW = wrapW / mW;
    const displayH = wrapH / mH;

    await PhotoDB.add({
      src,
      fingerX: currentTagPoint.imgX,
      fingerY: currentTagPoint.imgY,
      displayX, displayY, displayW, displayH,
    });

    sessionTagged.push({ src, fingerX: currentTagPoint.imgX, fingerY: currentTagPoint.imgY, displayX, displayY, displayW, displayH });
    renderDensityMap(sessionTagged);

    currentTagIdx++;
    loadTagPhoto(currentTagIdx);
  } catch (err) {
    alert('업로드 실패: ' + err.message);
    console.error(err);
  } finally {
    saveTagBtn.disabled = false;
    saveTagBtn.textContent = origText;
  }
});

skipTagBtn.addEventListener('click', () => {
  currentTagIdx++;
  loadTagPhoto(currentTagIdx);
});

// ── 삭제 패널 ──────────────────────────────────────────────
async function renderDBPreview() {
  dbPreview.innerHTML = '<span style="color:#555;font-size:0.72rem">불러오는 중...</span>';
  try {
    const all = (await PhotoDB.getAllAdmin()).filter(p => p.status === 'approved');
    dbPreview.innerHTML = '';
    if (all.length === 0) {
      dbPreview.innerHTML = '<span style="color:#2a2a2a;font-size:0.72rem;letter-spacing:0.1em">등록된 사진이 없습니다</span>';
      return;
    }
    all.forEach(p => {
      const wrap = document.createElement('div');
      wrap.className = 'db-thumb-wrap';
      const img = document.createElement('img');
      img.className = 'db-thumb';
      img.src = p.src;
      const del = document.createElement('button');
      del.className = 'db-thumb-del';
      del.textContent = '✕';
      del.onclick = async () => {
        del.disabled = true;
        del.textContent = '…';
        try {
          await PhotoDB.remove(p.id, p.src);
          renderDBPreview();
        } catch (err) {
          console.error('삭제 실패:', err);
          alert('삭제 실패: ' + err.message);
          del.disabled = false;
          del.textContent = '✕';
        }
      };
      wrap.appendChild(img);
      wrap.appendChild(del);
      dbPreview.appendChild(wrap);
    });
  } catch {
    dbPreview.innerHTML = '<span style="color:#c00;font-size:0.72rem">불러오기 실패</span>';
  }
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

  previewImg.onload = () => {
    const vw = previewViewport.offsetWidth;
    const vh = previewViewport.offsetHeight;
    const iw = previewImg.naturalWidth, ih = previewImg.naturalHeight;
    let ox, oy, renderW, renderH;

    if (p.displayX !== undefined) {
      // 태깅 당시 배치한 위치·크기 그대로 표시
      ox = p.displayX * vw;
      oy = p.displayY * vh;
      renderW = p.displayW * vw;
      renderH = p.displayH * vh;
      previewImg.style.position  = 'absolute';
      previewImg.style.left      = ox + 'px';
      previewImg.style.top       = oy + 'px';
      previewImg.style.width     = renderW + 'px';
      previewImg.style.height    = renderH + 'px';
      previewImg.style.objectFit = 'fill';
    } else {
      // 구버전 Supabase 사진: CSS cover
      const imgAspect = iw / ih, boxAspect = vw / vh;
      if (imgAspect > boxAspect) { renderH = vh; renderW = renderH * imgAspect; }
      else                        { renderW = vw; renderH = renderW / imgAspect; }
      ox = (vw - renderW) / 2; oy = (vh - renderH) / 2;
    }

    previewCursor.style.left = (ox + p.fingerX * renderW) + 'px';
    previewCursor.style.top  = (oy + p.fingerY * renderH) + 'px';
    previewCursor.style.display = 'block';
  };

  previewImg.src = p.src;
  if (previewImg.complete && previewImg.naturalWidth > 0) previewImg.onload();
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
