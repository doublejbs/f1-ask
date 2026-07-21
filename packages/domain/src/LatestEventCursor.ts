// 고정 이벤트 영역은 한 번에 1건만 보여주고 위/아래로 넘겨 본다. 목록은 6초마다
// **앞에서** 자라므로(최신순) 커서를 인덱스로 들고 있으면 새 이벤트가 올 때마다
// 보던 항목이 아래로 밀린다. 그래서 커서는 항상 **이벤트 id** 로 들고,
// 화면에 그릴 때만 인덱스로 푼다.
//
// 커서의 두 상태:
//   - `null`   → "최신 따라가기". 새 이벤트가 오면 그대로 최신(0번)을 가리킨다.
//   - 이벤트 id → 사용자가 되짚어 보는 중. 목록이 자라도 같은 이벤트에 머문다.
//
// 아래 두 함수는 순수 함수다 — 시간·전역 상태를 읽지 않고 예외를 던지지 않는다.

// 최신 항목의 인덱스. 목록이 최신순이므로 언제나 0이다.
export const LATEST_EVENT_INDEX = 0;

// 커서 id 를 현재 목록에서의 인덱스로 푼다.
//
// 커서가 `null` 이거나 가리키던 이벤트가 창 밖으로 밀려 사라졌으면 최신으로 되돌린다.
// 목록이 비었을 때도 0을 돌려주므로 호출부가 빈 목록을 먼저 걸러야 한다.
export const resolveLatestEventIndex = (
  eventIds: readonly string[],
  cursorEventId: string | null,
): number => {
  if (cursorEventId === null) {
    return LATEST_EVENT_INDEX;
  }

  const index = eventIds.indexOf(cursorEventId);

  if (index < 0) {
    // 보던 이벤트가 목록에서 사라졌다 — 최신으로 되돌린다.
    return LATEST_EVENT_INDEX;
  }

  return index;
};

// 사용자가 `targetIndex` 로 이동했을 때 저장할 커서 id 를 고른다.
//
// 최신(0번)으로 돌아오면 `null` 을 돌려 "최신 따라가기" 상태로 복귀시킨다.
// 범위를 벗어난 인덱스도 `null` 로 떨어뜨려 커서가 미아가 되지 않게 한다.
export const resolveLatestEventCursorId = (
  eventIds: readonly string[],
  targetIndex: number,
): string | null => {
  if (targetIndex <= LATEST_EVENT_INDEX) {
    return null;
  }

  return eventIds[targetIndex] ?? null;
};
