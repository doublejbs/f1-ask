import { describe, expect, it } from "vitest";
import {
  isQuestionContextEligibleType,
  QUESTION_CONTEXT_ELIGIBLE_EVENT_TYPES,
  QUESTION_CONTEXT_EVENT_TYPE_ADDITIONS,
} from "../src/ai/QuestionEventAllowlist";
import { COMMENTARY_ELIGIBLE_EVENT_TYPES } from "../src/ai/CommentaryEventAllowlist";
import {
  RECENT_QUESTION_EVENT_LIMIT,
  selectQuestionEvents,
} from "../src/ai/QuestionEventSelection";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { loadBelgianGpSessionData } from "./fixtures/BelgianGpFixture";
import { buildEvents } from "../src/openf1/OpenF1Recording";

// ── 테스트용 이벤트 팩토리 ──

let counter = 0;

const makeEvent = (
  type: RaceEventType,
  priority: RaceEventPriority,
  timestamp: string,
): RaceEvent => {
  counter += 1;

  return {
    schemaVersion: 1,
    id: `evt:${counter}`,
    sessionId: "test",
    type,
    priority,
    timestamp,
    params: {},
    deduplicationKey: `dedup:${counter}`,
  };
};

// 벨기에 GP 실데이터에서 이벤트를 재생성한다 (프로덕션과 동일한 buildEvents 경로).
const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

const loadBelgianGpEvents = (): RaceEvent[] => {
  const data = loadBelgianGpSessionData();
  const lapStarts = data.laps
    .map((lap) => parseMs(lap.date_start))
    .filter((ms) => !Number.isNaN(ms));
  const startMs = Math.min(...lapStarts);
  const endMs = Math.max(...lapStarts);

  return buildEvents(data, startMs, endMs).map((timed) => timed.event);
};

describe("QuestionEventAllowlist", () => {
  it("해설 allowlist 위에 pit_stop·red_flag·rain_risk 만 추가한다", () => {
    // 추가 목록이 정확히 이 세 타입이다 (질문 답변엔 필요하나 해설 대상은 아닌 사실).
    expect([...QUESTION_CONTEXT_EVENT_TYPE_ADDITIONS].sort()).toEqual(
      [
        RaceEventType.PitStop,
        RaceEventType.RainRisk,
        RaceEventType.RedFlag,
      ].sort(),
    );

    // 세 추가 타입은 해설 allowlist 에서 false 였다 — 두 표가 서로 다른 질문에 답한다는 증거.
    for (const type of QUESTION_CONTEXT_EVENT_TYPE_ADDITIONS) {
      expect(COMMENTARY_ELIGIBLE_EVENT_TYPES[type]).toBe(false);
      expect(QUESTION_CONTEXT_ELIGIBLE_EVENT_TYPES[type]).toBe(true);
    }
  });

  it("추가 3종을 뺀 나머지는 해설 allowlist 와 정확히 같다 (공통부 재사용)", () => {
    const additions = new Set<RaceEventType>(
      QUESTION_CONTEXT_EVENT_TYPE_ADDITIONS,
    );

    for (const type of Object.values(RaceEventType)) {
      if (additions.has(type)) {
        continue;
      }

      expect(QUESTION_CONTEXT_ELIGIBLE_EVENT_TYPES[type]).toBe(
        COMMENTARY_ELIGIBLE_EVENT_TYPES[type],
      );
    }
  });

  it("스펙 화이트리스트 12종을 모두 넣고, 소음 타입은 뺀다", () => {
    const included = [
      RaceEventType.Penalty,
      RaceEventType.SafetyCar,
      RaceEventType.VirtualSafetyCar,
      RaceEventType.RedFlag,
      RaceEventType.PitStop,
      RaceEventType.Investigation,
      RaceEventType.Retirement,
      RaceEventType.TrackHazard,
      RaceEventType.SessionRestarted,
      RaceEventType.StrategyNote,
      RaceEventType.FastestLap,
      RaceEventType.RainRisk,
    ];

    for (const type of included) {
      expect(isQuestionContextEligibleType(type)).toBe(true);
    }

    const excluded = [
      RaceEventType.Overtake,
      RaceEventType.GapClosing,
      RaceEventType.GapIncreasing,
      RaceEventType.OverrideRangeEntered,
      RaceEventType.PersonalBestLap,
      RaceEventType.BlueFlag,
      RaceEventType.SectorYellow,
      RaceEventType.SectorClear,
      RaceEventType.TrackLimits,
      RaceEventType.TeamRadioPosted,
      RaceEventType.PositionChange,
      RaceEventType.OvertakeModeEnabled,
      RaceEventType.OvertakeModeDisabled,
    ];

    for (const type of excluded) {
      expect(isQuestionContextEligibleType(type)).toBe(false);
    }
  });
});

describe("selectQuestionEvents", () => {
  it("소음 타입(추월·갭·오버라이드)을 제거하고 우선 사실만 남긴다", () => {
    const base = "2026-07-19T13:00:00.000Z";
    const events = [
      makeEvent(RaceEventType.Overtake, RaceEventPriority.High, base),
      makeEvent(RaceEventType.GapClosing, RaceEventPriority.Medium, base),
      makeEvent(
        RaceEventType.OverrideRangeEntered,
        RaceEventPriority.Low,
        base,
      ),
      makeEvent(RaceEventType.PitStop, RaceEventPriority.High, base),
      makeEvent(RaceEventType.Penalty, RaceEventPriority.Critical, base),
      makeEvent(RaceEventType.Investigation, RaceEventPriority.High, base),
    ];

    const types = selectQuestionEvents(events).map((event) => event.type);

    expect(types).toContain(RaceEventType.PitStop);
    expect(types).toContain(RaceEventType.Penalty);
    expect(types).toContain(RaceEventType.Investigation);
    expect(types).not.toContain(RaceEventType.Overtake);
    expect(types).not.toContain(RaceEventType.GapClosing);
    expect(types).not.toContain(RaceEventType.OverrideRangeEntered);
  });

  it("상한을 지키고 우선순위 순(critical→high→medium)으로 채운다", () => {
    // 시각을 모두 같게 두어 우선순위만으로 채움 순서를 검증한다.
    const at = "2026-07-19T13:00:00.000Z";
    const events: RaceEvent[] = [];

    // medium 30건, high 30건, critical 5건 → 총 65건(모두 화이트리스트 타입).
    for (let i = 0; i < 30; i += 1) {
      events.push(makeEvent(RaceEventType.StrategyNote, RaceEventPriority.Medium, at));
    }

    for (let i = 0; i < 30; i += 1) {
      events.push(makeEvent(RaceEventType.PitStop, RaceEventPriority.High, at));
    }

    for (let i = 0; i < 5; i += 1) {
      events.push(makeEvent(RaceEventType.Penalty, RaceEventPriority.Critical, at));
    }

    const selected = selectQuestionEvents(events, 40);

    expect(selected.length).toBe(40);

    const priorities = selected.map((event) => event.priority);
    const criticalCount = priorities.filter(
      (p) => p === RaceEventPriority.Critical,
    ).length;
    const highCount = priorities.filter(
      (p) => p === RaceEventPriority.High,
    ).length;
    const mediumCount = priorities.filter(
      (p) => p === RaceEventPriority.Medium,
    ).length;

    // critical 5 전부, high 30 전부, 남은 5칸은 medium.
    expect(criticalCount).toBe(5);
    expect(highCount).toBe(30);
    expect(mediumCount).toBe(5);
  });

  it("같은 우선순위 안에서는 최신을 남긴다", () => {
    const events = [
      makeEvent(RaceEventType.PitStop, RaceEventPriority.High, "2026-07-19T13:00:00.000Z"),
      makeEvent(RaceEventType.PitStop, RaceEventPriority.High, "2026-07-19T13:10:00.000Z"),
      makeEvent(RaceEventType.PitStop, RaceEventPriority.High, "2026-07-19T13:20:00.000Z"),
    ];

    const selected = selectQuestionEvents(events, 2).map((event) =>
      event.timestamp,
    );

    // 최신 2건을 남기되, 출력은 시간 오름차순.
    expect(selected).toEqual([
      "2026-07-19T13:10:00.000Z",
      "2026-07-19T13:20:00.000Z",
    ]);
  });

  it("limit 이 0 이하이면 빈 배열", () => {
    const events = [
      makeEvent(RaceEventType.Penalty, RaceEventPriority.Critical, "2026-07-19T13:00:00.000Z"),
    ];

    expect(selectQuestionEvents(events, 0)).toEqual([]);
  });
});

// 벨기에 GP 실데이터 회귀 — 측정치로 고정한다. 픽스처가 바뀌면 이 숫자도 다시 잰다.
describe("selectQuestionEvents — Belgian GP 2026 회귀", () => {
  const events = loadBelgianGpEvents();

  it("총 이벤트 수와 화이트리스트 통과 수를 고정한다", () => {
    // 픽스처를 buildEvents 로 재생성한 전체 이벤트.
    expect(events.length).toBe(580);

    const whitelisted = events.filter((event) =>
      isQuestionContextEligibleType(event.type),
    );

    // 소음 527건을 걷어낸 뒤 남는 우선 사실. 8건보다 훨씬 풍부하다.
    expect(whitelisted.length).toBe(69);
  });

  it("선별이 상한 40 을 지키고 소음을 배제한다", () => {
    const selected = selectQuestionEvents(events);
    const types = new Set(selected.map((event) => event.type));

    expect(selected.length).toBe(RECENT_QUESTION_EVENT_LIMIT);
    expect(selected.length).toBe(40);

    // 이전에 8칸을 다 차지하던 고빈도 저의미 타입이 하나도 없다.
    expect(types.has(RaceEventType.OverrideRangeEntered)).toBe(false);
    expect(types.has(RaceEventType.GapClosing)).toBe(false);
    expect(types.has(RaceEventType.PersonalBestLap)).toBe(false);
    expect(types.has(RaceEventType.SectorYellow)).toBe(false);
  });

  it("이전에 밀려나던 pit_stop·penalty·investigation 이 들어온다", () => {
    const selected = selectQuestionEvents(events);
    const byType = new Map<RaceEventType, number>();

    for (const event of selected) {
      byType.set(event.type, (byType.get(event.type) ?? 0) + 1);
    }

    // 사용자가 "왜 안 오냐" 던 pit_stop 이 이제 컨텍스트에 있다.
    expect(byType.get(RaceEventType.PitStop) ?? 0).toBeGreaterThan(0);
    expect(byType.get(RaceEventType.Investigation) ?? 0).toBeGreaterThan(0);
    // penalty 는 critical 이라 항상 살아남는다.
    expect(byType.get(RaceEventType.Penalty) ?? 0).toBeGreaterThan(0);
  });
});
