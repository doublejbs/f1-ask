import { RaceEvent, RaceEventPriority } from "@f1/domain";

// Critical 배너 노출 시간 창(밀리초). 클라이언트 시계 기준 최근 5분.
export const CRITICAL_BANNER_WINDOW_MS = 5 * 60 * 1000;

// allEvents 중 Critical 우선순위이면서 nowMs 기준 windowMs 이내인 최신 1건을 고른다.
// 클라이언트 시계 판정이므로 리플레이(과거 타임스탬프)에서는 null 일 수 있다(의도된 동작).
// 순수 함수 — 시간 소스는 인자로 주입받고 예외를 던지지 않는다.
export const selectRecentCriticalEvent = (
  events: readonly RaceEvent[],
  nowMs: number,
  windowMs: number = CRITICAL_BANNER_WINDOW_MS,
): RaceEvent | null => {
  let latest: RaceEvent | null = null;
  let latestMs = -Infinity;

  for (const event of events) {
    if (event.priority !== RaceEventPriority.Critical) {
      continue;
    }

    const eventMs = Date.parse(event.timestamp);

    if (Number.isNaN(eventMs)) {
      continue;
    }

    // windowMs 보다 오래된 이벤트는 제외한다(미래 타임스탬프는 "최근"으로 취급).
    if (eventMs < nowMs - windowMs) {
      continue;
    }

    if (eventMs > latestMs) {
      latest = event;
      latestMs = eventMs;
    }
  }

  return latest;
};
