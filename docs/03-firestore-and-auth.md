# F1 AI Second Screen

> **Software Design Specification**  
> **Document 03 — Firestore and Authentication**  
> **Part 1 — Firebase Foundation, Authentication, and Data Ownership**

**Version:** 1.0  
**Status:** Draft  
**Related Documents:**

- `docs/01-product-requirements.md`
- `docs/02-architecture.md`

---

# 1. Document Purpose

이 문서는 F1 AI Second Screen의 Firebase Authentication, Cloud Firestore, 사용자 데이터, 공개 경기 데이터의 저장 구조와 접근 제어를 구체적으로 정의한다.

주요 목적은 다음과 같다.

- Firebase 프로젝트 초기 구성을 정의한다.
- 로그인과 비로그인 사용자의 동작 차이를 정의한다.
- 사용자 프로필 생성, 갱신, 탈퇴 lifecycle을 정의한다.
- 익명 로컬 설정과 로그인 계정 설정의 병합 정책을 정의한다.
- Firestore collection과 document의 책임 범위를 정의한다.
- 공개 데이터, 사용자 전용 데이터, 서버 전용 데이터를 구분한다.
- Security Rules 설계의 기준을 제공한다.
- Admin SDK repository의 접근 패턴을 정의한다.
- schema versioning, migration, TTL, retention의 기반을 정의한다.
- Emulator 기반 개발과 테스트 기준을 제공한다.

이 문서는 OpenF1 수집 및 이벤트 판단 알고리즘을 직접 정의하지 않는다.

관련 세부 사항은 다음 문서에서 다룬다.

- `docs/04-worker-openf1.md`
- `docs/05-event-engine.md`
- `docs/06-llm.md`
- `docs/07-api-spec.md`

---

# 2. Design Goals

Firestore와 Authentication 설계는 다음 목표를 만족해야 한다.

## 2.1 Public Live Access

라이브 경기 화면은 로그인을 요구하지 않는다.

비로그인 사용자도 다음 데이터를 읽을 수 있어야 한다.

- 공개 세션 메타데이터
- 현재 live snapshot
- 최근 RaceEvent
- 공개 AI commentary

로그인은 개인화와 사용량 관리에만 필요하다.

---

## 2.2 User Data Isolation

사용자는 자신의 데이터만 읽고 쓸 수 있어야 한다.

사용자 소유 데이터 예시:

- 프로필
- locale
- explanation level
- favorite drivers
- 알림 설정
- 질문 사용량 중 사용자에게 공개 가능한 일부 정보
- 향후 구독 상태의 사용자 표시 정보

클라이언트가 다른 사용자의 UID를 경로에 넣어 접근하더라도 Security Rules에서 거부되어야 한다.

---

## 2.3 Server-Authoritative Race Data

경기 관련 핵심 데이터는 서버만 작성한다.

클라이언트가 작성할 수 없는 데이터:

- session status
- live snapshot
- RaceEvent
- AI commentary
- Worker lease
- Worker runtime state
- rate-limit counter
- entitlement
- payment status

경기 데이터의 write authority는 Cloud Run Worker, Cloud Functions, 관리용 backend service account로 제한한다.

---

## 2.4 Low Read and Write Cost

Firestore 데이터 모델은 다음 비용 원칙을 따른다.

- 라이브 화면의 핵심 구독 문서를 최소화한다.
- 드라이버별 고빈도 listener를 만들지 않는다.
- 사용자 프로필을 과도하게 여러 문서로 나누지 않는다.
- 무제한 질문 기록을 기본 저장하지 않는다.
- 임시 cache와 rate-limit 데이터에는 TTL을 사용한다.
- 이벤트 목록은 limit과 pagination을 전제로 한다.

---

## 2.5 Explicit Schema Evolution

모든 장기 보존 문서에는 `schemaVersion`을 둔다.

서버와 클라이언트는 새로운 필드 추가에는 관대하게 대응하되, 필수 필드 의미 변경은 migration을 거쳐야 한다.

잘못된 방식:

```ts
// 기존 필드의 의미를 조용히 변경
positionChange: currentPosition - previousLapPosition;
```

권장 방식:

```ts
schemaVersion: 2;
startGridPositionChange: number | null;
previousSnapshotPositionChange: number | null;
```

---

# 3. Firebase Project Topology

환경별로 Firebase 프로젝트를 분리한다.

```text
f1-second-screen-dev
f1-second-screen-staging
f1-second-screen-prod
```

각 프로젝트는 독립된 다음 리소스를 가진다.

- Firebase Authentication tenant configuration
- Cloud Firestore database
- Cloud Functions
- App Check configuration
- Firebase Hosting or App Hosting configuration
- Secret references
- service accounts
- budget and alert configuration

개발 환경에서 production project ID를 fallback으로 사용하지 않는다.

---

## 3.1 Environment Mapping

환경 매핑은 repository에 명시적으로 관리한다.

예시 `.firebaserc`:

```json
{
  "projects": {
    "development": "f1-second-screen-dev",
    "staging": "f1-second-screen-staging",
    "production": "f1-second-screen-prod"
  }
}
```

배포 명령은 항상 project alias를 요구한다.

```bash
firebase deploy --project staging
```

`production` 배포는 CI approval 또는 별도 확인 절차를 거친다.

---

## 3.2 Firestore Database Mode

Cloud Firestore Native Mode를 사용한다.

이유:

- Firebase client SDK의 realtime listener 지원
- Security Rules 통합
- offline cache 지원
- Emulator Suite 지원
- 모바일과 웹의 동일한 데이터 접근 방식

Datastore Mode는 사용하지 않는다.

---

## 3.3 Database Location

Firestore 위치는 초기 사용자 지역과 compute region을 함께 고려해 선택한다.

원칙:

- Cloud Run Worker와 가까운 위치
- Cloud Functions와 가까운 위치
- 한국·일본 사용자 지연 최소화
- 제품별 region compatibility 확인
- 장기적으로 변경이 어렵다는 점 고려

Firestore database location은 프로젝트 생성 초기에 확정한다.

임시 개발 편의를 위해 production 위치를 성급하게 선택하지 않는다.

---

# 4. Firebase Client Initialization

Web과 Capacitor 앱은 동일한 Firebase client initialization module을 사용한다.

예시 구조:

```text
apps/web/src/firebase/
├── client.ts
├── auth.ts
├── firestore.ts
├── functions.ts
├── app-check.ts
└── emulator.ts
```

---

## 4.1 Singleton Initialization

Firebase App은 browser runtime에서 한 번만 초기화한다.

```ts
import { getApp, getApps, initializeApp } from "firebase/app";

export const firebaseApp =
  getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig);
```

Hot reload와 React Strict Mode에서 중복 초기화되지 않아야 한다.

---

## 4.2 Browser-Only Boundary

Firebase client SDK를 사용하는 모듈은 browser-only boundary를 명확히 한다.

Next.js Server Component에서 브라우저 전용 SDK를 직접 import하지 않는다.

```ts
"use client";

import { getAuth } from "firebase/auth";
```

서버 환경에서는 Firebase Admin SDK를 별도 모듈에서 사용한다.

---

## 4.3 Configuration Validation

public Firebase configuration도 시작 시 검증한다.

```ts
const publicFirebaseEnvSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
});
```

설정이 누락되면 빈 문자열로 초기화하지 않고 명확한 오류를 발생시킨다.

---

# 5. Firebase Admin Initialization

Admin SDK는 다음 런타임에서만 사용한다.

- Cloud Run Race Worker
- Cloud Functions
- 관리용 migration scripts
- CI integration test
- 로컬 Emulator seed script

브라우저 번들에는 포함하지 않는다.

---

## 5.1 Application Default Credentials

Google Cloud 환경에서는 Application Default Credentials를 사용한다.

```ts
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";

export const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: applicationDefault(),
      });
```

production에서 service account JSON 파일을 repository나 container image에 포함하지 않는다.

---

## 5.2 Local Development Credentials

로컬 개발은 가능한 한 Emulator를 사용한다.

실제 staging 접근이 필요한 경우에도 다음 원칙을 지킨다.

- 최소 권한 service account
- 개인별 credential 관리
- production 접근 금지 또는 제한
- credential 파일 `.gitignore`
- 만료와 rotation 관리

---

# 6. Authentication Model

인증 상태는 다음 세 단계로 구분한다.

```ts
type AuthenticationState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; uid: string };
```

`loading` 상태를 `anonymous`로 잘못 처리하지 않는다.

앱 시작 직후 인증 상태가 결정되기 전에 서버 preference를 덮어쓰는 문제를 방지해야 한다.

---

## 6.1 Supported Authentication Providers

MVP 후보 provider:

- Google
- Apple
- Email link
- Email and password

초기 출시 권장 우선순위:

1. Google
2. Apple
3. Email link

이메일 비밀번호 방식은 비밀번호 재설정, credential stuffing 방어, 사용자 지원 부담을 함께 고려해야 한다.

---

## 6.2 Web Sign-In Strategy

일반 web browser에서는 popup 또는 redirect를 사용할 수 있다.

권장 기준:

- desktop browser: popup 우선
- mobile browser: redirect fallback
- popup blocked: redirect fallback

인증 실패 시 provider의 원시 오류 메시지를 그대로 노출하지 않는다.

사용자용 오류 code로 변환한다.

```ts
type SignInErrorCode =
  | "popup_blocked"
  | "popup_closed"
  | "account_exists_with_different_credential"
  | "network_error"
  | "provider_disabled"
  | "unknown";
```

---

## 6.3 Capacitor Sign-In Strategy

Capacitor 환경에서는 웹 popup이 플랫폼별로 불안정할 수 있다.

구현 전 다음을 검증한다.

- iOS ASWebAuthenticationSession 호환성
- Android custom tab 또는 native provider plugin
- redirect deep link 처리
- Apple Sign In 요구사항
- web과 native account linking

네이티브 인증 plugin을 사용하더라도 최종적으로 Firebase credential로 연결하고 Firebase UID를 authoritative identity로 사용한다.

---

## 6.4 Anonymous Firebase Auth Decision

MVP 기본 설계에서는 비로그인 사용자를 Firebase Anonymous Auth 계정으로 자동 생성하지 않는다.

비로그인 사용자는 순수 client anonymous state로 처리한다.

이유:

- 불필요한 anonymous account 증가 방지
- 계정 linking 복잡도 감소
- 공개 경기 데이터는 인증 없이 읽을 수 있음
- localStorage만으로 기본 preference 유지 가능

향후 anonymous account 기반 server-side quota가 필요하면 별도 ADR을 통해 도입한다.

---

# 7. ID Token Trust Model

Firebase ID Token은 서버 API 인증의 기준이다.

클라이언트가 전달한 다음 값은 신뢰하지 않는다.

- UID 문자열
- email
- provider name
- admin 여부
- subscription tier

서버는 검증된 token claim만 사용한다.

```ts
const decoded = await getAuth().verifyIdToken(idToken, true);
const uid = decoded.uid;
```

보안 민감 API는 revoked token 검사를 활성화한다.

---

## 7.1 Callable Functions

Callable Function을 사용하는 경우 Firebase SDK가 ID Token과 App Check token을 자동으로 첨부할 수 있다.

서버는 `request.auth`를 기준으로 사용자를 식별한다.

```ts
if (!request.auth) {
  throw new HttpsError("unauthenticated", "Authentication required");
}

const uid = request.auth.uid;
```

request payload의 `uid`는 사용하지 않는다.

---

## 7.2 HTTP Functions and Next.js Server APIs

HTTP API에서는 `Authorization: Bearer <ID_TOKEN>` 형식을 사용한다.

검증 흐름:

```text
Read Authorization header
  ↓
Validate Bearer format
  ↓
Verify Firebase ID Token
  ↓
Check revoked token when required
  ↓
Use decoded UID
```

인증 middleware는 각 endpoint에 중복 구현하지 않고 공유한다.

---

# 8. User Profile Lifecycle

사용자 프로필 문서 경로:

```text
users/{uid}
```

프로필은 Firebase Auth user record와 동일하지 않다.

Firebase Auth가 관리하는 항목:

- UID
- provider identities
- verified email 여부
- 계정 disabled 상태
- token lifecycle

Firestore profile이 관리하는 항목:

- locale
- explanation level
- onboarding 상태
- 사용자 표시 설정
- 서비스 정책 동의 metadata
- 생성 및 갱신 시각

---

## 8.1 User Profile Schema

```ts
type SupportedLocale = "en" | "ko" | "ja";

type ExplanationLevel =
  | "beginner"
  | "standard"
  | "expert";

type UserProfileDocument = {
  schemaVersion: number;
  uid: string;

  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;

  onboarding: {
    completed: boolean;
    completedAt: string | null;
    version: number;
  };

  preferences: {
    showSpoilers: boolean;
    compactStandings: boolean;
    hapticsEnabled: boolean;
  };

  consent: {
    termsVersion: string | null;
    privacyVersion: string | null;
    acceptedAt: string | null;
  };

  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
};
```

---

## 8.2 Profile Provisioning

최초 로그인 후 `ensureUserProfile`을 실행한다.

```text
Auth state becomes authenticated
  ↓
Read users/{uid}
  ├─ Exists → validate and load
  └─ Missing → create default profile
```

프로필 생성은 idempotent해야 한다.

권장 구현은 transaction 또는 create-only operation이다.

동시에 여러 탭에서 로그인하더라도 프로필이 중복 생성되거나 일부 필드가 소실되면 안 된다.

---

## 8.3 Default Profile Values

초기값 결정 순서:

### Locale

1. 로그인 전 local preference
2. device 또는 browser locale
3. 영어

### Explanation Level

1. 로그인 전 local preference
2. `standard`

### Other Preferences

안전하고 일반적인 기본값을 사용한다.

```ts
const defaultPreferences = {
  showSpoilers: true,
  compactStandings: false,
  hapticsEnabled: true,
};
```

---

## 8.4 Profile Update Policy

클라이언트가 수정할 수 있는 필드를 allowlist로 제한한다.

허용 예시:

- locale
- explanationLevel
- onboarding
- preferences
- consent의 사용자 동의 정보

허용하지 않는 예시:

- uid 변경
- createdAt 변경
- subscription tier
- rate limit
- role
- admin claim
- billing status

Security Rules에서 문서 전체 write를 허용하는 대신 변경된 필드를 검증해야 한다.

---

## 8.5 Last Seen Updates

`lastSeenAt`을 화면 이동마다 갱신하지 않는다.

과도한 write 방지를 위해 다음 중 하나를 사용한다.

- 하루 1회 갱신
- 로그인 세션 시작 시 갱신
- 서버 API 사용 시 제한적으로 갱신
- analytics로 대체하고 Firestore에는 저장하지 않음

MVP에서는 `lastSeenAt`을 필수 필드로 사용하지 않는다.

---

# 9. Account Linking

동일 이메일이 여러 provider에서 사용될 수 있다.

예:

- Google 로그인
- Apple 로그인
- Email link 로그인

Firebase의 `account-exists-with-different-credential` 상황을 처리해야 한다.

흐름:

```text
Sign-in attempt
  ↓
Credential conflict detected
  ↓
Ask user to sign in with existing provider
  ↓
Authenticate existing account
  ↓
Link pending credential
```

새 UID를 만들어 사용자 데이터를 분리하지 않는다.

---

# 10. Sign-Out Lifecycle

로그아웃 시 다음을 수행한다.

```text
1. Stop private Firestore listeners
2. Clear in-memory private user data
3. Preserve allowed local preferences
4. Sign out from Firebase Auth
5. Switch UI to anonymous state
6. Continue public live listeners
```

로그아웃 시 다음 데이터는 localStorage에 유지할 수 있다.

- locale
- favorite drivers
- explanation level
- onboarding UI 여부

다음 데이터는 제거해야 한다.

- cached private question history
- entitlement 정보
- private notification settings
- user-specific API response cache

---

# 11. Account Deletion Lifecycle

사용자 탈퇴는 단순 Firebase Auth 삭제만으로 끝나지 않는다.

삭제 대상:

- Firebase Auth account
- `users/{uid}`
- favorite driver documents
- notification settings
- 개인 질문 기록이 있다면 해당 기록
- 사용자별 usage 문서 중 보존 의무가 없는 데이터
- 향후 billing customer mapping

---

## 11.1 Deletion Flow

```text
User requests account deletion
  ↓
Recent authentication check
  ↓
Create deletion job
  ↓
Disable or mark account pending deletion
  ↓
Delete user-owned Firestore data
  ↓
Revoke tokens
  ↓
Delete Firebase Auth account
  ↓
Write minimal audit record when legally required
```

클라이언트가 batch delete를 직접 수행하지 않는다.

서버 Function이 privileged deletion을 수행한다.

---

## 11.2 Reauthentication

계정 삭제는 민감 작업이므로 recent login을 요구할 수 있다.

필요한 경우 provider 재인증을 수행한다.

오래된 ID Token만으로 계정 삭제를 허용하지 않는다.

---

# 12. Anonymous Preference Storage

비로그인 사용자의 설정은 localStorage에 저장한다.

권장 key namespace:

```text
f1-second-screen:user-preferences:v1
f1-second-screen:favorite-drivers:v1
f1-second-screen:onboarding:v1
```

각 값은 runtime schema로 검증한다.

localStorage가 변조되거나 오래된 schema일 수 있기 때문이다.

---

## 12.1 Local Preference Schema

```ts
type LocalUserPreferences = {
  schemaVersion: 1;
  locale: SupportedLocale;
  explanationLevel: ExplanationLevel;
  favoriteDriverNumbers: number[];
  onboardingCompleted: boolean;
  updatedAt: string;
};
```

허용되지 않는 driver number, locale, 과도한 배열 길이는 정리한다.

---

## 12.2 Storage Failure

private browsing, storage quota, webview 정책으로 localStorage 쓰기가 실패할 수 있다.

저장 실패가 앱 전체 오류로 이어지면 안 된다.

```ts
try {
  localStorage.setItem(key, JSON.stringify(value));
} catch {
  // Keep in-memory state and report non-fatal telemetry.
}
```

---

# 13. Login Preference Merge

로그인 시 로컬 preference와 서버 preference를 병합한다.

병합은 데이터 종류별 정책을 명시한다.

---

## 13.1 Merge Policy Table

| 데이터 | 서버 존재 | 서버 없음 | 기본 정책 |
|---|---|---|---|
| locale | 서버 우선 | 로컬 업로드 | 서버 우선 |
| explanation level | 서버 우선 | 로컬 업로드 | 서버 우선 |
| favorite drivers | 서버 값이 비어 있지 않으면 서버 우선 | 로컬 업로드 | 서버 우선 |
| onboarding completed | true가 하나라도 있으면 true | 로컬 업로드 | 완료 상태 보존 |
| UI-only preference | 최신 updatedAt 비교 가능 | 로컬 업로드 | 필드별 정책 |

모든 필드에 단순 last-write-wins를 사용하지 않는다.

기기 시간이 부정확할 수 있기 때문이다.

---

## 13.2 Merge Flow

```text
Auth confirmed
  ↓
Read local preferences
  ↓
Read users/{uid}
  ↓
Read favoriteDrivers
  ↓
Apply deterministic merge policy
  ↓
Write missing server values
  ↓
Update local cache from merged result
  ↓
Start authenticated listeners
```

merge 완료 전 임시 UI 상태를 유지하되, 빈 기본값으로 서버 데이터를 덮어쓰지 않는다.

---

## 13.3 Idempotency

동일 사용자가 로그인 flow를 여러 번 실행해도 결과가 달라지지 않아야 한다.

```ts
merge(merge(server, local), local) === merge(server, local)
```

로그인 merge 로직은 unit test 대상으로 포함한다.

---

# 14. Data Ownership Boundaries

Firestore 데이터는 다음 세 ownership class로 구분한다.

## 14.1 Public Server-Owned

누구나 읽을 수 있지만 서버만 쓸 수 있다.

```text
sessions/{sessionId}
sessions/{sessionId}/live/current
sessions/{sessionId}/events/{eventId}
sessions/{sessionId}/aiCommentary/{commentaryId}
```

---

## 14.2 Private User-Owned

인증된 해당 사용자만 읽고 제한적으로 쓸 수 있다.

```text
users/{uid}
users/{uid}/favoriteDrivers/{favoriteId}
users/{uid}/notificationSettings/{settingId}
```

---

## 14.3 Server-Only Internal

클라이언트 읽기와 쓰기를 모두 차단한다.

```text
workerLeases/{sessionId}
sessions/{sessionId}/runtime/state
rateLimits/{rateLimitKey}
aiCache/{cacheKey}
adminAuditLogs/{auditId}
```

민감한 내부 collection은 이름만 숨기는 것으로 보호하지 않는다.

Security Rules에서 명시적으로 거부한다.

---

# 15. Initial Collection Map

권장 collection 구조:

```text
sessions/{sessionId}
├── live/current
├── events/{eventId}
├── aiCommentary/{commentaryId}
└── runtime/state

users/{uid}
├── favoriteDrivers/{favoriteId}
├── notificationSettings/{settingId}
└── questions/{questionId}          # optional

workerLeases/{sessionId}
rateLimits/{rateLimitKey}
aiCache/{cacheKey}
featureFlags/{flagId}
adminAuditLogs/{auditId}
```

`questions` 저장은 개인정보와 비용 정책 확정 후 활성화한다.

MVP 기본값은 질문 원문 비저장 또는 제한적 단기 저장이다.

---

# 16. Document ID Strategy

문서 ID는 데이터 특성에 따라 선택한다.

## Deterministic IDs

중복 방지가 중요한 문서:

- session
- live/current
- RaceEvent
- Worker lease
- favorite driver
- AI cache
- rate limit

예시:

```text
sessionId = 2026-japan-race
favoriteId = 2026_4
raceEventId = sha256(deduplicationKey)
```

## Auto IDs

순차적으로 추가되고 중복 판단이 별도인 문서:

- audit logs
- optional user question history
- migration job records

다만 auto ID를 사용하더라도 idempotency key가 필요한 작업은 별도 필드로 둔다.

---

# 17. Timestamp Policy

서버가 저장하는 authoritative timestamp는 server timestamp를 사용한다.

```ts
updatedAt: FieldValue.serverTimestamp()
```

외부 데이터 기준 시각과 Firestore 저장 시각을 구분한다.

```ts
type TimingFields = {
  sourceUpdatedAt: string;
  generatedAt: string;
  persistedAt: FirebaseFirestore.Timestamp;
};
```

클라이언트 시각을 `createdAt`의 authoritative 값으로 사용하지 않는다.

---

# 18. Null, Missing, and Delete Semantics

Firestore schema에서 `null`, 필드 없음, 삭제를 구분한다.

원칙:

- unknown이 의미 있는 값이면 `null`
- optional feature라 문서 버전에 따라 없을 수 있으면 optional field
- 사용자가 값을 제거하면 field delete 또는 명시적 `null` 정책 선택
- 배열 내부에는 undefined를 사용하지 않음

예:

```ts
favoriteDriverNumber: null; // 사용자가 선택하지 않음
```

```ts
trialEndsAt?: Timestamp; // 해당 기능이 아직 도입되지 않은 schema일 수 있음
```

---

# 19. Runtime Schema Validation

TypeScript type만으로 Firestore 데이터 안전성을 보장할 수 없다.

모든 주요 문서는 Zod 등 runtime schema로 검증한다.

```ts
const userProfileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  uid: z.string().min(1),
  locale: z.enum(["en", "ko", "ja"]),
  explanationLevel: z.enum(["beginner", "standard", "expert"]),
  onboarding: z.object({
    completed: z.boolean(),
    completedAt: z.string().datetime().nullable(),
    version: z.number().int().nonnegative(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

Firestore Timestamp를 domain ISO string으로 변환하는 mapper를 repository boundary에 둔다.

---

# 20. Repository Boundary

애플리케이션 코드가 Firestore SDK 호출을 여러 feature에 직접 흩뿌리지 않도록 repository 계층을 둔다.

```ts
interface UserProfileRepository {
  get(uid: string): Promise<UserProfile | null>;
  createIfMissing(uid: string, defaults: UserProfileDefaults): Promise<UserProfile>;
  updatePreferences(uid: string, patch: UserPreferencePatch): Promise<void>;
  deleteUserData(uid: string): Promise<void>;
}
```

```ts
interface FavoriteDriverRepository {
  list(uid: string): Promise<FavoriteDriver[]>;
  save(uid: string, favorite: FavoriteDriver): Promise<void>;
  remove(uid: string, favoriteId: string): Promise<void>;
}
```

클라이언트 repository와 Admin repository는 구현을 분리할 수 있다.

---

# 21. Client Write Principles

클라이언트 write는 다음 기준을 따른다.

- 사용자 체감상 즉시 반영이 필요한 preference만 optimistic update
- 실패 시 rollback 또는 retry 상태 표시
- 경기 데이터에는 optimistic write 금지
- write payload는 전체 문서보다 제한된 patch 우선
- schema에서 허용한 필드만 전송
- 중복 클릭에 안전한 deterministic document ID 사용

예:

```ts
await setDoc(
  favoriteRef,
  {
    schemaVersion: 1,
    driverNumber,
    season,
    updatedAt: serverTimestamp(),
  },
  { merge: true },
);
```

---

# 22. Offline Persistence

Firestore offline persistence 사용 여부는 플랫폼별로 검증한다.

장점:

- 네트워크 단절 시 마지막 데이터 표시
- 재접속 시 자연스러운 동기화

주의점:

- stale data를 live로 오인할 수 있음
- 로그아웃 후 private cache 처리
- 여러 탭 persistence ownership
- Capacitor webview의 저장 정책

UI는 Firestore cache 존재 여부가 아니라 `sourceUpdatedAt`으로 freshness를 판단한다.

---

# 23. Security Rules Design Principles

상세 Rules는 이후 Part에서 정의하지만 기본 원칙은 다음과 같다.

1. Default deny
2. Public read path 명시
3. User path는 UID 일치 검증
4. Server-owned path는 client write 거부
5. 허용 필드와 타입 검증
6. immutable field 변경 거부
7. collection group query 고려
8. Rules unit test 필수

기본 골격:

```text
match /{document=**} {
  allow read, write: if false;
}
```

그 위에 필요한 path만 예외적으로 연다.

---

# 24. App Check Foundation

App Check는 인증을 대체하지 않는다.

역할:

- 허가되지 않은 client에서 Firebase 리소스 남용 감소
- API 자동화 abuse 완화
- 정식 web/app build 식별 보조

적용 대상:

- Firestore
- Callable Functions
- Storage를 도입할 경우 Storage

단계적 rollout:

```text
Development: debug provider
Staging: metrics and non-enforced validation
Production phase 1: monitor
Production phase 2: enforce on sensitive APIs
```

App Check failure 때문에 공개 live 화면 전체가 갑자기 중단되지 않도록 rollout을 관찰한다.

---

# 25. Audit and Sensitive Changes

다음 변경은 사용자 일반 write와 분리한다.

- role 변경
- subscription entitlement 변경
- account deletion
- data export
- production migration
- admin override
- feature flag 변경

필요한 경우 `adminAuditLogs`에 다음을 기록한다.

```ts
type AdminAuditLog = {
  schemaVersion: number;
  action: string;
  actorUid?: string;
  actorServiceAccount?: string;
  targetType: string;
  targetId: string;
  reason?: string;
  environment: "staging" | "production";
  createdAt: string;
};
```

사용자 질문 원문이나 LLM prompt 전체를 audit log에 저장하지 않는다.

---

# 26. Privacy Data Classification

Firestore 필드는 다음 등급으로 분류한다.

## Public

- session metadata
- driver public data
- public events
- public commentary

## User Private

- locale
- favorite drivers
- explanation level
- notification settings
- optional question history

## Sensitive Internal

- entitlement
- rate-limit counters
- deletion jobs
- billing mapping
- admin audit

## Prohibited or Avoided

MVP에서 저장하지 않는 것을 기본으로 한다.

- 정확한 위치 정보
- 연락처 목록
- 광고 식별자
- 불필요한 생년월일
- 전체 IP address 장기 저장
- 원본 질문과 LLM prompt의 무기한 보관

---

# 27. Emulator Foundation

로컬 개발은 다음 emulator를 사용한다.

- Auth Emulator
- Firestore Emulator
- Functions Emulator
- Hosting Emulator

권장 명령:

```bash
pnpm firebase:emulators
pnpm firebase:seed
pnpm test:rules
```

Emulator seed는 반복 실행 가능해야 한다.

---

## 27.1 Test Users

개발용 사용자 예시:

```text
viewer@example.test
expert@example.test
admin@example.test
```

production에서 사용되는 실제 이메일을 seed에 넣지 않는다.

각 test user에는 고정 UID를 사용해 fixture와 Rules test를 안정적으로 만든다.

---

# 28. Part 1 Implementation Checklist

## Firebase Foundation

- [ ] dev, staging, production 프로젝트가 분리되어 있다.
- [ ] `.firebaserc` alias가 설정되어 있다.
- [ ] Firebase client singleton이 구현되어 있다.
- [ ] Admin SDK가 server-only module에 격리되어 있다.
- [ ] environment schema validation이 있다.
- [ ] Emulator 연결은 development에서만 활성화된다.

## Authentication

- [ ] authentication loading 상태가 anonymous와 구분된다.
- [ ] Google provider flow가 구현되어 있다.
- [ ] Apple provider 도입 경로가 정의되어 있다.
- [ ] popup과 redirect fallback이 있다.
- [ ] server API가 ID Token을 검증한다.
- [ ] request payload UID를 신뢰하지 않는다.
- [ ] logout 시 private listener와 cache를 정리한다.
- [ ] account linking 오류를 처리한다.
- [ ] account deletion이 server-side workflow로 정의되어 있다.

## User Preferences

- [ ] local preference schema가 있다.
- [ ] localStorage 실패가 non-fatal로 처리된다.
- [ ] 로그인 merge policy가 데이터별로 정의되어 있다.
- [ ] merge가 idempotent하다.
- [ ] 빈 default 값이 기존 서버 값을 덮어쓰지 않는다.

## Data Ownership

- [ ] public server-owned path가 구분되어 있다.
- [ ] private user-owned path가 구분되어 있다.
- [ ] server-only internal path가 구분되어 있다.
- [ ] 문서 ID와 timestamp 정책이 정의되어 있다.
- [ ] runtime schema validation이 있다.
- [ ] repository boundary가 정의되어 있다.

---

# 29. Part 1 Completion Criteria

이 Part가 완료되면 구현자는 다음을 이해할 수 있어야 한다.

- 환경별 Firebase 프로젝트를 분리하는 이유와 방법
- Firebase Client SDK와 Admin SDK의 런타임 경계
- Firebase Auth 상태에서 loading과 anonymous를 구분해야 하는 이유
- Web과 Capacitor에서 provider login을 처리하는 기본 전략
- 서버가 Firebase ID Token을 검증하고 UID를 결정하는 방식
- 사용자 프로필과 Firebase Auth user record의 역할 차이
- 최초 로그인 시 프로필을 idempotent하게 생성하는 방식
- 로그인, 로그아웃, 계정 연결, 계정 삭제 lifecycle
- 비로그인 preference를 localStorage에 저장하는 방식
- 로그인 시 로컬 데이터와 서버 데이터를 병합하는 정책
- public, private, server-only Firestore 데이터의 경계
- deterministic document ID와 server timestamp를 사용하는 이유
- runtime schema validation과 repository 계층의 필요성
- App Check, audit, privacy classification의 기본 방향
- Emulator 기반 개발과 테스트의 출발점

---

# Next Part

## Part 2 — Firestore Collection and Document Schemas

다음 내용을 정의한다.

- `sessions/{sessionId}` schema
- `live/current` snapshot contract
- RaceEvent document schema
- AI commentary document schema
- user profile schema 상세
- favorite driver schema
- notification settings schema
- usage and rate-limit schema
- Worker lease와 runtime state schema
- AI cache schema
- document size budget
- field naming and serialization rules
- read and write access matrix
