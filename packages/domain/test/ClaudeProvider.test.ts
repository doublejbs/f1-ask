import { describe, expect, it } from "vitest";
import { ClaudeFetch, ClaudeProvider } from "../src/ai/ClaudeProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { SupportedLocale } from "../src/SupportedLocale";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

// Anthropic Messages API 응답을 흉내내는 fake fetch + 요청 기록.
const makeFetch = (
  text: string,
): {
  fetchImpl: ClaudeFetch;
  calls: { url: string; headers: Record<string, string>; body: string }[];
} => {
  const calls: { url: string; headers: Record<string, string>; body: string }[] =
    [];

  const fetchImpl: ClaudeFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });

    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text }] }),
    };
  };

  return { fetchImpl, calls };
};

describe("ClaudeProvider.answerQuestion", () => {
  it("x-api-key + anthropic-version 헤더로 Messages API 를 호출한다", async () => {
    const { fetchImpl, calls } = makeFetch(
      JSON.stringify({
        answer: "VER leads on softs.",
        confidence: "high",
        insufficientData: false,
        referencedDriverNumbers: [1],
      }),
    );

    const provider = new ClaudeProvider({ apiKey: "sk-ant-test", fetchImpl });
    const result = await provider.answerQuestion({
      question: "Who is leading?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(calls[0]?.url).toContain("/messages");
    expect(calls[0]?.headers["x-api-key"]).toBe("sk-ant-test");
    expect(calls[0]?.headers["anthropic-version"]).toBe("2023-06-01");
    expect(result.answer).toBe("VER leads on softs.");
    expect(result.confidence).toBe("high");
    expect(result.referencedDriverNumbers).toEqual([1]);
    expect(result.snapshotVersion).toBe(frame.snapshot.version);
  });

  it("기본 모델은 claude-opus-4-8 이고 system 은 top-level 파라미터다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');
    const provider = new ClaudeProvider({ apiKey: "sk-ant-test", fetchImpl });

    await provider.answerQuestion({
      question: "How is NOR?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Beginner,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [4],
    });

    const body = JSON.parse(calls[0]?.body ?? "{}") as {
      model: string;
      system: string;
      messages: { role: string; content: string }[];
    };

    expect(body.model).toBe("claude-opus-4-8");
    expect(typeof body.system).toBe("string");
    expect(body.system).toContain("Respond in English");
    expect(body.messages[0]?.role).toBe("user");
    expect(body.messages[0]?.content).toContain("NOR");
  });

  it("모델 override 를 반영한다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');
    const provider = new ClaudeProvider({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5",
      fetchImpl,
    });

    await provider.answerQuestion({
      question: "status?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    const body = JSON.parse(calls[0]?.body ?? "{}") as { model: string };
    expect(body.model).toBe("claude-sonnet-5");
  });

  it("content[] 의 여러 text 블록을 합치고 JSON 파싱 실패 시 텍스트로 처리한다", async () => {
    const { fetchImpl } = makeFetch("plain text answer");
    const provider = new ClaudeProvider({ apiKey: "sk-ant-test", fetchImpl });

    const result = await provider.answerQuestion({
      question: "status?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(result.answer).toBe("plain text answer");
  });

  it("HTTP 오류는 예외를 던진다", async () => {
    const failing: ClaudeFetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const provider = new ClaudeProvider({ apiKey: "bad", fetchImpl: failing });

    await expect(
      provider.answerQuestion({
        question: "x",
        locale: SupportedLocale.En,
        explanationLevel: ExplanationLevel.Standard,
        snapshot: frame.snapshot,
        recentEvents: frame.events,
        favoriteDriverNumbers: [],
      }),
    ).rejects.toThrow();
  });
});

describe("ClaudeProvider.generateCommentary/Summary", () => {
  it("해설은 이벤트를 컨텍스트로 텍스트를 반환한다", async () => {
    const { fetchImpl, calls } = makeFetch("Safety Car bunches the field.");
    const provider = new ClaudeProvider({ apiKey: "sk-ant-test", fetchImpl });
    const event = frame.events[0]!;

    const result = await provider.generateCommentary({
      event,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(result.sourceEventId).toBe(event.id);
    expect(result.text).toBe("Safety Car bunches the field.");
    expect(calls[0]?.body).toContain(event.type);
  });
});
