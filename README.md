# 🎮 FEIGN 웹게임 (Firebase 버전)

친구들과 방 코드로 접속해서 같이 플레이하는 실시간 마피아류 추리 게임.

## 🚀 전체 흐름 (3단계, 총 20분 정도)

1. **Firebase 프로젝트 생성** (무료) — 실시간 데이터베이스 호스팅
2. **로컬에서 테스트** — `npm install` → `npm run dev`
3. **Vercel로 배포** (무료) — 친구들에게 공유할 URL 생성

---

## 📋 사전 준비

- **Node.js 18 이상** 설치되어 있어야 함 → https://nodejs.org
- **Google 계정** (Firebase용)
- **GitHub 계정** (Vercel 배포용, 선택)

---

## 1️⃣ Firebase 프로젝트 만들기

### 1-1. 프로젝트 생성
1. https://console.firebase.google.com 접속 → Google 로그인
2. **"프로젝트 만들기"** 클릭
3. 프로젝트 이름: `feign-game` (아무거나 OK)
4. Google Analytics 사용 여부: **"사용 안 함"** 선택 (안 써도 돼요)
5. "프로젝트 만들기" 클릭 후 잠시 대기

### 1-2. Realtime Database 생성
1. 왼쪽 메뉴에서 **"빌드" → "Realtime Database"** 클릭
2. **"데이터베이스 만들기"** 버튼 클릭
3. **위치**: `싱가포르 (asia-southeast1)` 선택 (한국 가까움)
4. **보안 규칙**: **"테스트 모드로 시작"** 선택
   - ⚠️ 테스트 모드는 30일 뒤 만료됨. 그 전에 아래 보안 규칙 설정하세요
5. "사용 설정" 클릭

### 1-3. 보안 규칙 설정
Realtime Database 화면 상단 **"규칙"** 탭 클릭 → 아래 내용으로 교체 후 **"게시"** 클릭:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

> 친구들끼리만 쓰는 용도면 이 정도로 충분해요. 더 엄격하게 하려면 Firebase Auth를 붙여야 해요.

### 1-4. 웹 앱 등록 (API 키 받기)
1. Firebase 콘솔 왼쪽 위 **⚙️ (프로젝트 설정)** 클릭
2. "일반" 탭 아래로 스크롤 → **"내 앱"** 섹션
3. **웹 아이콘 `</>`** 클릭
4. 앱 별명: `feign-web` (아무거나)
5. "Firebase 호스팅" 체크 **해제** (Vercel 쓸 거라 필요 없음)
6. **"앱 등록"** 클릭
7. 다음 화면에서 **`firebaseConfig`** 객체가 보임 — 이 값들을 복사하세요!

```js
const firebaseConfig = {
  apiKey: "AIza...",              // ← 복사
  authDomain: "feign-xxx.firebaseapp.com",
  databaseURL: "https://feign-xxx-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "feign-xxx",
  storageBucket: "feign-xxx.appspot.com",
  messagingSenderId: "123...",
  appId: "1:123:web:xxx"
};
```

> `databaseURL`이 자동으로 없으면 위에 직접 `https://<프로젝트ID>-default-rtdb.asia-southeast1.firebasedatabase.app` 형식으로 만들어 넣으면 돼요.

---

## 2️⃣ 로컬에서 테스트

### 2-1. 프로젝트 설치
터미널에서 이 폴더로 이동 후:

```bash
npm install
```

### 2-2. 환경변수 설정
`.env.example` 파일을 `.env.local`로 복사:

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열어서 **1-4에서 복사한 Firebase 값**들을 채워 넣으세요:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=feign-xxx.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://feign-xxx-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=feign-xxx
VITE_FIREBASE_STORAGE_BUCKET=feign-xxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123...
VITE_FIREBASE_APP_ID=1:123:web:xxx
```

### 2-3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:5173 열어서 확인. 다른 탭으로 여러 명 테스트 가능!

---

## 3️⃣ Vercel로 배포 (무료)

### 방법 A. GitHub 연동 (권장)

1. GitHub에 새 저장소 생성 후 이 프로젝트 푸시
   ```bash
   git init
   git add .
   git commit -m "initial"
   git remote add origin https://github.com/본인계정/feign-web.git
   git push -u origin main
   ```
2. https://vercel.com 접속 → GitHub로 로그인
3. **"Add New Project"** → GitHub 저장소 선택 → Import
4. **"Environment Variables"** 섹션 펼치고 `.env.local`의 **모든 변수를 추가**
   - 변수명 그대로 (`VITE_FIREBASE_API_KEY` 등)
   - 값도 그대로 복붙
5. **"Deploy"** 클릭 → 1~2분 대기
6. 완료되면 `https://feign-web-xxx.vercel.app` URL 생성 → 친구들에게 공유! 🎉

### 방법 B. Vercel CLI로 바로 배포

```bash
npm install -g vercel
vercel
# 질문에 답하고, 환경변수는 Vercel 대시보드에서 수동으로 추가
```

---

## 🎮 게임 방법

- **4~8명** 플레이
- **호스트**: "새 방 만들기" → 4자리 코드 생성 → 친구에게 코드 공유
- **참가자**: 같은 URL 열고 → "방 입장하기" → 코드 입력
- 4명 이상 모이면 호스트가 **게임 시작**

### 직업 (7종)
- 🔵 **시민** — 능력 없음, 추리로 승부
- 💉 **의사** — 밤에 한 명 치료, 공격받으면 살려줌
- 👮 **경찰** — 밤에 한 명 감금 (능력 사용 불가)
- 🔍 **조사관** — 밤에 한 명의 직업 조사
- 🤪 **정신병자** — 자기가 다른 시민인 줄 앎 (능력은 가짜!)
- 🔪 **임포스터** — 밤에 살해, 시민 수 ≤ 임포스터 수면 승리
- 🗡️ **연쇄살인마** (7인+) — 혼자 모두 죽이고 단독 승리

### 페이즈 사이클
```
직업 확인(10초) → 밤(25초) → 밤 결과(8초)
               → 낮 토론(75초) → 투표(30초) → 투표 결과(8초)
               → 반복
```

---

## 💰 비용

- **Firebase Realtime DB 무료 티어**: 동시 접속 100명, 월 10GB 전송 → 친구들 노는 용도로는 차고 넘침
- **Vercel Hobby 플랜**: 무료, 개인 프로젝트 무제한 배포
- 전체: **0원**

---

## 🛠️ 나중에 추가할 수 있는 기능

- 클리너 / 블레이머 (임포스터 혼란 기술)
- 트래퍼 / 밀고자 / 선동가
- 헌터 / 마법사 / 폭탄마 / 도둑 / 생존자 (중립)
- 호스트가 직업 커스텀 선택
- Firebase Auth 붙여서 보안 강화

## 📄 라이선스

개인 용도로 자유롭게 사용 / 수정 가능.
