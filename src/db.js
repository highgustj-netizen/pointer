// ── Cloudinary 삭제 (Supabase Edge Function 경유) ─────────
function _cloudinaryPublicId(url) {
  const after = url.split('/upload/')[1];
  if (!after) return null;
  return after.replace(/^v\d+\//, '').replace(/\.[^.]+$/, '');
}

async function deleteFromCloudinary(src) {
  const publicId = _cloudinaryPublicId(src);
  if (!publicId) return;
  try {
    await fetch(`${CONFIG.supabaseUrl}/functions/v1/delete-cloudinary`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CONFIG.supabaseKey}`,
      },
      body: JSON.stringify({ publicId }),
    });
  } catch (e) {
    console.warn('Cloudinary 삭제 실패:', e);
  }
}

// ── Cloudinary 업로드 ──────────────────────────────────────
async function uploadToCloudinary(file) {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 업로드 가능합니다');
  if (file.size > 10 * 1024 * 1024)    throw new Error('파일 크기는 10MB 이하여야 합니다');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CONFIG.uploadPreset);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CONFIG.cloudName}/image/upload`,
    { method: 'POST', body: fd }
  );
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Cloudinary 실패: ${msg}`);
  }
  if (!data.secure_url) throw new Error(`Cloudinary 응답 오류: ${JSON.stringify(data)}`);
  return data.secure_url;
}

// ── Supabase PhotoDB ───────────────────────────────────────
let _cache = null;

const _h = () => ({
  'apikey':        CONFIG.supabaseKey,
  'Authorization': `Bearer ${CONFIG.supabaseKey}`,
  'Content-Type':  'application/json',
});

function _row(p) {
  return {
    id:      p.id,
    src:     p.src,
    fingerX: p.finger_x,
    fingerY: p.finger_y,
    status:  p.status,
    displayX: p.crop_l,
    displayY: p.crop_t,
    displayW: p.crop_r,
    displayH: p.crop_b,
  };
}

const PhotoDB = {
  // 승인된 사진만 (메인 앱용) — status 컬럼 없으면 전체 반환(폴백)
  async getAll() {
    if (_cache) return _cache;
    let res = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/photos?select=*&status=eq.approved&order=created_at.desc`,
      { headers: _h() }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // status 컬럼이 없으면 필터 없이 전체 조회 (컬럼 추가 전 임시 폴백)
      if (err.code === '42703') {
        res = await fetch(
          `${CONFIG.supabaseUrl}/rest/v1/photos?select=*&order=created_at.desc`,
          { headers: _h() }
        );
        if (!res.ok) throw new Error('사진 목록 불러오기 실패');
      } else {
        throw new Error('사진 목록 불러오기 실패: ' + (err.message || ''));
      }
    }
    _cache = (await res.json()).map(_row);
    return _cache;
  },

  // 대기 중인 사진 (관리자용) — RLS가 status 필터를 막을 수 있으므로 전체 조회 후 JS 필터
  async getPending() {
    const res = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/photos?select=*&order=created_at.desc`,
      { headers: _h() }
    );
    if (!res.ok) throw new Error('대기 목록 불러오기 실패');
    const all = await res.json();
    return all.filter(p => p.status === 'pending' || p.status == null).map(_row);
  },

  // 전체 사진 (삭제 관리용)
  async getAllAdmin() {
    const res = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/photos?select=*&order=created_at.desc`,
      { headers: _h() }
    );
    if (!res.ok) throw new Error('목록 불러오기 실패');
    return (await res.json()).map(_row);
  },

  async add({ src, fingerX, fingerY, displayX, displayY, displayW, displayH }) {
    const fx = Number(fingerX), fy = Number(fingerY);
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) throw new Error('좌표가 범위를 벗어났습니다');
    const body = { src, finger_x: fx, finger_y: fy, status: 'pending' };
    if (displayX != null) { body.crop_l = displayX; body.crop_t = displayY; body.crop_r = displayW; body.crop_b = displayH; }
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/photos`, {
      method:  'POST',
      headers: _h(),
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data?.message || data?.error || JSON.stringify(data);
      throw new Error(`Supabase 저장 실패: ${msg}`);
    }
    _cache = null;
  },

  // status 변경: 'approved' | 'rejected' | 'pending'
  async setStatus(id, status) {
    const res = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/photos?id=eq.${encodeURIComponent(id)}`,
      {
        method:  'PATCH',
        headers: _h(),
        body:    JSON.stringify({ status }),
      }
    );
    if (!res.ok) throw new Error('상태 변경 실패');
    _cache = null;
  },

  async count() {
    return (await this.getAll()).length;
  },

  async findNearest(cursorX, cursorY) {
    const all = await this.getAll();
    if (all.length === 0) return null;

    const aspect = window.innerWidth / window.innerHeight;
    // 원본 Pointer Pointer 기준 ~3% 화면 반경 (종횡비 보정 포함)
    const MAX_D_SQ = (0.03 * aspect) ** 2 + 0.03 ** 2;

    let best = null, bestD = Infinity;
    for (const p of all) {
      let fx, fy;
      if (p.displayX != null) {
        // 화면에 표시되는 손가락 위치 = displayX + fingerX * displayW (전체 화면 0~1)
        fx = p.displayX + p.fingerX * p.displayW;
        fy = p.displayY + p.fingerY * p.displayH;
      } else {
        fx = p.fingerX;
        fy = p.fingerY;
      }
      const dx = (fx - cursorX) * aspect;
      const dy = fy - cursorY;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = p; }
    }
    return bestD <= MAX_D_SQ ? best : null;
  },

  async remove(id, src) {
    const res = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/photos?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: _h() }
    );
    if (!res.ok) throw new Error('삭제 실패');
    _cache = null;
    if (src) deleteFromCloudinary(src);
  },
};
