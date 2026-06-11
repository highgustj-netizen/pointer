# 🖱️ Pointer Pointer (클론)

마우스를 잠시 멈추면, 그 위치를 손가락으로 가리키는 사진이 나타납니다.

## 📁 폴더 구조

```
pointer-pointer/
├── index.html
├── src/
│   ├── style.css     # 스타일
│   ├── db.js         # 사진 데이터베이스 (localStorage)
│   └── app.js        # 메인 로직
└── README.md
```

## 🚀 실행 방법

### VS Code에서 바로 실행
1. VS Code에서 폴더 열기
2. **Live Server** 확장 설치 (없으면): Extensions → `ritwickdey.LiveServer` 검색
3. `index.html` 열고 → 우하단 **Go Live** 클릭
4. 브라우저에서 `http://127.0.0.1:5500` 자동 열림

### 또는 터미널에서
```bash
# Python 있으면
python3 -m http.server 5500

# Node.js 있으면
npx serve .
```

## 📸 사진 추가하는 법

처음엔 사진 DB가 비어있어요. 직접 채워야 합니다!

1. 화면 좌하단의 **⚙ 버튼** 클릭 → 관리자 모드
2. **파일 선택** → 손가락이 화면을 가리키는 사진 여러 장 업로드
3. 사진마다 **손가락 끝을 클릭**해서 위치 태깅
4. **✅ 저장** → 다음 사진
5. 완료 후 **✖ 닫기**

> 💡 사진은 브라우저의 localStorage에 base64로 저장됩니다.
> 창을 닫아도 유지되지만, 시크릿 모드나 캐시 삭제 시 사라집니다.

## ⚙️ 작동 원리

```
mousemove 이벤트
    ↓
1.5초 멈춤 감지 (debounce)
    ↓
cursorX, cursorY 정규화 (0~1)
    ↓
DB에서 유클리드 거리 최소 사진 검색
    ↓
전체화면 표시 + 손가락 마커
```

## 🔧 커스터마이징

`src/app.js` 상단:
```js
const STILL_DELAY = 1500;  // 멈춤 감지 시간 (ms)
const MOVE_THRESH = 3;     // 이동 감도 (px, 클수록 덜 민감)
```

## 📦 사진 DB 내보내기/가져오기

브라우저 콘솔에서:
```js
// 내보내기
copy(localStorage.getItem('pointer-pointer-db'))

// 가져오기
localStorage.setItem('pointer-pointer-db', '여기에_JSON_붙여넣기')
location.reload()
```
