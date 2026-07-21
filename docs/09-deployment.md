# 09. 배포

## 구성

| 대상 | 위치 |
|---|---|
| 웹 앱 (Next.js SSR + API 라우트) | **Vercel** |
| Firestore · Auth · 보안 규칙 · 인덱스 | **Firebase** (`f1-second-screen-dev`, 서울 `asia-northeast3`) |
| 폴러(데이터 수집) | 로컬 개발 하네스 — 워커 승격 예정 ([04-worker-openf1.md](04-worker-openf1.md)) |

## 왜 Firebase Hosting 이 아닌가

Firebase 프레임워크 호스팅을 시도했으나 **pnpm 워크스페이스를 지원하지 않는다.**
빌드(정적 페이지 생성 포함)까지는 통과하고 Cloud Function 패키징 단계에서 실패한다.

```
npm error Unsupported URL Type "workspace:": workspace:*
```

`apps/web/package.json` 이 `@f1/domain` · `@f1/schemas` 를 `workspace:*` 로 참조하는데
Firebase 통합은 npm 으로만 설치를 시도한다. Node 22 도 지원 범위(16/18/20) 밖이라는
경고가 함께 나온다.

우회안 두 가지를 검토했다.

- `workspace:*` → `file:` 경로 변경: npm 은 이해하지만 pnpm 링크 동작이 달라져
  로컬 개발이 깨질 위험이 있다. **배포 도구 때문에 모노레포 구조를 비트는 것**이라 버렸다.
- `output: "standalone"` + Cloud Run 직접 배포: 가능하지만 Dockerfile 과 배포
  파이프라인을 새로 만들어야 해 현재 단계에 과하다.

Vercel 은 pnpm 워크스페이스를 네이티브로 지원해 구조를 그대로 받는다.
**Firestore · Auth 는 계속 Firebase 를 쓴다.** 바뀌는 것은 웹 앱 서빙 위치뿐이다.

## Vercel 설정

GitHub 레포를 Import 한 뒤 다음을 지정한다.

| 항목 | 값 |
|---|---|
| Root Directory | `apps/web` |
| Framework Preset | Next.js (자동 감지) |
| Build / Install Command | 기본값 (pnpm 워크스페이스 자동 인식) |

### 환경 변수

`NEXT_PUBLIC_*` 는 클라이언트 번들에 인라인되므로 비밀이 아니다.

```
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false
NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1
NEXT_PUBLIC_LIVE_SESSION_ID=openf1-live
NEXT_PUBLIC_DATA_MODE=live
NEXT_PUBLIC_FIREBASE_PROJECT_ID=f1-second-screen-dev
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=f1-second-screen-dev.firebaseapp.com
NEXT_PUBLIC_FIREBASE_APP_ID=1:842559483377:web:387a13097bf696385a2850
NEXT_PUBLIC_FIREBASE_API_KEY=<Firebase 콘솔의 웹 앱 apiKey>
```

**서버 전용 비밀값**(클라이언트에 노출 금지, `NEXT_PUBLIC_` 접두사를 붙이지 않는다):

```
ANTHROPIC_API_KEY=<Anthropic 콘솔>
```

`ANTHROPIC_API_KEY` 가 없으면 `FallbackLlmProvider` 가 `MockLlmProvider` 로 폴백해
AI 기능이 목 응답이 된다. 앱은 정상 동작한다.

### Firebase Auth 승인 도메인

구글 로그인은 승인된 도메인에서만 동작한다. Vercel 배포 후 Firebase 콘솔의
**Authentication → 설정 → 승인된 도메인**에 배포 도메인을 추가한다.

- `<project>.vercel.app`
- 프리뷰 배포까지 쓰려면 해당 도메인도 추가한다
- 로컬 LAN 테스트용 IP(예: `172.30.1.95`)도 여기에 추가한다 — `localhost` 만 기본 포함이다

## 폴러 워커 (Cloud Functions)

폴러와 AI 해설 생성은 Vercel 이 아니라 Firebase Cloud Functions 에서 돈다
([16-poller-worker.md](16-poller-worker.md) · [18-ai-commentary-worker.md](18-ai-commentary-worker.md)).
설정이 두 갈래다 — **비밀값은 Secret Manager, 나머지는 일반 환경변수**다.

### 시크릿 등록

`functions/src/PollerFunction.ts` 가 `defineSecret` 으로 선언한 것들이다. 배포 전에
등록되어 있어야 한다(값은 프롬프트로 입력한다 — 명령줄이나 문서에 남기지 않는다).

```bash
firebase functions:secrets:set OPENF1_USERNAME
firebase functions:secrets:set OPENF1_PASSWORD
firebase functions:secrets:set GEMINI_API_KEY
```

`GEMINI_API_KEY` 가 없거나 바인딩되지 않으면 해설 생성이 `MockLlmProvider` 로 폴백한다.
mock 텍스트는 Firestore 에 저장되지 않으므로(docs/18 §폴백) **해설만 비고 이벤트는
정상 노출된다.** 폴링 자체는 죽지 않는다.

등록된 시크릿 이름 확인:

```bash
firebase functions:secrets:access GEMINI_API_KEY   # 값 확인 (주의: 평문 출력)
```

### 일반 환경변수 (`functions/.env`)

비밀이 아닌 값은 `functions/.env` 에 둔다. firebase-tools 가 배포 시 이 파일을 읽어
함수 런타임 환경변수로 넣는다. **코드를 고치지 않고 바꿀 수 있는 것은 이 파일뿐이다.**
`functions/.env.example` 을 복사해 시작한다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `COMMENTARY_VARIANTS` | `ko:standard` | 생성할 해설 변형. `"ko:standard,en:beginner"` 형식 |
| `GEMINI_MODEL` | `gemini-3.5-flash` | 해설·Q&A 모델 |
| `GEMINI_BASE_URL` | Google 기본 | 프록시를 쓸 때만 |

`COMMENTARY_VARIANTS` 는 **변형 하나당 이벤트마다 LLM 호출과 Firestore 쓰기가
곱해진다.** 레이스당 이벤트가 약 47건이므로 9 변형이면 423 회다. Gemini 무료 티어
한도와 지출 상한을 확인하고 늘린다. 오타가 섞인 항목은 무시되고, 유효한 항목이
하나도 없으면 기본값(`ko:standard`)으로 되돌아간다 — 오타 하나로 해설이 통째로
멈추지는 않지만, 의도한 변형이 도는지 배포 후 로그로 확인한다.

`functions/.env` 는 `.gitignore` 대상이다. 커밋하지 않는다.

## 첫 배포 시 주의

Firestore 에 아직 세션 데이터가 없으면 `NEXT_PUBLIC_DATA_MODE=live` 로 배포한 앱은
로딩 화면에서 멈춘다(구독할 문서가 없다). 폴러가 실제 Firestore 에 쓰기 전이라면
`NEXT_PUBLIC_DATA_MODE=mock` 으로 배포해 화면을 채우고 인증·UI 를 검증한 뒤,
폴러가 살아난 다음 `live` 로 바꿔 재배포한다.

## 로컬 빌드 시 주의

`next build` 는 dev 서버와 `apps/web/.next` 를 공유한다. dev 서버가 떠 있는 상태에서
빌드하면 vendor 청크가 덮어써져 dev 서버가 500 으로 죽는다. **빌드 전에 dev 서버를
내린다.**
