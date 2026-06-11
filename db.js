/**
 * db.js — 사진 데이터베이스 (localStorage 기반)
 *
 * 각 레코드:
 * {
 *   id: string,
 *   src: string,        // base64 또는 URL
 *   fingerX: number,    // 0~1 (이미지 너비 비율)
 *   fingerY: number,    // 0~1 (이미지 높이 비율)
 * }
 */

const DB_KEY = 'pointer-pointer-db';

const PhotoDB = {
  /** 전체 목록 반환 */
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(DB_KEY) || '[]');
    } catch { return []; }
  },

  /** 사진 추가 */
  add(record) {
    const db = this.getAll();
    db.push({ id: Date.now().toString(), ...record });
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  },

  /** 커서 위치와 가장 가까운 사진 찾기 */
  findNearest(cursorX, cursorY) {
    const db = this.getAll();
    if (db.length === 0) return null;

    let best = null;
    let bestDist = Infinity;

    for (const photo of db) {
      const fx = photo.fingerScreenX ?? photo.fingerX;
      const fy = photo.fingerScreenY ?? photo.fingerY;
      const dx = fx - cursorX;
      const dy = fy - cursorY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = photo;
      }
    }

    return best;
  },

  /** 개수 */
  count() {
    return this.getAll().length;
  },

  /** 단일 삭제 */
  remove(id) {
    const db = this.getAll().filter(p => p.id !== id);
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  },

  /** 전체 삭제 */
  clear() {
    localStorage.removeItem(DB_KEY);
  }
};
