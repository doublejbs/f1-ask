import { describe, expect, it } from "vitest";
import { GeminiFetch, GeminiProvider } from "../src/ai/GeminiProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SupportedLocale } from "../src/SupportedLocale";

// 해설 규칙과 Q&A 규칙이 실제 요청 본문 수준에서 갈리는지 본다.
// (프롬프트 문자열이 provider 밖으로 새지 않으므로 wire 본문으로 검증한다.)
const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

const HEDGE_RULE =
  "If the data is insufficient to answer, say you do not know.";

type Call = { body: string };

const makeFetch = (): { fetchImpl: GeminiFetch; calls: Call[] } => {
  const calls: Call[] = [];

  const fetchImpl: GeminiFetch = async (_url, init) => {
    calls.push({ body: init.body });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
      }),
    };
  };

  return { fetchImpl, calls };
};

const systemTextOf = (body: string): string => {
  const parsed = JSON.parse(body) as {
    systemInstruction: { parts: { text: string }[] };
  };

  return parsed.systemInstruction.parts.map((part) => part.text).join("");
};

const buildEvent = (type: RaceEventType, driverNumber?: number): RaceEvent => ({
  schemaVersion: 1,
  id: `event:${type}`,
  sessionId: frame.snapshot.sessionId,
  type,
  priority: RaceEventPriority.High,
  driverNumber,
  timestamp: "2026-07-19T05:00:00.000Z",
  params: {},
  deduplicationKey: `dedup:${type}`,
});

describe("해설 프롬프트와 Q&A 프롬프트의 분리", () => {
  it("Q&A 시스템 프롬프트에는 '모르면 모른다' 규칙이 남아 있다", async () => {
    const { fetchImpl, calls } = makeFetch();
    const provider = new GeminiProvider({ apiKey: "k", fetchImpl });

    await provider.answerQuestion({
      question: "Who is leading?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(systemTextOf(calls[0]!.body)).toContain(HEDGE_RULE);
  });

  it("해설 시스템 프롬프트에는 '모르면 모른다' 규칙이 없다", async () => {
    const { fetchImpl, calls } = makeFetch();
    const provider = new GeminiProvider({ apiKey: "k", fetchImpl });

    await provider.generateCommentary({
      event: buildEvent(
        RaceEventType.Penalty,
        frame.snapshot.drivers[4]!.driverNumber,
      ),
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    const system = systemTextOf(calls[0]!.body);

    expect(system).not.toContain(HEDGE_RULE);
    // Q&A 의 "추정은 확인 불가라고 말하라" 규칙도 넘어오면 안 된다.
    expect(system).not.toContain("say it cannot be confirmed from the data");
    expect(system).toContain("If it is not in the data, it does not exist.");
  });

  it("Driver 이벤트 요청 본문에는 순위 슬라이스가, Session 이벤트에는 없다", async () => {
    const driverCall = makeFetch();
    const sessionCall = makeFetch();

    await new GeminiProvider({
      apiKey: "k",
      fetchImpl: driverCall.fetchImpl,
    }).generateCommentary({
      event: buildEvent(
        RaceEventType.Penalty,
        frame.snapshot.drivers[4]!.driverNumber,
      ),
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    await new GeminiProvider({
      apiKey: "k",
      fetchImpl: sessionCall.fetchImpl,
    }).generateCommentary({
      event: buildEvent(RaceEventType.SafetyCar),
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(driverCall.calls[0]!.body).toContain("standings");
    expect(sessionCall.calls[0]!.body).not.toContain("standings");
  });

  it("직전 해설을 전달하면 요청 본문에 실린다", async () => {
    const { fetchImpl, calls } = makeFetch();

    await new GeminiProvider({ apiKey: "k", fetchImpl }).generateCommentary({
      event: buildEvent(RaceEventType.SafetyCar),
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentCommentary: ["이전 해설 한 줄"],
    });

    expect(calls[0]!.body).toContain("이전 해설 한 줄");
  });
});

describe("이벤트 타입별 전용 지침 부착", () => {
  it("StrategyNote 이벤트에는 STRATEGY_NOTE_GUIDANCE 가 붙는다", async () => {
    const { fetchImpl, calls } = makeFetch();

    await new GeminiProvider({ apiKey: "k", fetchImpl }).generateCommentary({
      event: buildEvent(RaceEventType.StrategyNote),
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    const system = systemTextOf(calls[0]!.body);

    // StrategyNote 전용 지침의 핵심 내용
    expect(system).toContain("tyre strategy event");
    expect(system).toContain("INTENT");
  });

  it("Investigation 이벤트에는 INVESTIGATION_GUIDANCE 가 붙는다", async () => {
    const { fetchImpl, calls } = makeFetch();

    await new GeminiProvider({ apiKey: "k", fetchImpl }).generateCommentary({
      event: buildEvent(RaceEventType.Investigation),
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    const system = systemTextOf(calls[0]!.body);

    // Investigation 전용 지침의 핵심 내용
    expect(system).toContain("params.status");
    expect(system).toContain("noted");
    expect(system).toContain("under_investigation");
    expect(system).toContain("concluded");
  });

  it("OvertakeForecast 이벤트에는 OVERTAKE_FORECAST_GUIDANCE 가 붙는다", async () => {
    const { fetchImpl, calls } = makeFetch();

    await new GeminiProvider({ apiKey: "k", fetchImpl }).generateCommentary({
      event: buildEvent(RaceEventType.OvertakeForecast),
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    const system = systemTextOf(calls[0]!.body);

    // OvertakeForecast 전용 지침의 핵심 내용
    expect(system).toContain("forecast, not a fact");
    expect(system).toContain("compound and tireAgeLaps");
    expect(system).toContain("TREND");
  });

  it("지침이 없는 이벤트 타입은 공통 규칙만 포함한다", async () => {
    const { fetchImpl, calls } = makeFetch();

    await new GeminiProvider({ apiKey: "k", fetchImpl }).generateCommentary({
      event: buildEvent(RaceEventType.SafetyCar),
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    const system = systemTextOf(calls[0]!.body);

    // 공통 규칙은 있어야 함
    expect(system).toContain("Use ONLY the data provided");
    // 타입별 지침은 없어야 함
    expect(system).not.toContain("tyre strategy");
    expect(system).not.toContain("params.status");
    expect(system).not.toContain("forecast, not a fact");
  });
});
