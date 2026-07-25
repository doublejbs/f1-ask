import { describe, expect, it } from "vitest";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import {
  DEFAULT_DRIVER_EVENT_LIMIT,
  queryDriverEvents,
} from "../src/ai/QueryDriverEvents";
import { loadBelgianGpSessionData } from "./fixtures/BelgianGpFixture";
import { buildOpenF1LiveFrame } from "../src/openf1/OpenF1Recording";

// 테스트 이벤트 합성 헬퍼. 조회에 안 쓰는 필드는 아무 값이나 채운다.
const makeEvent = (overrides: Partial<RaceEvent>): RaceEvent => ({
  schemaVersion: 1,
  id: overrides.id ?? "id",
  sessionId: "session",
  type: overrides.type ?? RaceEventType.PitStop,
  priority: RaceEventPriority.Medium,
  timestamp: overrides.timestamp ?? "2026-07-19T13:00:00.000Z",
  params: overrides.params ?? {},
  deduplicationKey: overrides.deduplicationKey ?? "dedup",
  ...overrides,
});

describe("queryDriverEvents — 드라이버 필터", () => {
  it("driverNumber 로 그 드라이버 이벤트만 남긴다", () => {
    const events = [
      makeEvent({ id: "a", driverNumber: 1, lapNumber: 5 }),
      makeEvent({ id: "b", driverNumber: 44, lapNumber: 6 }),
    ];

    const result = queryDriverEvents(events, { driverNumber: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.driverNumber).toBe(1);
  });

  it("targetDriverNumber 가 일치해도 포함한다 — 당한 쪽도 잡는다", () => {
    const events = [
      makeEvent({ id: "a", driverNumber: 44, targetDriverNumber: 1, lapNumber: 5 }),
      makeEvent({ id: "b", driverNumber: 16, lapNumber: 6 }),
    ];

    const result = queryDriverEvents(events, { driverNumber: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.targetDriverNumber).toBe(1);
  });

  it("driverNumber 미지정이면 전 드라이버를 통과시킨다", () => {
    const events = [
      makeEvent({ id: "a", driverNumber: 1, lapNumber: 5 }),
      makeEvent({ id: "b", driverNumber: 44, lapNumber: 6 }),
    ];

    const result = queryDriverEvents(events, {});

    expect(result).toHaveLength(2);
  });
});

describe("queryDriverEvents — 타입 필터", () => {
  it("단일 타입만 남긴다", () => {
    const events = [
      makeEvent({ id: "a", type: RaceEventType.PitStop, lapNumber: 5 }),
      makeEvent({ id: "b", type: RaceEventType.Investigation, lapNumber: 6 }),
    ];

    const result = queryDriverEvents(events, { types: [RaceEventType.PitStop] });

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe(RaceEventType.PitStop);
  });

  it("복수 타입을 지정하면 그중 아무거나 남긴다", () => {
    const events = [
      makeEvent({ id: "a", type: RaceEventType.PitStop, lapNumber: 5 }),
      makeEvent({ id: "b", type: RaceEventType.Investigation, lapNumber: 6 }),
      makeEvent({ id: "c", type: RaceEventType.StrategyNote, lapNumber: 7 }),
    ];

    const result = queryDriverEvents(events, {
      types: [RaceEventType.PitStop, RaceEventType.Investigation],
    });

    expect(result.map((row) => row.type)).toEqual([
      RaceEventType.PitStop,
      RaceEventType.Investigation,
    ]);
  });
});

describe("queryDriverEvents — 랩 범위 안전 처리", () => {
  it("lapFrom/lapTo 범위 안의 이벤트만 남긴다 (경계 포함)", () => {
    const events = [
      makeEvent({ id: "a", type: RaceEventType.PitStop, lapNumber: 3 }),
      makeEvent({ id: "b", type: RaceEventType.PitStop, lapNumber: 10 }),
      makeEvent({ id: "c", type: RaceEventType.PitStop, lapNumber: 17 }),
    ];

    const result = queryDriverEvents(events, { lapFrom: 10, lapTo: 17 });

    expect(result.map((row) => row.lapNumber)).toEqual([10, 17]);
  });

  it("랩 없는 타입(overtake)은 랩 범위 질의에서 제외된다", () => {
    const events = [
      makeEvent({ id: "pit", type: RaceEventType.PitStop, lapNumber: 12 }),
      // 추월 합성 — lapNumber 없음(관찰: overtake 는 lap 미기록)
      makeEvent({ id: "ovt", type: RaceEventType.Overtake, driverNumber: 1 }),
    ];

    const result = queryDriverEvents(events, { lapFrom: 10, lapTo: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe(RaceEventType.PitStop);
  });

  it("랩 범위를 지정 안 하면 랩 없는 이벤트도 통과한다", () => {
    const events = [
      makeEvent({ id: "ovt", type: RaceEventType.Overtake, driverNumber: 1 }),
    ];

    const result = queryDriverEvents(events, { driverNumber: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]?.lapNumber).toBeNull();
  });

  it("lapFrom 만 지정해도 랩 없는 이벤트는 제외된다", () => {
    const events = [
      makeEvent({ id: "pit", type: RaceEventType.PitStop, lapNumber: 30 }),
      makeEvent({ id: "ovt", type: RaceEventType.Overtake }),
    ];

    const result = queryDriverEvents(events, { lapFrom: 5 });

    expect(result.map((row) => row.type)).toEqual([RaceEventType.PitStop]);
  });
});

describe("queryDriverEvents — 정렬 결정론", () => {
  it("lapNumber 오름차순으로 정렬한다", () => {
    const events = [
      makeEvent({ id: "a", type: RaceEventType.PitStop, lapNumber: 17 }),
      makeEvent({ id: "b", type: RaceEventType.PitStop, lapNumber: 3 }),
      makeEvent({ id: "c", type: RaceEventType.PitStop, lapNumber: 10 }),
    ];

    const result = queryDriverEvents(events, {});

    expect(result.map((row) => row.lapNumber)).toEqual([3, 10, 17]);
  });

  it("랩 없는 이벤트는 뒤로 보낸다", () => {
    const events = [
      makeEvent({ id: "ovt", type: RaceEventType.Overtake }),
      makeEvent({ id: "pit", type: RaceEventType.PitStop, lapNumber: 5 }),
    ];

    const result = queryDriverEvents(events, {});

    expect(result.map((row) => row.lapNumber)).toEqual([5, null]);
  });

  it("같은 랩이면 timestamp 오름차순으로 가른다", () => {
    const events = [
      makeEvent({
        id: "late",
        type: RaceEventType.PitStop,
        lapNumber: 5,
        timestamp: "2026-07-19T13:10:00.000Z",
      }),
      makeEvent({
        id: "early",
        type: RaceEventType.PitStop,
        lapNumber: 5,
        timestamp: "2026-07-19T13:05:00.000Z",
      }),
    ];

    const result = queryDriverEvents(events, {});

    expect(result.map((row) => row.timestamp)).toEqual([
      "2026-07-19T13:05:00.000Z",
      "2026-07-19T13:10:00.000Z",
    ]);
  });
});

describe("queryDriverEvents — limit", () => {
  it("기본 상한을 넘으면 자른다", () => {
    const events = Array.from({ length: DEFAULT_DRIVER_EVENT_LIMIT + 10 }, (_, i) =>
      makeEvent({ id: `e${i}`, type: RaceEventType.PitStop, lapNumber: i + 1 }),
    );

    const result = queryDriverEvents(events, {});

    expect(result).toHaveLength(DEFAULT_DRIVER_EVENT_LIMIT);
  });

  it("자를 때 오래된 것(랩 앞쪽)을 남긴다 — 깊은 질문은 전체 이력이라 시간순 앞쪽이 자연스럽다", () => {
    const events = [
      makeEvent({ id: "a", type: RaceEventType.PitStop, lapNumber: 1 }),
      makeEvent({ id: "b", type: RaceEventType.PitStop, lapNumber: 2 }),
      makeEvent({ id: "c", type: RaceEventType.PitStop, lapNumber: 3 }),
    ];

    const result = queryDriverEvents(events, { limit: 2 });

    expect(result.map((row) => row.lapNumber)).toEqual([1, 2]);
  });
});

describe("queryDriverEvents — 경계·불변", () => {
  it("빈 events 는 빈 배열을 준다", () => {
    expect(queryDriverEvents([], { driverNumber: 1 })).toEqual([]);
  });

  it("조건 불일치면 빈 배열을 준다", () => {
    const events = [makeEvent({ id: "a", driverNumber: 1, lapNumber: 5 })];

    expect(queryDriverEvents(events, { driverNumber: 99 })).toEqual([]);
  });

  it("원본 events 배열을 mutate 하지 않는다", () => {
    const events = [
      makeEvent({ id: "a", type: RaceEventType.PitStop, lapNumber: 17 }),
      makeEvent({ id: "b", type: RaceEventType.PitStop, lapNumber: 3 }),
    ];
    const snapshot = events.map((event) => event.id);

    queryDriverEvents(events, {});

    expect(events.map((event) => event.id)).toEqual(snapshot);
  });

  it("결과는 원본 RaceEvent 가 아니라 컴팩트 투영이다 — id·deduplicationKey 등 제외", () => {
    const events = [makeEvent({ id: "a", type: RaceEventType.PitStop, lapNumber: 5 })];

    const result = queryDriverEvents(events, {});
    const row = result[0];

    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("deduplicationKey");
    expect(row).not.toHaveProperty("schemaVersion");
    expect(row).not.toHaveProperty("sessionId");
    expect(Object.keys(row ?? {}).sort()).toEqual(
      [
        "driverNumber",
        "lapNumber",
        "params",
        "targetDriverNumber",
        "timestamp",
        "type",
      ].sort(),
    );
  });
});

describe("queryDriverEvents — 벨기에 GP 픽스처 회귀", () => {
  const data = loadBelgianGpSessionData();
  const parseMs = (date: string | null): number =>
    date === null ? Number.NaN : Date.parse(date);
  const startMs = Math.min(
    ...data.laps.map((lap) => parseMs(lap.date_start)).filter((ms) => !Number.isNaN(ms)),
  );
  // 종료 후 시점까지 훑어 전체 이력을 얻는다.
  const nowMs = startMs + 9_000_000;
  const { events } = buildOpenF1LiveFrame(data, { startMs, nowMs });

  // 픽스처 drivers 에서 VER 번호를 확인한다(관찰: VER pit=lap17).
  const verNumber = data.drivers?.find((d) => d.name_acronym === "VER")?.driver_number;

  it("VER pit_stop 조회가 실제 피트 랩(17)과 일치한다", () => {
    expect(verNumber).toBeDefined();

    const result = queryDriverEvents(events, {
      driverNumber: verNumber,
      types: [RaceEventType.PitStop],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe(RaceEventType.PitStop);
    expect(result[0]?.lapNumber).toBe(17);
  });

  it("investigation 조회가 사유(reason) params 를 담아 반환한다 — 인과의 실질 재료", () => {
    const result = queryDriverEvents(events, {
      types: [RaceEventType.Investigation],
    });

    expect(result.length).toBeGreaterThan(0);
    result.forEach((row) => {
      expect(row.type).toBe(RaceEventType.Investigation);
      expect(typeof row.params.reason).toBe("string");
    });
  });

  // 리뷰 사각지대 회귀: HAM,RUS collision investigation 은 driverNumber 에 첫 차량(HAM=44)만
  // 넣고 상대 차량(RUS=63)은 params.driverCodes 코드 목록에만 담는다. 코드로 조회하지 않으면
  // "RUS 리타이어 ↔ collision investigation"(docs/26 §B 대표 UX)이 무력화된다.
  const rusNumber = data.drivers?.find((d) => d.name_acronym === "RUS")?.driver_number;

  it("driverCode 'RUS' 로 조회하면 HAM,RUS collision investigation 을 잡는다", () => {
    const result = queryDriverEvents(events, {
      driverCode: "RUS",
      types: [RaceEventType.Investigation],
    });

    expect(result.length).toBeGreaterThan(0);
    result.forEach((row) => {
      expect(row.type).toBe(RaceEventType.Investigation);
      expect(String(row.params.driverCodes).split(",")).toContain("RUS");
      expect(row.params.reason).toBe("causing_a_collision");
    });
  });

  it("driverNumber(RUS)+driverCode 를 함께 넘겨도 collision investigation 을 잡는다", () => {
    expect(rusNumber).toBeDefined();

    const result = queryDriverEvents(events, {
      driverNumber: rusNumber,
      driverCode: "RUS",
      types: [RaceEventType.Investigation],
    });

    expect(result.length).toBeGreaterThan(0);
    result.forEach((row) => {
      expect(String(row.params.driverCodes).split(",")).toContain("RUS");
    });
  });

  it("driverNumber(RUS=63)만으로는 코드 목록만 채운 investigation 을 못 잡는다 — 그래서 driverCode 를 연다", () => {
    expect(rusNumber).toBeDefined();

    // 왜 이 케이스를 남기나: driverCodes 는 코드 목록이라 번호(63)로는 상대 차량이 안 걸린다.
    // 이 갭이 driverCode 인자를 추가한 근거다. HAM,RUS 는 숫자 필드에 63 이 없으므로 0 건이다.
    const result = queryDriverEvents(events, {
      driverNumber: rusNumber,
      types: [RaceEventType.Investigation],
    });

    expect(result).toHaveLength(0);
  });
});

describe("queryDriverEvents — 다중 차량 코드 목록 매칭", () => {
  it("params.driverCodes 목록에 코드가 있으면 잡는다 (정확 일치)", () => {
    const events = [
      makeEvent({
        id: "collision",
        type: RaceEventType.Investigation,
        driverNumber: 44,
        params: { driverCodes: "HAM,RUS", reason: "causing_a_collision" },
      }),
      makeEvent({ id: "other", driverNumber: 16, lapNumber: 3 }),
    ];

    const result = queryDriverEvents(events, {
      driverCode: "RUS",
      types: [RaceEventType.Investigation],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.params.driverCodes).toBe("HAM,RUS");
  });

  it("부분 문자열(HAMILTON)로는 목록을 매칭하지 않는다 — 정확 일치만", () => {
    const events = [
      makeEvent({
        id: "collision",
        type: RaceEventType.Investigation,
        driverNumber: 44,
        params: { driverCodes: "HAM,RUS" },
      }),
    ];

    const result = queryDriverEvents(events, { driverCode: "HAMILTON" });

    expect(result).toHaveLength(0);
  });
});
