import { describe, expect, it } from "vitest";
import { GeminiFetch, GeminiProvider } from "../src/ai/GeminiProvider";
import { LlmChatRole } from "../src/ai/LlmChatRole";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { SupportedLocale } from "../src/SupportedLocale";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

type Call = { url: string; headers: Record<string, string>; body: string };

// Gemini generateContent 응답을 흉내내는 fake fetch + 요청 기록.
const makeFetch = (
  text: string,
): { fetchImpl: GeminiFetch; calls: Call[] } => {
  const calls: Call[] = [];

  const fetchImpl: GeminiFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { role: "model", parts: [{ text }] } }],
      }),
    };
  };

  return { fetchImpl, calls };
};

// 임의의 응답 본문을 그대로 돌려주는 fake fetch (구조 오류 검증용).
const makeRawFetch = (payload: unknown): GeminiFetch => {
  return async () => ({ ok: true, status: 200, json: async () => payload });
};

const askWith = async (
  fetchImpl: GeminiFetch,
  options: {
    model?: string;
    baseUrl?: string;
    question?: string;
    apiKey?: string;
  } = {},
) => {
  const provider = new GeminiProvider({
    apiKey: options.apiKey ?? "gemini-test-key",
    fetchImpl,
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
  });

  return provider.answerQuestion({
    question: options.question ?? "Who is leading?",
    locale: SupportedLocale.En,
    explanationLevel: ExplanationLevel.Standard,
    snapshot: frame.snapshot,
    recentEvents: frame.events,
    favoriteDriverNumbers: [],
  });
};

describe("GeminiProvider.answerQuestion", () => {
  it("candidates[].content.parts[].text 를 파싱해 답변을 만든다", async () => {
    const { fetchImpl, calls } = makeFetch(
      JSON.stringify({
        answer: "VER leads on softs.",
        confidence: "high",
        insufficientData: false,
        referencedDriverNumbers: [1],
      }),
    );

    const result = await askWith(fetchImpl);

    expect(calls[0]?.headers["x-goog-api-key"]).toBe("gemini-test-key");
    expect(result.answer).toBe("VER leads on softs.");
    expect(result.confidence).toBe("high");
    expect(result.referencedDriverNumbers).toEqual([1]);
    expect(result.snapshotVersion).toBe(frame.snapshot.version);
    expect(result.dataTimestamp).toBe(frame.snapshot.sourceUpdatedAt);
  });

  it("parts[] 의 여러 text 조각을 합치고 JSON 파싱 실패 시 텍스트로 처리한다", async () => {
    const fetchImpl = makeRawFetch({
      candidates: [
        { content: { parts: [{ text: "plain " }, { text: "text answer" }] } },
      ],
    });

    const result = await askWith(fetchImpl);

    expect(result.answer).toBe("plain text answer");
  });

  // 기본 모델을 고정한다. 모델이 은퇴해 404 가 나면 이 테스트가 변경 지점을 가리킨다.
  it("model 을 주지 않으면 현행 기본 모델로 요청한다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');

    await askWith(fetchImpl);

    expect(calls[0]?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
    );
  });

  it("기본 모델은 Flash 계열이고 URL 경로와 프롬프트가 요청에 담긴다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');

    await askWith(fetchImpl, { question: "How is NOR?" });

    // 모델은 REST 경로 파라미터(models/{model})로 전달된다.
    expect(calls[0]?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
    );

    const body = JSON.parse(calls[0]?.body ?? "{}") as {
      contents: { role: string; parts: { text: string }[] }[];
      systemInstruction: { parts: { text: string }[] };
      generationConfig: { maxOutputTokens: number };
    };

    expect(body.systemInstruction.parts[0]?.text).toContain(
      "Respond in English",
    );
    expect(body.contents[0]?.role).toBe("user");
    expect(body.contents[0]?.parts[0]?.text).toContain("How is NOR?");
    expect(body.contents[0]?.parts[0]?.text).toContain("Current race data");
    expect(body.generationConfig.maxOutputTokens).toBe(300);
  });

  it("모델 override 가 URL 경로에 반영된다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');

    await askWith(fetchImpl, { model: "gemini-2.5-flash-lite" });

    expect(calls[0]?.url).toContain("/models/gemini-2.5-flash-lite:");
  });

  // 방어 로직: GEMINI_MODEL 에 "models/" 접두사가 붙어 오면 URL 이 이중이 되어 404 가 난다.
  // (프로덕션 404 의 실제 원인은 기본 모델 은퇴였지만, 이 경로도 막아 둔다.)
  it('모델의 선행 "models/" 접두사를 제거해 URL 이 이중이 되지 않는다', async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');

    await askWith(fetchImpl, { model: "models/gemini-2.5-flash" });

    expect(calls[0]?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(calls[0]?.url).not.toContain("models/models/");
  });

  it("baseUrl 의 후행 슬래시를 제거해 //models 가 생기지 않는다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');

    await askWith(fetchImpl, { baseUrl: "https://proxy.example.com/v1beta/" });

    expect(calls[0]?.url).toBe(
      "https://proxy.example.com/v1beta/models/gemini-3.5-flash:generateContent",
    );
    expect(calls[0]?.url).not.toContain("//models");
  });

  // ClaudeProvider 는 baseUrl 옵션이 팩토리에서 누락됐던 이력이 있다 — 재발 방지.
  it("baseUrl 옵션이 실제 요청 URL 에 반영된다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');

    await askWith(fetchImpl, { baseUrl: "https://proxy.example.com/v1beta" });

    expect(calls[0]?.url).toBe(
      "https://proxy.example.com/v1beta/models/gemini-3.5-flash:generateContent",
    );
    expect(calls[0]?.url).not.toContain("generativelanguage.googleapis.com");
  });

  it("컨텍스트에 날씨·섹터·스피드 트랩이 포함된다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');

    await askWith(fetchImpl);

    const body = JSON.parse(calls[0]?.body ?? "{}") as {
      contents: { parts: { text: string }[] }[];
    };
    const userContent = body.contents.at(-1)?.parts[0]?.text ?? "";

    expect(userContent).toContain("topSpeedKph");
    expect(userContent).toContain("sectors");
    expect(userContent).toContain("weather");
  });

  it("이전 대화 턴을 contents 에 앞세우고 assistant 를 model role 로 매핑한다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');
    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
    });

    await provider.answerQuestion({
      question: "그럼 타이어는?",
      locale: SupportedLocale.Ko,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
      conversationHistory: [
        { role: LlmChatRole.User, content: "지금 누가 선두야?" },
        { role: LlmChatRole.Assistant, content: "현재 선두는 VER 입니다." },
      ],
    });

    const body = JSON.parse(calls[0]?.body ?? "{}") as {
      contents: { role: string; parts: { text: string }[] }[];
    };

    // 히스토리 2턴 + 현재 질문 = 3개, 순서 유지.
    expect(body.contents).toHaveLength(3);
    expect(body.contents[0]?.role).toBe("user");
    expect(body.contents[0]?.parts[0]?.text).toBe("지금 누가 선두야?");
    // Gemini 는 assistant 대신 model 을 쓴다.
    expect(body.contents[1]?.role).toBe("model");
    expect(body.contents[1]?.parts[0]?.text).not.toContain("Current race data");
    expect(body.contents[2]?.role).toBe("user");
    expect(body.contents[2]?.parts[0]?.text).toContain("Current race data");
  });
});

describe("GeminiProvider 오류 처리", () => {
  it("HTTP 오류는 예외를 던진다", async () => {
    const failing: GeminiFetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    await expect(askWith(failing)).rejects.toThrow("Gemini request failed: 429");
  });

  it("404 메시지에 상태 코드·모델 이름·Google 에러 메시지가 모두 담긴다", async () => {
    const notFound: GeminiFetch = async () => ({
      ok: false,
      status: 404,
      json: async () => ({
        error: {
          message:
            "models/gemini-2.5-flash is not found for API version v1beta",
          status: "NOT_FOUND",
        },
      }),
    });

    const message = await askWith(notFound, {
      model: "models/gemini-2.5-flash",
    }).then(
      () => "no error thrown",
      (error: Error) => error.message,
    );

    expect(message).toContain("404");
    expect(message).toContain("gemini-2.5-flash");
    expect(message).toContain("NOT_FOUND");
    expect(message).toContain("is not found for API version v1beta");
  });

  it("오류 본문이 JSON 이 아니어도 상태 코드·모델 이름은 남는다", async () => {
    const htmlError: GeminiFetch = async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    });

    const message = await askWith(htmlError, {
      model: "gemini-2.5-flash-lite",
    }).then(
      () => "no error thrown",
      (error: Error) => error.message,
    );

    expect(message).toContain("502");
    expect(message).toContain("gemini-2.5-flash-lite");
    expect(message).not.toContain("Unexpected token");
  });

  it("오류 메시지에 API 키가 노출되지 않는다", async () => {
    const secretKey = "AIzaSy-SUPER-SECRET-TEST-KEY-0000";
    const failing: GeminiFetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: { message: "API key not valid", status: "PERMISSION_DENIED" },
      }),
    });

    const message = await askWith(failing, {
      apiKey: secretKey,
      baseUrl: `https://proxy.example.com/v1beta?key=${secretKey}`,
    }).then(
      () => "no error thrown",
      (error: Error) => error.message,
    );

    expect(message).toContain("403");
    expect(message).not.toContain(secretKey);
  });

  it("candidates 가 비어 있으면 예외를 던진다", async () => {
    await expect(askWith(makeRawFetch({ candidates: [] }))).rejects.toThrow(
      "no candidates",
    );
  });

  it("candidates 자체가 없으면 예외를 던진다", async () => {
    // 안전 필터로 차단된 응답은 promptFeedback 만 담겨 온다.
    await expect(
      askWith(makeRawFetch({ promptFeedback: { blockReason: "SAFETY" } })),
    ).rejects.toThrow("no candidates");
  });

  it("content.parts 가 없으면 예외를 던진다", async () => {
    await expect(
      askWith(makeRawFetch({ candidates: [{ finishReason: "MAX_TOKENS" }] })),
    ).rejects.toThrow("no content parts");
  });

  it("parts 에 text 가 하나도 없으면 예외를 던진다", async () => {
    await expect(
      askWith(
        makeRawFetch({
          candidates: [{ content: { parts: [{ inlineData: {} }] } }],
        }),
      ),
    ).rejects.toThrow("no text part");
  });
});

// Gemini 3.x 는 사고 토큰이 maxOutputTokens 를 잠식해, 끄지 않으면 짧은 예산에서 본문이 비어 나온다.
// 빈 문자열은 예외가 아니라 폴백도 타지 않으므로 세 경로 모두 사고가 꺼져 있어야 한다.
describe("GeminiProvider generationConfig", () => {
  type Config = {
    temperature: number;
    maxOutputTokens: number;
    thinkingConfig: { thinkingBudget: number };
  };

  const configOf = (call: Call | undefined): Config => {
    const body = JSON.parse(call?.body ?? "{}") as {
      generationConfig: Config;
    };

    return body.generationConfig;
  };

  it("질문 경로는 사고를 끄고 기존 예산을 유지한다", async () => {
    const { fetchImpl, calls } = makeFetch('{"answer":"ok"}');

    await askWith(fetchImpl);

    const config = configOf(calls[0]);

    expect(config.thinkingConfig.thinkingBudget).toBe(0);
    expect(config.temperature).toBe(0.3);
    expect(config.maxOutputTokens).toBe(300);
  });

  // 예산이 120 으로 가장 빡빡해 사고를 켜두면 확실히 비어 나오는 경로.
  it("해설 경로는 사고를 끄고 기존 예산을 유지한다", async () => {
    const { fetchImpl, calls } = makeFetch("Safety Car bunches the field.");
    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
    });

    await provider.generateCommentary({
      event: frame.events[0]!,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    const config = configOf(calls[0]);

    expect(config.thinkingConfig.thinkingBudget).toBe(0);
    expect(config.temperature).toBe(0.3);
    expect(config.maxOutputTokens).toBe(120);
  });

  it("요약 경로는 사고를 끄고 기존 예산을 유지한다", async () => {
    const { fetchImpl, calls } = makeFetch("VER won the race.");
    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
    });

    await provider.generateSummary({
      summary: {
        sessionId: frame.snapshot.sessionId,
        sessionName: frame.snapshot.sessionName,
        winnerDriverNumber: 1,
        podiumDriverNumbers: [1, 4, 16],
        fastestLapDriverNumber: 1,
        totalOvertakes: 12,
        totalPitStops: 20,
        retiredDriverNumbers: [],
        keyMoments: [],
      },
      snapshot: frame.snapshot,
      locale: SupportedLocale.En,
    });

    const config = configOf(calls[0]);

    expect(config.thinkingConfig.thinkingBudget).toBe(0);
    expect(config.temperature).toBe(0.3);
    expect(config.maxOutputTokens).toBe(200);
  });
});

describe("GeminiProvider.generateCommentary/Summary", () => {
  it("해설은 이벤트를 컨텍스트로 텍스트를 반환하고 isMock 을 붙이지 않는다", async () => {
    const { fetchImpl, calls } = makeFetch("Safety Car bunches the field.");
    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
    });
    const event = frame.events[0]!;

    const result = await provider.generateCommentary({
      event,
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
    });

    expect(result.sourceEventId).toBe(event.id);
    expect(result.text).toBe("Safety Car bunches the field.");
    // 실제 provider 응답에는 isMock 이 없다 (MockLlmProvider 만 표시한다).
    expect(result.isMock).toBeUndefined();
    expect(calls[0]?.body).toContain(event.type);
  });

  it("요약은 사실만 담아 호출하고 텍스트를 트림한다", async () => {
    const { fetchImpl, calls } = makeFetch("  VER won the race.  ");
    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
    });

    const result = await provider.generateSummary({
      summary: {
        sessionId: frame.snapshot.sessionId,
        sessionName: frame.snapshot.sessionName,
        winnerDriverNumber: 1,
        podiumDriverNumbers: [1, 4, 16],
        fastestLapDriverNumber: 1,
        totalOvertakes: 12,
        totalPitStops: 20,
        retiredDriverNumbers: [],
        keyMoments: [],
      },
      snapshot: frame.snapshot,
      locale: SupportedLocale.En,
    });

    expect(result.text).toBe("VER won the race.");

    const body = JSON.parse(calls[0]?.body ?? "{}") as {
      generationConfig: { maxOutputTokens: number };
    };

    expect(body.generationConfig.maxOutputTokens).toBe(200);
  });
});
