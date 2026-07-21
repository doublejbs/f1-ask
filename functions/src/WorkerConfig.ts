import {
  CommentaryVariant,
  LLM_REQUEST_TIMEOUT_MS,
  parseCommentaryVariants,
  WORKER_LEASE_TTL_MS,
} from "@f1/domain";

// 폴러 워커 실행 상수 (docs/16-poller-worker.md §스케줄 설계).
//
// Cloud Functions 는 무한 루프를 돌 수 없다. 1분마다 깨어나 6초 간격으로 폴링하고
// 종료한다. 아래 값들이 그 창을 정의한다.

// 클라이언트가 구독하는 고정 세션 경로. apps/web 의 NEXT_PUBLIC_LIVE_SESSION_ID 와 같아야 한다.
export const LIVE_SESSION_ID = "openf1-live";

// Cloud Scheduler 기동 간격.
export const SCHEDULE_CRON = "* * * * *";

// 폴링 간격과 1회 기동당 폴링 횟수. 6초 × 10회 = 약 60초로 스케줄 간격을 채운다.
export const POLL_INTERVAL_MS = 6000;
export const POLL_ITERATIONS = 10;

// 함수 최대 실행 시간. 폴링 창(약 60초) + 해설 단계(최대 36초) + 마무리 쓰기.
// 리스 TTL(100초)보다 길어 좀비 리스가 남지 않는다 (WorkerLease.ts 의 계산 참고).
export const FUNCTION_TIMEOUT_SECONDS = 120;

// Firestore·Auth 와 같은 리전 (docs/09-deployment.md).
export const FUNCTION_REGION = "asia-northeast3";

// 폴링 창 안에서 남은 시간이 이보다 적으면 다음 폴링을 시작하지 않는다.
// 타임아웃 도중에 잘려 커서 저장을 놓치는 것을 막는다.
export const POLL_DEADLINE_MARGIN_MS = 15_000;

// Firestore 배치 쓰기 상한.
export const MAX_BATCH_SIZE = 500;

// ── AI 해설 (docs/18-ai-commentary-worker.md) ──

// 생성할 해설 변형. `"ko:standard,en:beginner"` 형식이다.
// 기본값은 ko × standard 한 조합 — 변형 하나당 이벤트마다 호출·저장이 곱해지므로
// Gemini 무료 티어 한도와 지출 상한($5) 안에서 검증한다. 코드 수정 없이 이 변수로 늘린다.
export const COMMENTARY_VARIANTS_ENV = "COMMENTARY_VARIANTS";

export const resolveCommentaryVariants = (): CommentaryVariant[] =>
  parseCommentaryVariants(process.env[COMMENTARY_VARIANTS_ENV]);

// 해설 생성이 함수 타임아웃도 리스 TTL 도 먹지 않도록 세 겹으로 막는다.
//
// 폴링 창은 6초 × 10회 ≈ 60초이고 함수 타임아웃은 120초다. 폴링이 끝난 뒤 남는
// 약 60초가 해설의 몫인데, 그 끝까지 다 쓰면 러닝 컨텍스트와 이벤트 커서 쓰기가
// 타임아웃에 잘린다. 커서가 날아가면 다음 기동이 이벤트를 통째로 다시 쓴다.
//
//   1. DEADLINE_MARGIN — 마감 전 이만큼은 남긴다(커서 2건 쓰기 + 종료 여유).
//   2. CALL_BUDGET     — LLM 호출 1회의 최악 소요. 이만큼 여유가 없으면 시작하지 않는다.
//   3. PHASE_END       — 기동 시작 기준 해설 단계의 절대 마감. 리스 TTL 에서 끌어온다.
//
// 즉 마지막 호출은 아무리 늦어도 (타임아웃 - 20초) 전에 시작되고, 그 호출이 최악으로
// 12초를 써도 8초가 남는다. 남긴 이벤트는 다음 기동이 러닝 컨텍스트로 이어받는다.
export const COMMENTARY_DEADLINE_MARGIN_MS = 20_000;

// 호출 1회의 최악 소요 = provider 의 요청 타임아웃. 예산과 타임아웃이 **한 출처**여야
// 예산이 가정이 아니라 계약이 된다. 두 상수를 따로 두면 다음 사람이 한쪽만 고친다.
// (packages/domain/src/ai/LlmRequestTimeout.ts)
export const COMMENTARY_CALL_BUDGET_MS = LLM_REQUEST_TIMEOUT_MS;

// 해설 단계는 리스가 살아 있는 동안 끝나야 한다. 넘기면 다음 기동이 만료된 리스를 잡아
// 아직 살아 있는 인스턴스와 겹친다(커서 이중 쓰기 · 중복 LLM 호출).
// 마무리 쓰기 몫을 TTL 에서 덜어 낸 값이 해설 단계의 절대 마감이다.
const LEASE_WRITE_TAIL_MS = 4_000;

export const COMMENTARY_PHASE_END_MS =
  WORKER_LEASE_TTL_MS - LEASE_WRITE_TAIL_MS;
