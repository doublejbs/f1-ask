# F1 AI Second Screen - Master Specification

This repository contains the complete specification for the F1 AI Second Screen project.

## Structure

- docs/: Functional and technical specifications
- prompts/: Claude Code implementation prompts
- diagrams/: Architecture and data flow diagrams

Recommended reading order:

1. docs/01-project-overview.md
2. docs/02-architecture.md
3. docs/03-firestore-and-auth.md
4. docs/04-worker-openf1.md
5. docs/05-llm.md
6. docs/06-ui-ux.md
7. docs/07-api-spec.md
8. docs/08-testing.md
9. docs/09-deployment.md

## 개발 실행 (MVP — Mock Mode)

pnpm workspace 기반 monorepo다.

```bash
pnpm install     # 의존성 설치
pnpm dev         # 웹 앱 개발 서버 (기본 http://localhost:3000, 첫 화면은 /en 으로 이동)
pnpm typecheck   # 전체 패키지 타입 검사
pnpm test        # 도메인/스키마 단위 테스트
pnpm build       # 웹 앱 프로덕션 빌드
```

기본 데이터 모드는 **Mock** 이라 외부 API(OpenF1)나 LLM, Firebase 설정 없이도
`/en`, `/ko`, `/ja` 라이브 대시보드가 결정론적 Mock 경기로 동작한다.

### 구조

```text
apps/web            # Next.js App Router 웹 앱 (Tailwind + shadcn/ui, i18n en/ko/ja)
packages/domain     # 핵심 도메인 타입 + 결정론적 Mock 경기 엔진 (외부 의존성 없음)
packages/schemas    # Zod 런타임 스키마 (snapshot / event / env)
firebase.json       # Firestore 규칙 + Emulator 구성
firestore.rules     # default-deny 보안 규칙
```

### 환경 변수

`apps/web/.env.local.example` 참고. Mock 모드에서는 값이 비어 있어도 된다.
`live`/`replay` 모드에서 Firestore 연동 시 `NEXT_PUBLIC_FIREBASE_*` 를 채운다.
Firebase Emulator 연결은 `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` 로 켠다
(`pnpm firebase:emulators`).
