# 30. 앱 서비스 전환 — PWA → Capacitor → 푸시

현재: **Next.js 웹앱(Vercel) + Firebase + Cloud Functions 워커 + OpenF1**. 모바일 세컨드
스크린으로 설계돼 있어 앱 전환이 유리하다. 웹 코드를 재사용하는 **PWA → Capacitor** 경로를
쓴다(React Native 전체 재작성은 비권장).

## ⚖️ 법적 리스크 (공개 출시 전 선결)

1. **"F1"·"Formula 1" 상표**(Formula One Licensing BV) — 앱 이름·아이콘·팀/서킷 로고 사용은
   상표·퍼블리시티권 침해 소지. **자체 브랜드로 리브랜딩 필수**. 코드의 브랜딩은 전부
   자리표시자다(manifest.name, capacitor appId/appName, public/icons/*).
2. **OpenF1 약관** — 무료지만 상업 재배포·rate limit 확인. 대량 트래픽 시 캐싱 강화/데이터 계약.
3. **뉴스·SNS 재배포** — 기사 전문 인앱 금지(발췌+링크), 영상/게시물은 임베드까지(docs/28).

## §1 PWA (구현 완료)

설치형·오프라인·웹푸시 토대. 기존 Next.js 에 얹었다.

- `app/manifest.ts` — 설치 정체성(name·icons·standalone·theme). `/manifest.webmanifest` 로 제공.
- `public/sw.js` — 서비스 워커. /api 는 네트워크, 정적은 SWR, 내비게이션은 network-first +
  오프라인 셸(/en). **push·notificationclick 핸들러는 §3 용으로 미리 넣어 뒀다.**
- `components/ServiceWorkerRegister.tsx` — 등록(실패는 무해하게 흡수). 루트 레이아웃에 마운트.
- `public/icons/*` — 자리표시자 아이콘(SVG + 192/512/apple-touch PNG). **브랜드로 교체.**
- 레이아웃 메타: appleWebApp(capable·상태바)·apple-touch-icon·theme-color.

검증: manifest 제공·아이콘 200·SW `state=activated`·설치 메타 링크 확인.

교체 체크리스트(리브랜딩 시): manifest.name/short_name/description, public/icons/*,
layout 의 appleWebApp.title·metadata.title.

## §2 네이티브 래핑 — Capacitor (설정 완료, 네이티브 생성은 로컬)

SSR + API + 서버 시크릿이라 정적 export 불가 → **네이티브 셸이 호스팅된 웹앱 URL 을 로드**한다
(`server.url`). 플러그인(푸시 등)은 웹 코드가 `@capacitor/*` 를 import 하면 브리지된다.

준비된 것: `@capacitor/{core,cli,ios,android}` 의존성, `capacitor.config.ts`, pnpm 스크립트
(`cap:add:ios|android`, `cap:sync`, `cap:open:ios|android`).

**로컬에서 실행(회림 님 환경 — Xcode/Android Studio 필요):**

```bash
cd apps/web
# 1) capacitor.config.ts 의 server.url 을 배포 주소(또는 개발 PC LAN IP:3000)로 채운다
# 2) 네이티브 프로젝트 생성 (iOS 는 macOS + Xcode + CocoaPods, Android 는 Android SDK)
pnpm cap:add:ios
pnpm cap:add:android
# 3) 설정 반영 후 IDE 열기
pnpm cap:sync
pnpm cap:open:ios       # Xcode 에서 실기기/시뮬레이터 실행·서명·스토어 업로드
pnpm cap:open:android   # Android Studio 에서 실행·서명·Play 업로드
```

주의: iOS 심사는 **Apple 로그인** 요구(구글 로그인만 있으면 리젝). Bundle ID·서명·개발자 계정
필요. 생성된 `ios/`·`android/` 는 커밋 여부를 팀 규칙에 맞춘다(보통 커밋).

## §3 푸시 알림 (다음 — 킬러 기능)

세컨드스크린의 핵심. "지금 볼 것" 신호(피트 윈도우·추월 예측·언더컷)를 경기 중 실시간 푸시.

- 감지 로직은 이미 서버(Watch Now/예측)에 있다 → **발신만 추가**: 워커(Cloud Functions)가
  신호 → FCM(Android/웹)·APNs(iOS). 웹은 sw.js 의 `push` 핸들러가 이미 받는다.
- 구독 토큰 저장(Firestore), 사용자별 관심(즐겨찾기) 필터.
- iOS **라이브 액티비티**(잠금화면 실시간 순위/갭)까지 가면 차별화 극대화(네이티브 플러그인).

## §4 이후

- **수익화**: 무료(기본+제한 AI) / 프리미엄 구독(무제한 AI·푸시·광고 제거). 인앱결제.
- **인증**: Apple 로그인 추가(iOS 필수), 기존 Google 유지.
- **비용·스케일**: OpenF1 폴링은 고정비. LLM 은 시청자 비례 → 캐싱·사용량 제한. Firestore 읽기
  모니터링.

## 수용 기준

1. `/manifest.webmanifest` 가 설치 가능한 매니페스트를 제공하고 아이콘이 로드된다.
2. 서비스 워커가 등록·활성화되고, /api 는 캐시하지 않으며 오프라인 시 셸이 뜬다.
3. 브랜딩은 전부 자리표시자로 격리돼 한곳에서 교체 가능하다.
4. Capacitor 설정·스크립트가 갖춰져 로컬에서 `cap add`→`sync`→`open` 으로 네이티브 프로젝트를
   만들 수 있다. server.url 로 호스팅 웹앱을 로드한다.
5. sw.js 에 push·notificationclick 핸들러가 있어 §3 에서 발신만 붙이면 된다.
