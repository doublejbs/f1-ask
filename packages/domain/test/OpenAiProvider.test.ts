import { describe, expect, it } from "vitest";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { OpenAiFetch, OpenAiProvider } from "../src/ai/OpenAiProvider";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { SupportedLocale } from "../src/SupportedLocale";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

// OpenAI chat 응답을 흉내내는 fake fetch + 요청 기록.
const makeFetch = (
  content: string,
): {
  fetchImpl: OpenAiFetch;
  calls: { url: string; auth?: string; body: string }[];
} => {
  const calls: { url: string; auth?: string; body: string }[] = [];

  const fetchImpl: OpenAiFetch = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization, body: init.body });

    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    };
  };

  return { fetchImpl, calls };
};

describe("OpenAiProvider.answerQuestion", () => {
  it("Bearer 인증으로 OpenAI 를 호출하고 JSON 응답을 파싱한다", async () => {
    const { fetchImpl, calls } = makeFetch(
      JSON.stringify({
        answer: "VER leads on softs.",
        confidence: "high",
        insufficientData: false,
        referencedDriverNumbers: [1],
      }),
    );

    const provider = new OpenAiProvider({ apiKey: "sk-test", fetchImpl });
    const result = await provider.answerQuestion({
      question: "Who is leading?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(calls[0]?.url).toContain("/chat/completions");
    expect(calls[0]?.auth).toBe("Bearer sk-test");
    expect(result.answer).toBe("VER leads on softs.");
    expect(result.confidence).toBe("high");
    expect(result.referencedDriverNumbers).toEqual([1]);
    expect(result.snapshotVersion).toBe(frame.snapshot.version);
  });

  it("context 에 실제 드라이버 데이터를 포함한다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');
    const provider = new OpenAiProvider({ apiKey: "sk-test", fetchImpl });

    await provider.answerQuestion({
      question: "How is NOR?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Beginner,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [4],
    });

    const body = calls[0]?.body ?? "";
    expect(body).toContain("NOR");
    expect(body).toContain("Respond in English");
    expect(body).toContain("beginner");
  });

  it("JSON 파싱 실패 시에도 답변 텍스트로 처리한다", async () => {
    const { fetchImpl } = makeFetch("plain text answer");
    const provider = new OpenAiProvider({ apiKey: "sk-test", fetchImpl });

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
    const failing: OpenAiFetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const provider = new OpenAiProvider({ apiKey: "bad", fetchImpl: failing });

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

describe("OpenAiProvider.generateCommentary/Summary", () => {
  it("해설은 이벤트를 컨텍스트로 텍스트를 반환한다", async () => {
    const { fetchImpl, calls } = makeFetch("Safety Car bunches the field.");
    const provider = new OpenAiProvider({ apiKey: "sk-test", fetchImpl });
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
