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

## 첫 배포 시 주의

Firestore 에 아직 세션 데이터가 없으면 `NEXT_PUBLIC_DATA_MODE=live` 로 배포한 앱은
로딩 화면에서 멈춘다(구독할 문서가 없다). 폴러가 실제 Firestore 에 쓰기 전이라면
`NEXT_PUBLIC_DATA_MODE=mock` 으로 배포해 화면을 채우고 인증·UI 를 검증한 뒤,
폴러가 살아난 다음 `live` 로 바꿔 재배포한다.

## 로컬 빌드 시 주의

`next build` 는 dev 서버와 `apps/web/.next` 를 공유한다. dev 서버가 떠 있는 상태에서
빌드하면 vendor 청크가 덮어써져 dev 서버가 500 으로 죽는다. **빌드 전에 dev 서버를
내린다.**
