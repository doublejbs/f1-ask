import { RaceEvent } from "../RaceEvent";

// 이벤트 쓰기 커서 (docs/16-poller-worker.md §쓰기 증폭 정리).
//
// 폴러는 6초마다 "원본 전체 + 현재 시각"으로 이벤트를 통째로 재계산한다. 계산 결과는
// 누적이라 폴링이 진행될수록 같은 이벤트가 계속 다시 나온다. 이것을 매번 그대로
// batch.set 하면 레이스 한 번에 수십만 쓰기가 된다 (폴링 900회 × 최대 840건 ≈ 54만).
//
// 그래서 "이미 쓴 deduplicationKey" 집합을 들고 다니며 **새로 생긴 것만** 쓴다.
// 함수는 1분마다 새로 기동되므로 메모리 집합은 인스턴스 간에 유지되지 않는다.
// 집합을 sessions/{id}/runtime/{doc} 에 직렬화해 다음 기동이 이어받는다.
//
// timestamp 고수위(high-water mark)만 쓰지 않는 이유:
// team_radio 와 session_result 는 실제 발생 시각보다 늦게 API 에 올라온다. 고수위
// 방식은 "이미 지나간 시각"의 이벤트를 영구히 버리므로 데이터가 조용히 누락된다.
// 키 집합은 순서와 무관하게 정확하고, 비용은 기동당 읽기 1 · 쓰기 1 에 불과하다.

// 커서 문서가 추적하는 키의 상한. 레이스 하나가 만드는 이벤트는 600~900건 수준이라
// 넉넉하지만, 예외 상황에서 문서가 Firestore 1MB 한도에 닿지 않도록 잘라 둔다.
// 넘치면 가장 오래된 키부터 버린다 — 오래된 이벤트는 어차피 다시 계산되지 않는다.
export const MAX_TRACKED_EVENT_KEYS = 5000;

export type EventWriteCursor = {
  // 이미 Firestore 에 쓴 deduplicationKey. 오래된 것부터 정렬해 둔다(잘라낼 때 기준).
  writtenKeys: string[];
};

export type UnwrittenEventSelection = {
  // 이번에 실제로 써야 하는 이벤트.
  events: RaceEvent[];
  // 쓰기 성공 후 저장할 다음 커서.
  nextCursor: EventWriteCursor;
};

export const EMPTY_EVENT_WRITE_CURSOR: EventWriteCursor = { writtenKeys: [] };

// 임의의 Firestore 문서 데이터를 커서로 복원한다. 문서가 없거나 형태가 깨졌으면
// 빈 커서로 시작한다 (최악의 경우 이벤트를 한 번 더 쓸 뿐, 멱등하므로 안전하다).
export const parseEventWriteCursor = (
  data: unknown,
): EventWriteCursor => {
  if (typeof data !== "object" || data === null) {
    return EMPTY_EVENT_WRITE_CURSOR;
  }

  const raw = (data as { writtenKeys?: unknown }).writtenKeys;

  if (!Array.isArray(raw)) {
    return EMPTY_EVENT_WRITE_CURSOR;
  }

  return {
    writtenKeys: raw.filter(
      (key): key is string => typeof key === "string" && key.length > 0,
    ),
  };
};

// 아직 쓰지 않은 이벤트만 골라낸다. 같은 호출 안에 중복 키가 있어도 한 번만 남긴다.
export const selectUnwrittenEvents = (
  events: readonly RaceEvent[],
  cursor: EventWriteCursor,
  maxTrackedKeys: number = MAX_TRACKED_EVENT_KEYS,
): UnwrittenEventSelection => {
  const seen = new Set(cursor.writtenKeys);
  const selected: RaceEvent[] = [];
  const addedKeys: string[] = [];

  // 오래된 것부터 쓰도록 발생 시각 순으로 정렬한다. 커서 배열의 순서도 이것을 따르므로
  // 상한을 넘겨 잘라낼 때 가장 오래된 키가 먼저 버려진다.
  const ordered = [...events].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  for (const event of ordered) {
    const key = event.deduplicationKey;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    selected.push(event);
    addedKeys.push(key);
  }

  const merged = [...cursor.writtenKeys, ...addedKeys];
  const overflow = Math.max(0, merged.length - maxTrackedKeys);

  return {
    events: selected,
    nextCursor: { writtenKeys: merged.slice(overflow) },
  };
};
