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

// 함수 최대 실행 시간. 폴링 창(60초) + OpenF1 응답 지연 여유.
// 리스 TTL(55초)보다 길어 좀비 리스가 남지 않는다.
export const FUNCTION_TIMEOUT_SECONDS = 120;

// Firestore·Auth 와 같은 리전 (docs/09-deployment.md).
export const FUNCTION_REGION = "asia-northeast3";

// 폴링 창 안에서 남은 시간이 이보다 적으면 다음 폴링을 시작하지 않는다.
// 타임아웃 도중에 잘려 커서 저장을 놓치는 것을 막는다.
export const POLL_DEADLINE_MARGIN_MS = 15_000;

// Firestore 배치 쓰기 상한.
export const MAX_BATCH_SIZE = 500;
