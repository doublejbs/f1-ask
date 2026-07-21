import { describe, expect, it } from "vitest";
import {
  LATEST_EVENT_INDEX,
  resolveLatestEventCursorId,
  resolveLatestEventIndex,
} from "../src/LatestEventCursor";

// 최신순 목록. 새 이벤트는 항상 앞(index 0)에 붙는다.
const EVENT_IDS = ["e-5", "e-4", "e-3", "e-2", "e-1"];

describe("resolveLatestEventIndex", () => {
  it("커서가 null 이면 최신을 가리킨다", () => {
    expect(resolveLatestEventIndex(EVENT_IDS, null)).toBe(LATEST_EVENT_INDEX);
  });

  it("커서가 가리키는 이벤트의 인덱스를 돌려준다", () => {
    expect(resolveLatestEventIndex(EVENT_IDS, "e-3")).toBe(2);
  });

  it("목록이 앞에서 자라도 같은 이벤트에 머문다", () => {
    const grown = ["e-7", "e-6", ...EVENT_IDS];

    expect(resolveLatestEventIndex(EVENT_IDS, "e-3")).toBe(2);
    expect(resolveLatestEventIndex(grown, "e-3")).toBe(4);
  });

  it("커서가 null 이면 목록이 자랄 때 계속 최신을 따라간다", () => {
    const grown = ["e-6", ...EVENT_IDS];

    expect(resolveLatestEventIndex(grown, null)).toBe(LATEST_EVENT_INDEX);
    expect(grown[resolveLatestEventIndex(grown, null)]).toBe("e-6");
  });

  it("보던 이벤트가 창 밖으로 밀려나면 최신으로 되돌린다", () => {
    const shifted = ["e-7", "e-6", "e-5", "e-4", "e-3"];

    expect(resolveLatestEventIndex(shifted, "e-1")).toBe(LATEST_EVENT_INDEX);
  });

  it("빈 목록이면 최신 인덱스를 돌려준다", () => {
    expect(resolveLatestEventIndex([], "e-1")).toBe(LATEST_EVENT_INDEX);
    expect(resolveLatestEventIndex([], null)).toBe(LATEST_EVENT_INDEX);
  });
});

describe("resolveLatestEventCursorId", () => {
  it("최신으로 돌아오면 null 이 되어 최신 따라가기가 복구된다", () => {
    expect(resolveLatestEventCursorId(EVENT_IDS, 0)).toBeNull();
  });

  it("과거로 이동하면 해당 이벤트 id 를 커서로 삼는다", () => {
    expect(resolveLatestEventCursorId(EVENT_IDS, 3)).toBe("e-2");
  });

  it("범위를 벗어난 인덱스는 null 로 떨어뜨린다", () => {
    expect(resolveLatestEventCursorId(EVENT_IDS, EVENT_IDS.length)).toBeNull();
    expect(resolveLatestEventCursorId(EVENT_IDS, -1)).toBeNull();
    expect(resolveLatestEventCursorId([], 2)).toBeNull();
  });
});
