# 32. 배포 런북 — Vercel(PWA) + Firebase 라이브 (APP2)

폰에 설치해 오늘 경기에 쓰기 위한 배포 절차. 두 부분이다:

- **Part 1 — Vercel**: 설치형 PWA. replay(실제 경기 재생) + **실 OpenF1 Archive**(오늘 퀄리/
  프랙티스 결과·타이어). 백엔드 없이 바로 됨.
- **Part 2 — 라이브(Firebase + 워커)**: 오늘 **진짜 실시간 타이밍**. Firebase 프로젝트 + 워커
  배포 필요(Blaze 요금제·OpenF1 계정).

> ⚠️ 브랜딩·"F1" 상표는 공개 출시 전 리브랜딩 필요(docs/30 §법적 리스크). 개인 테스트는 무방.

---

## Part 1 — Vercel 배포 (설치형 PWA)

프로덕션 빌드는 검증됨(`pnpm --filter @f1/web build` 성공).

1. **저장소 임포트**: <https://vercel.com/new> → `harimjang/f1-ask` 선택.
2. **Root Directory: `apps/web`** ← 모노레포라 필수. Framework(Next.js)·빌드 명령은 자동감지.
   (`apps/web/vercel.json` 이 Next.js 로 고정한다. pnpm workspace 는 루트 lockfile 로 자동 설치.)
3. **환경 변수** (Project Settings → Environment Variables):
   ```
   NEXT_PUBLIC_DATA_MODE = replay      # 실제 경기 재생(라이브 기능 데모). 비우면 mock.
   ```
4. **Deploy** → `https://<프로젝트>.vercel.app`.
5. **폰 설치**:
   - iOS 사파리: 공유 → "홈 화면에 추가".
   - 안드로이드 크롬: 메뉴 → "앱 설치"/"홈 화면에 추가".

이 상태에서 되는 것: 설치형 앱 · Race(replay 실경기) · **Archive = 오늘 실데이터**
(퀄리·프랙티스 결과·세그먼트 랭크·주말 타이어, 인증 불필요) · News(mock).

---

## Part 2 — 라이브 (Firebase + 폴러 워커)

오늘 **진짜 실시간**을 원할 때. 워커 `pollOpenF1`(1분마다, 리전 `asia-northeast3`)이 OpenF1 을
폴링해 Firestore `openf1-live` 문서에 쓰고, 웹이 그걸 구독한다.

### 사전 준비 (회림 님 계정)
- **Firebase 프로젝트** + **Blaze(종량제) 요금제** — Cloud Functions v2·Scheduler·Secret Manager
  가 Blaze 를 요구한다(카드 등록 필요, 저사용은 무료 범위). 
- **OpenF1 계정** — 워커 시크릿 `OPENF1_USERNAME`/`OPENF1_PASSWORD` 용. (선택: `GEMINI_API_KEY`
  — AI 해설/질문용. 없으면 Mock/Fallback.)
- **Firebase CLI**: `npm i -g firebase-tools`.

### 배포 단계
```bash
cd /path/to/F1

# 1) 로그인 + 내 프로젝트 지정 (.firebaserc 의 doublejbs 프로젝트가 아니라 내 것)
firebase login
firebase use --add            # 내 Firebase 프로젝트 선택 → alias 지정

# 2) 워커 시크릿 등록 (프롬프트에 값 입력)
firebase functions:secrets:set OPENF1_USERNAME
firebase functions:secrets:set OPENF1_PASSWORD
firebase functions:secrets:set GEMINI_API_KEY      # 선택

# 3) 워커 + Firestore 규칙/인덱스 배포 (predeploy 가 functions/Build.mjs 로 번들)
firebase deploy --only functions:poller,firestore
#   최초 배포 시 Cloud Scheduler·Functions·Secret Manager·Artifact Registry API 자동 활성화.
#   리전은 asia-northeast3 (WorkerConfig.ts).
```

### 웹(Vercel)을 라이브로 전환
1. Firebase 콘솔 → 프로젝트 설정 → **웹 앱 추가** → SDK 설정값 복사.
2. Vercel 환경 변수:
   ```
   NEXT_PUBLIC_DATA_MODE        = live
   NEXT_PUBLIC_LIVE_SESSION_ID  = openf1-live        # 워커 LIVE_SESSION_ID 와 일치(고정)
   NEXT_PUBLIC_FIREBASE_API_KEY      = <복사값>
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN  = <복사값>
   NEXT_PUBLIC_FIREBASE_PROJECT_ID   = <복사값>
   NEXT_PUBLIC_FIREBASE_APP_ID       = <복사값>
   ```
3. Vercel 재배포.

### 동작·검증
- 워커는 **세션이 활성일 때만** 폴링해 쓴다(`fetchLatestOpenF1Meta`). 세션 사이에는 데이터가
  없어 앱이 "세션 없음"/Archive 를 보여 준다 — 정상.
- 오늘 경기 세션이 시작되면 `openf1-live` 문서가 채워지고 Race 탭이 실시간으로 갱신된다.
- 확인: Firebase 콘솔 → Firestore → `sessions/openf1-live` 문서가 갱신되는지. Functions 로그로
  폴링 확인.

### 주의
- **Blaze 요금**: 저사용(워커 1개·1분 폴링)은 사실상 무료 범위지만 카드 등록은 필요.
- `.firebaserc` 는 원저자 프로젝트다 — 반드시 `firebase use` 로 **내 프로젝트**를 쓴다.
- Firestore 보안 규칙(`firestore.rules`)·인덱스(`firestore.indexes.json`)는 함께 배포된다.
- OpenF1 은 대체로 인증 없이 열려 있지만, 워커는 시크릿 바인딩이 있어야 배포된다(값은 등록 필요).

---

## 요약

| 목표 | 필요 | 결과 |
|---|---|---|
| 오늘 바로 설치·데모 | Vercel(replay) | PWA + 실 Archive + 경기 재생 |
| 오늘 진짜 실시간 | + Firebase/워커(Blaze·OpenF1) | Race 탭 실시간 타이밍 |
