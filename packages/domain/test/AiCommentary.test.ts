import { describe, expect, it } from "vitest";
import {
  attachCommentary,
  isCommentaryEligible,
  selectCommentaryEvents,
  selectKeyMomentEvents,
  toAiCommentary,
} from "../src/ai/AiCommentary";
import {
  COMMENTARY_ELIGIBLE_EVENT_TYPES,
  isCommentaryEligibleType,
} from "../src/ai/CommentaryEventAllowlist";
import { RaceEventScope } from "../src/RaceEventScope";
import { getRaceEventScope } from "../src/RaceEventScopeMap";
import { MockLlmProvider } from "../src/ai/MockLlmProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SupportedLocale } from "../src/SupportedLocale";

const START_EPOCH = Date.parse("2026-07-19T05:00:00.000Z");

const frame = new MockRaceEngine(DEFAULT_MOCK_SCENARIO, START_EPOCH).snapshotAt(
  122,
);

const provider = new MockLlmProvider();

// 타입 allowlist 를 통과하는 타입. 이 목록이 바뀌면 테스트도 같이 바뀌어야 한다.
const ALLOWLISTED_TYPES: readonly RaceEventType[] = [
  RaceEventType.Penalty,
  RaceEventType.Investigation,
  RaceEventType.SafetyCar,
  RaceEventType.VirtualSafetyCar,
  RaceEventType.Retirement,
  RaceEventType.TrackHazard,
  RaceEventType.StrategyNote,
  RaceEventType.FastestLap,
  RaceEventType.SessionRestarted,
  RaceEventType.OvertakeForecast,
];

// allowlist 를 통과하지만 **Session 범위라 해설이 폐기된** 타입
// (docs/19-watch-now.md §폐기한다, 수용 기준 6).
const SESSION_SCOPED_TYPES: readonly RaceEventType[] = [
  RaceEventType.SafetyCar,
  RaceEventType.VirtualSafetyCar,
  RaceEventType.TrackHazard,
  RaceEventType.SessionRestarted,
];

// 실제 해설 대상 = allowlist ∩ Driver 범위.
const ELIGIBLE_TYPES: readonly RaceEventType[] = ALLOWLISTED_TYPES.filter(
  (type) => !SESSION_SCOPED_TYPES.includes(type),
);

const buildEvent = (
  type: RaceEventType,
  priority: RaceEventPriority = RaceEventPriority.Low,
): RaceEvent => ({
  schemaVersion: 1,
  id: `event:${type}`,
  sessionId: "session:test",
  type,
  priority,
  timestamp: "2026-07-19T05:00:00.000Z",
  params: {},
  deduplicationKey: `dedup:${type}`,
});

describe("COMMENTARY_ELIGIBLE_EVENT_TYPES", () => {
  it("RaceEventType 전수를 덮는다", () => {
    for (const type of Object.values(RaceEventType)) {
      expect(
        COMMENTARY_ELIGIBLE_EVENT_TYPES[type],
        `${type} 매핑 누락`,
      ).toBeTypeOf("boolean");
    }

    expect(Object.keys(COMMENTARY_ELIGIBLE_EVENT_TYPES).sort()).toEqual(
      Object.values(RaceEventType).sort(),
    );
  });

  it("allowlist 에 포함된 타입만 true 다", () => {
    const eligible = Object.values(RaceEventType).filter(
      (type) => COMMENTARY_ELIGIBLE_EVENT_TYPES[type],
    );

    expect(eligible.sort()).toEqual([...ALLOWLISTED_TYPES].sort());
  });
});

describe("isCommentaryEligible", () => {
  it("해설 대상 타입은 우선순위와 무관하게 통과한다", () => {
    for (const type of ELIGIBLE_TYPES) {
      expect(
        isCommentaryEligible(buildEvent(type, RaceEventPriority.Low)),
        `${type} 는 해설 대상이어야 한다`,
      ).toBe(true);
    }
  });

  it("추월·피트스톱은 critical 이어도 제외한다", () => {
    expect(
      isCommentaryEligible(
        buildEvent(RaceEventType.Overtake, RaceEventPriority.Critical),
      ),
    ).toBe(false);
    expect(
      isCommentaryEligible(
        buildEvent(RaceEventType.PitStop, RaceEventPriority.Critical),
      ),
    ).toBe(false);
  });

  it("나머지 제외 대상도 걸러낸다", () => {
    const excluded = [
      RaceEventType.PersonalBestLap,
      RaceEventType.GapClosing,
      RaceEventType.OverrideRangeEntered,
      RaceEventType.TeamRadioPosted,
      RaceEventType.SectorYellow,
      RaceEventType.SectorClear,
      RaceEventType.BlueFlag,
      RaceEventType.TrackLimits,
    ];

    for (const type of excluded) {
      expect(
        isCommentaryEligible(buildEvent(type, RaceEventPriority.High)),
        `${type} 는 제외 대상이어야 한다`,
      ).toBe(false);
    }
  });

  // 방송이 가장 잘하는 영역이라 폐기했다. 실측에서 나온 무가치한 문장
  // ("41랩에 세이프티 카가 발동되며 트랙 상황이 급변합니다")이 전부 여기였다.
  it("Session 범위는 allowlist 를 통과해도 해설 대상이 아니다", () => {
    for (const type of SESSION_SCOPED_TYPES) {
      expect(
        isCommentaryEligibleType(type),
        `${type} 는 타입 allowlist 는 통과해야 한다`,
      ).toBe(true);
      expect(
        getRaceEventScope(type),
        `${type} 는 Session 범위여야 한다`,
      ).toBe(RaceEventScope.Session);
      expect(
        isCommentaryEligible(buildEvent(type, RaceEventPriority.Critical)),
        `${type} 는 해설 대상에서 빠져야 한다`,
      ).toBe(false);
    }
  });

  it("남은 해설 대상은 전부 Driver 범위다", () => {
    for (const type of ELIGIBLE_TYPES) {
      expect(getRaceEventScope(type)).toBe(RaceEventScope.Driver);
    }
  });
});

// 경기 요약의 "주요 순간" 은 방송과 경쟁하지 않으므로 Session 범위 제한을 받지 않는다.
// 해설과 같은 함수를 쓰면 요약에서 세이프티카가 사라진다.
describe("selectKeyMomentEvents", () => {
  it("Session 범위 사건도 주요 순간에는 남는다", () => {
    const events = [
      buildEvent(RaceEventType.SafetyCar),
      buildEvent(RaceEventType.Retirement),
    ];
    const selected = selectKeyMomentEvents(events, 10);

    expect(selected.map((event) => event.type).sort()).toEqual(
      [RaceEventType.Retirement, RaceEventType.SafetyCar].sort(),
    );
    expect(selectCommentaryEvents(events, 10).map((event) => event.type)).toEqual([
      RaceEventType.Retirement,
    ]);
  });
});

describe("selectCommentaryEvents", () => {
  it("allowlist 타입만 해설 대상으로 선별한다", () => {
    const selected = selectCommentaryEvents(frame.events, 100);

    expect(selected.length).toBeGreaterThan(0);

    for (const event of selected) {
      expect(ELIGIBLE_TYPES).toContain(event.type);
    }
  });

  it("추월·피트스톱은 선별 결과에 없다", () => {
    const selected = selectCommentaryEvents(frame.events, 100);
    const hasNoisyType = selected.some(
      (event) =>
        event.type === RaceEventType.Overtake ||
        event.type === RaceEventType.PitStop,
    );

    expect(hasNoisyType).toBe(false);
  });

  it("우선순위 기반 선별보다 건수가 줄어든다", () => {
    const priorityBased = frame.events.filter(
      (event) =>
        event.priority === RaceEventPriority.High ||
        event.priority === RaceEventPriority.Critical,
    );
    const selected = selectCommentaryEvents(frame.events, 1000);

    expect(selected.length).toBeLessThan(priorityBased.length);
  });

  it("limit 을 지키고 최신순 꼬리를 남긴다", () => {
    const all = selectCommentaryEvents(frame.events, 1000);

    expect(selectCommentaryEvents(frame.events, 2).length).toBeLessThanOrEqual(2);
    expect(selectCommentaryEvents(frame.events, 2)).toEqual(all.slice(-2));
  });
});

describe("MockLlmProvider.generateCommentary", () => {
  it("세이프티카 해설은 전략적 의미를 설명한다", async () => {
    const safetyCar = frame.events.find(
      (event) => event.type === RaceEventType.SafetyCar,
    );

    expect(safetyCar).toBeDefined();

    const commentary = await provider.generateCommentary({
      event: safetyCar!,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(commentary.sourceEventId).toBe(safetyCar!.id);
    expect(commentary.text.toLowerCase()).toContain("safety car");
  });

  it("결정론적이고 locale 에 따라 언어가 바뀐다", async () => {
    const overtake = frame.events.find(
      (event) => event.type === RaceEventType.Overtake,
    )!;

    const en1 = await provider.generateCommentary({
      event: overtake,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });
    const en2 = await provider.generateCommentary({
      event: overtake,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });
    const ja = await provider.generateCommentary({
      event: overtake,
      locale: SupportedLocale.Ja,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(en1).toEqual(en2);
    expect(ja.text).not.toBe(en1.text);
  });

  it("피트 해설은 팀 전략을 단정하지 않는다", async () => {
    const pit = frame.events.find(
      (event) => event.type === RaceEventType.PitStop,
    )!;

    const commentary = await provider.generateCommentary({
      event: pit,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(commentary.text.toLowerCase()).toContain("can't be confirmed");
  });
});

describe("toAiCommentary", () => {
  it("이벤트 기준 결정론적 id 를 만든다", () => {
    const event = frame.events[0]!;
    const commentary = toAiCommentary(event, "hello");

    expect(commentary.sourceEventId).toBe(event.id);
    expect(commentary.id).toBe(`commentary:${event.id}`);
    expect(commentary.text).toBe("hello");
  });
});

describe("attachCommentary", () => {
  const events = frame.events.slice(0, 3);
  const [first, second, third] = events;

  it("sourceEventId 가 일치하는 해설을 이벤트에 붙인다", () => {
    const attached = attachCommentary(events, [
      toAiCommentary(second!, "second commentary"),
    ]);

    expect(attached).toHaveLength(3);
    expect(attached[1]!.event.id).toBe(second!.id);
    expect(attached[1]!.commentary?.text).toBe("second commentary");
  });

  it("해설이 없는 이벤트도 commentary: null 로 포함한다", () => {
    const attached = attachCommentary(events, [
      toAiCommentary(second!, "second commentary"),
    ]);

    expect(attached[0]!.commentary).toBeNull();
    expect(attached[2]!.commentary).toBeNull();
    expect(attached.map((item) => item.event.id)).toEqual([
      first!.id,
      second!.id,
      third!.id,
    ]);
  });

  it("대응하는 이벤트가 없는 해설은 무시한다", () => {
    const orphan = toAiCommentary(
      { ...first!, id: "event:does-not-exist" },
      "orphan",
    );
    const attached = attachCommentary(events, [orphan]);

    expect(attached).toHaveLength(3);
    expect(attached.every((item) => item.commentary === null)).toBe(true);
  });

  it("빈 배열을 안전하게 처리한다", () => {
    expect(attachCommentary([], [])).toEqual([]);
    expect(attachCommentary([], [toAiCommentary(first!, "x")])).toEqual([]);
    expect(attachCommentary(events, []).every((i) => i.commentary === null)).toBe(
      true,
    );
  });

  it("이벤트 순서를 보존한다", () => {
    const attached = attachCommentary(events, [
      toAiCommentary(third!, "c"),
      toAiCommentary(first!, "a"),
    ]);

    expect(attached.map((item) => item.commentary?.text ?? null)).toEqual([
      "a",
      null,
      "c",
    ]);
  });
});

describe("toAiCommentary isMock", () => {
  it("기본값은 false 이고 명시하면 true 가 된다", () => {
    const event = frame.events[0]!;

    expect(toAiCommentary(event, "hello").isMock).toBe(false);
    expect(toAiCommentary(event, "hello", true).isMock).toBe(true);
  });

  it("MockLlmProvider 해설은 isMock 을 표시한다", async () => {
    const commentary = await provider.generateCommentary({
      event: frame.events[0]!,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(commentary.isMock).toBe(true);
  });
});
