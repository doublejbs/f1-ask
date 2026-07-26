import { describe, expect, it, vi } from "vitest";
import { GeminiFetch, GeminiProvider } from "../src/ai/GeminiProvider";
import {
  createDriverEventsExecutor,
  QUERY_DRIVER_EVENTS_TOOL_NAME,
} from "../src/ai/QuestionTools";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventParams } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SupportedLocale } from "../src/SupportedLocale";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

type Call = { url: string; body: string };

// 스크립트의 한 라운드 응답: 텍스트(최종 답), 함수 호출, 또는 응답 part 원형(parts).
// parts 변형은 Gemini 3.x 가 실제로 주는 형태(thoughtSignature 형제 키, functionCall.id,
// 병렬 호출)를 그대로 흉내 내기 위한 것이다.
type ScriptedResponse =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { parts: Record<string, unknown>[] };

// 라운드별 응답을 순서대로 돌려주는 fake fetch. 스크립트 끝에 도달하면 마지막 응답을 반복한다.
const makeScriptedFetch = (
  responses: ScriptedResponse[],
): { fetchImpl: GeminiFetch; calls: Call[] } => {
  const calls: Call[] = [];
  let index = 0;

  const fetchImpl: GeminiFetch = async (url, init) => {
    calls.push({ url, body: init.body });

    const response = responses[Math.min(index, responses.length - 1)]!;

    index += 1;

    const toParts = (): unknown[] => {
      if ("text" in response) {
        return [{ text: response.text }];
      }

      if ("parts" in response) {
        return response.parts;
      }

      return [{ functionCall: response.functionCall }];
    };

    const parts = toParts();

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { role: "model", parts } }],
      }),
    };
  };

  return { fetchImpl, calls };
};

const makeEvent = (fields: {
  id: string;
  type: RaceEventType;
  driverNumber?: number;
  lapNumber?: number;
  params?: RaceEventParams;
}): RaceEvent => ({
  schemaVersion: 1,
  id: fields.id,
  sessionId: "session-belgium",
  type: fields.type,
  priority: RaceEventPriority.Medium,
  ...(fields.driverNumber === undefined
    ? {}
    : { driverNumber: fields.driverNumber }),
  ...(fields.lapNumber === undefined ? {} : { lapNumber: fields.lapNumber }),
  timestamp: "2026-07-19T05:10:00.000Z",
  params: fields.params ?? {},
  deduplicationKey: fields.id,
});

// 44 번의 5랩 피트(오래된 이벤트)를 맨 앞에 두고, 뒤에 40건 넘는 필러를 쌓는다.
// 이러면 그 피트는 "최근 40건" 창 밖으로 밀린다 — 툴이 전체 이력에서 그것을 되찾는지 본다.
const buildEventsWithOldPit = (): RaceEvent[] => {
  const events: RaceEvent[] = [
    makeEvent({
      id: "pit-44-lap5",
      type: RaceEventType.PitStop,
      driverNumber: 44,
      lapNumber: 5,
      params: { durationSeconds: 2.4 },
    }),
  ];

  for (let i = 0; i < 45; i += 1) {
    events.push(
      makeEvent({
        id: `filler-${i}`,
        type: RaceEventType.Overtake,
        driverNumber: 1,
      }),
    );
  }

  return events;
};

const askWithTools = async (
  fetchImpl: GeminiFetch,
  events: RaceEvent[],
  question = "VER pitted on which lap?",
) => {
  const provider = new GeminiProvider({
    apiKey: "gemini-test-key",
    fetchImpl,
    // 팩토리는 요청마다 executor 를 만든다 — 테스트는 고정 이벤트로 만든 executor 를 그대로 돌려준다.
    toolExecutorFactory: () => createDriverEventsExecutor(events),
  });

  return provider.answerQuestion({
    question,
    locale: SupportedLocale.En,
    explanationLevel: ExplanationLevel.Standard,
    snapshot: frame.snapshot,
    recentEvents: frame.events,
    favoriteDriverNumbers: [],
  });
};

describe("GeminiProvider 툴 루프", () => {
  it("툴 1회 호출 후 최종 답을 만든다 (functionResponse 를 되돌려 싣는다)", async () => {
    const events = buildEventsWithOldPit();
    const { fetchImpl, calls } = makeScriptedFetch([
      {
        functionCall: {
          name: QUERY_DRIVER_EVENTS_TOOL_NAME,
          args: { driverNumber: 44, types: ["pit_stop"] },
        },
      },
      {
        text: JSON.stringify({
          answer: "HAM pitted on lap 5.",
          confidence: "high",
          insufficientData: false,
          referencedDriverNumbers: [44],
        }),
      },
    ]);

    const result = await askWithTools(fetchImpl, events);

    // (a) 두 번의 왕복: 1라운드 함수호출 → 2라운드 최종 텍스트.
    expect(calls).toHaveLength(2);

    // (b) 2번째 요청 body 에 functionResponse part 가 user 롤로 실린다.
    const secondBody = JSON.parse(calls[1]!.body) as {
      contents: {
        role: string;
        parts: {
          functionCall?: { name: string };
          functionResponse?: {
            name: string;
            response: { result?: unknown };
          };
        }[];
      }[];
    };

    // 대화 = [질문(user), 함수호출(model), 함수응답(user)].
    expect(secondBody.contents).toHaveLength(3);
    expect(secondBody.contents[1]!.role).toBe("model");
    expect(secondBody.contents[1]!.parts[0]!.functionCall?.name).toBe(
      QUERY_DRIVER_EVENTS_TOOL_NAME,
    );

    const responseTurn = secondBody.contents[2]!;

    expect(responseTurn.role).toBe("user");

    const functionResponse = responseTurn.parts[0]!.functionResponse!;

    expect(functionResponse.name).toBe(QUERY_DRIVER_EVENTS_TOOL_NAME);

    // (c) executor 가 전체 이력을 조회해 "40건 밖" 5랩 피트를 실제로 되찾았다.
    const returned = functionResponse.response.result as {
      type: string;
      driverNumber: number;
      lapNumber: number;
    }[];

    expect(returned).toHaveLength(1);
    expect(returned[0]!.type).toBe("pit_stop");
    expect(returned[0]!.driverNumber).toBe(44);
    expect(returned[0]!.lapNumber).toBe(5);

    // (d) 최종 LlmAnswer 가 정확하다.
    expect(result.answer).toBe("HAM pitted on lap 5.");
    expect(result.confidence).toBe("high");
    expect(result.referencedDriverNumbers).toEqual([44]);
  });

  it("라운드 캡에서 강제 종료한다 (무한 루프 없음)", async () => {
    const { fetchImpl, calls } = makeScriptedFetch([
      // 라운드 1: 함수호출.
      {
        functionCall: {
          name: QUERY_DRIVER_EVENTS_TOOL_NAME,
          args: { driverNumber: 44 },
        },
      },
      // 라운드 2: 함수호출.
      {
        functionCall: {
          name: QUERY_DRIVER_EVENTS_TOOL_NAME,
          args: { driverNumber: 44 },
        },
      },
      // 라운드 3: 함수호출.
      {
        functionCall: {
          name: QUERY_DRIVER_EVENTS_TOOL_NAME,
          args: { driverNumber: 44 },
        },
      },
      // 강제 최종(tools 없음): 텍스트.
      { text: '{"answer":"Forced answer"}' },
    ]);

    const executor = vi.fn(createDriverEventsExecutor(buildEventsWithOldPit()));

    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
      toolExecutorFactory: () => executor,
    });

    const result = await provider.answerQuestion({
      question: "loop please",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    // MAX_TOOL_ROUNDS(3) 라운드 + tools 없는 강제 최종 1회 = 4회로 멈춘다. 무한 반복 없음.
    expect(calls).toHaveLength(4);

    // 마지막(4번째) 요청은 tools 를 빼서 모델이 답할 수밖에 없게 한다.
    const forcedBody = JSON.parse(calls[3]!.body) as { tools?: unknown };

    expect(forcedBody.tools).toBeUndefined();

    // 예외 없이 답이 반환된다.
    expect(result).toBeDefined();
    expect(result.answer).toBe("Forced answer");
    expect(result.snapshotVersion).toBe(frame.snapshot.version);
  });

  it("오발동 억제 규칙을 시스템 프롬프트에 넣는다", async () => {
    const { fetchImpl, calls } = makeScriptedFetch([
      { text: '{"answer":"VER leads."}' },
    ]);

    await askWithTools(fetchImpl, buildEventsWithOldPit(), "Who is leading?");

    const body = JSON.parse(calls[0]!.body) as {
      systemInstruction: { parts: { text: string }[] };
      tools: unknown;
    };

    // 툴을 열되 "이미 실린 데이터로 답되면 쓰지 말라"를 못 박는다.
    expect(body.systemInstruction.parts[0]!.text).toContain(
      "Do NOT call a tool",
    );

    // 규정·서킷은 결정론이 안 지켜주므로(docs/26 R5) 큐레이션 결과만 인용하게 못 박는다.
    expect(body.systemInstruction.parts[0]!.text).toContain(
      "cite ONLY what it returns",
    );

    // 툴 자체는 요청에 실린다(functionDeclarations).
    expect(body.tools).toBeDefined();
  });

  it("툴이 열렸을 때 functionDeclarations 로 queryDriverEvents 가 실린다", async () => {
    const { fetchImpl, calls } = makeScriptedFetch([
      { text: '{"answer":"ok"}' },
    ]);

    await askWithTools(fetchImpl, buildEventsWithOldPit());

    const body = JSON.parse(calls[0]!.body) as {
      tools: {
        functionDeclarations: {
          name: string;
          parameters: { type: string; properties: Record<string, unknown> };
        }[];
      }[];
    };

    const declarations = body.tools[0]!.functionDeclarations;
    const declaration = declarations[0]!;

    // 지식 툴도 같은 wire 로 함께 실린다 (docs/26 §툴 세트 최소 2개).
    expect(declarations.map((item) => item.name)).toContain(
      "lookupF1Knowledge",
    );
    expect(declaration.name).toBe(QUERY_DRIVER_EVENTS_TOOL_NAME);
    expect(declaration.parameters.type).toBe("object");
    expect(Object.keys(declaration.parameters.properties)).toContain(
      "driverNumber",
    );
    expect(Object.keys(declaration.parameters.properties)).toContain("types");
  });
});

// 되돌린 model 턴의 part 들을 꺼낸다 (요청 body → contents 중 model 롤).
type WireParts = {
  text?: string;
  functionCall?: { name: string; args?: unknown; id?: string };
  functionResponse?: { name: string; id?: string; response: unknown };
  thoughtSignature?: string;
}[];

const modelTurnParts = (body: string): WireParts => {
  const parsed = JSON.parse(body) as {
    contents: { role: string; parts: WireParts }[];
  };

  return parsed.contents.find(
    (content) =>
      content.role === "model" &&
      content.parts.some((part) => part.functionCall !== undefined),
  )!.parts;
};

const functionResponseParts = (body: string): WireParts => {
  const parsed = JSON.parse(body) as {
    contents: { role: string; parts: WireParts }[];
  };

  return parsed.contents.find((content) =>
    content.parts.some((part) => part.functionResponse !== undefined),
  )!.parts;
};

describe("GeminiProvider thoughtSignature 보존", () => {
  it("functionCall 앞의 text part 와 그 서명까지 통째로 되돌린다", async () => {
    // 이 테스트가 content 통째 되돌리기(정본 패턴)의 존재 이유다. functionCall part 만
    // 골라 담으면 선행 text part 와 거기 붙은 서명이 사라져 같은 클래스의 400 이 남는다.
    const { fetchImpl, calls } = makeScriptedFetch([
      {
        parts: [
          { text: "확인해볼게요", thoughtSignature: "sig-on-text" },
          {
            functionCall: {
              name: QUERY_DRIVER_EVENTS_TOOL_NAME,
              args: { driverNumber: 44, types: ["pit_stop"] },
              id: "call-with-preamble",
            },
            thoughtSignature: "sig-on-call",
          },
        ],
      },
      { text: '{"answer":"HAM pitted on lap 5."}' },
    ]);

    await askWithTools(fetchImpl, buildEventsWithOldPit());

    const parts = modelTurnParts(calls[1]!.body);

    // 두 part 가 **각자의 서명과 함께** 순서 그대로 실린다.
    expect(parts).toHaveLength(2);
    expect(parts[0]!.text).toBe("확인해볼게요");
    expect(parts[0]!.thoughtSignature).toBe("sig-on-text");
    expect(parts[1]!.thoughtSignature).toBe("sig-on-call");
    expect(parts[1]!.functionCall!.id).toBe("call-with-preamble");
    expect(parts[1]!.functionCall!.name).toBe(QUERY_DRIVER_EVENTS_TOOL_NAME);

    // 텍스트가 함께 왔어도 툴 호출은 정상 실행되어 결과가 되돌아간다.
    const responses = functionResponseParts(calls[1]!.body);

    expect(responses[0]!.functionResponse!.id).toBe("call-with-preamble");
  });

  it("args 없는 functionCall 은 원형 그대로 되돌리고 executor 에는 {} 로 넘긴다", async () => {
    const { fetchImpl, calls } = makeScriptedFetch([
      {
        parts: [
          {
            functionCall: { name: QUERY_DRIVER_EVENTS_TOOL_NAME, id: "no-args" },
            thoughtSignature: "sig-no-args",
          },
        ],
      },
      { text: '{"answer":"done"}' },
    ]);

    const executor = vi.fn(async () => []);

    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
      toolExecutorFactory: () => executor,
    });

    await provider.answerQuestion({
      question: "VER pitted on which lap?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    const parts = modelTurnParts(calls[1]!.body);

    // 되돌린 본문은 원형이다 — args 키를 우리가 새로 만들어 넣지 않는다.
    expect(Object.keys(parts[0]!.functionCall!)).toEqual(["name", "id"]);
    expect(parts[0]!.thoughtSignature).toBe("sig-no-args");

    // executor 에는 정규화된 빈 인자가 전달된다.
    expect(executor).toHaveBeenCalledWith(QUERY_DRIVER_EVENTS_TOOL_NAME, {});
  });

  it("모델 턴을 되돌릴 때 thoughtSignature 와 functionCall.id 를 그대로 싣는다", async () => {
    // Gemini 3.x 실제 응답 형태: thoughtSignature 는 functionCall 의 **형제 키**다.
    const signature = "EjQKMgERTTIP2OQdj5hmd1jdP9tEISPdU+NdGwZm";
    const { fetchImpl, calls } = makeScriptedFetch([
      {
        parts: [
          {
            functionCall: {
              name: QUERY_DRIVER_EVENTS_TOOL_NAME,
              args: { driverNumber: 44, types: ["pit_stop"] },
              id: "g7dnyyhj",
            },
            thoughtSignature: signature,
          },
        ],
      },
      { text: '{"answer":"HAM pitted on lap 5."}' },
    ]);

    await askWithTools(fetchImpl, buildEventsWithOldPit());

    const parts = modelTurnParts(calls[1]!.body);

    // 이 두 단언이 회귀 가드다. 빠지면 Gemini 가 400 을 던진다:
    // "Function call is missing a thought_signature in functionCall parts".
    expect(parts).toHaveLength(1);
    expect(parts[0]!.thoughtSignature).toBe(signature);
    expect(parts[0]!.functionCall!.id).toBe("g7dnyyhj");
    expect(parts[0]!.functionCall!.name).toBe(QUERY_DRIVER_EVENTS_TOOL_NAME);
    expect(parts[0]!.functionCall!.args).toEqual({
      driverNumber: 44,
      types: ["pit_stop"],
    });

    // functionResponse 는 같은 id 로 짝지어 되돌린다 (병렬 호출 매칭).
    const responses = functionResponseParts(calls[1]!.body);

    expect(responses[0]!.functionResponse!.id).toBe("g7dnyyhj");
  });

  it("병렬 functionCall 은 각 part 의 thoughtSignature 를 각자 유지한다", async () => {
    const { fetchImpl, calls } = makeScriptedFetch([
      {
        parts: [
          {
            functionCall: {
              name: QUERY_DRIVER_EVENTS_TOOL_NAME,
              args: { driverNumber: 44 },
              id: "call-a",
            },
            thoughtSignature: "signature-a",
          },
          {
            functionCall: {
              name: QUERY_DRIVER_EVENTS_TOOL_NAME,
              args: { driverNumber: 1 },
              id: "call-b",
            },
            thoughtSignature: "signature-b",
          },
        ],
      },
      { text: '{"answer":"done"}' },
    ]);

    await askWithTools(fetchImpl, buildEventsWithOldPit());

    const parts = modelTurnParts(calls[1]!.body);

    expect(parts).toHaveLength(2);
    expect(parts.map((part) => part.thoughtSignature)).toEqual([
      "signature-a",
      "signature-b",
    ]);
    expect(parts.map((part) => part.functionCall!.id)).toEqual([
      "call-a",
      "call-b",
    ]);

    // 응답도 호출 순서대로 각자의 id 를 달고 되돌아간다.
    const responses = functionResponseParts(calls[1]!.body);

    expect(responses.map((part) => part.functionResponse!.id)).toEqual([
      "call-a",
      "call-b",
    ]);
  });

  it("thoughtSignature·id 가 없는 응답이면 그 키 없이 되돌린다 (구 모델·mock 안전)", async () => {
    const { fetchImpl, calls } = makeScriptedFetch([
      {
        functionCall: {
          name: QUERY_DRIVER_EVENTS_TOOL_NAME,
          args: { driverNumber: 44 },
        },
      },
      { text: '{"answer":"done"}' },
    ]);

    await askWithTools(fetchImpl, buildEventsWithOldPit());

    const parts = modelTurnParts(calls[1]!.body);

    expect(parts).toHaveLength(1);
    expect(Object.keys(parts[0]!)).toEqual(["functionCall"]);
    expect(Object.keys(parts[0]!.functionCall!)).toEqual(["name", "args"]);

    const responses = functionResponseParts(calls[1]!.body);

    expect(Object.keys(responses[0]!.functionResponse!)).toEqual([
      "name",
      "response",
    ]);
  });
});

describe("GeminiProvider 툴 하위호환", () => {
  const makeTextFetch = (
    text: string,
  ): { fetchImpl: GeminiFetch; calls: Call[] } => {
    const calls: Call[] = [];

    const fetchImpl: GeminiFetch = async (url, init) => {
      calls.push({ url, body: init.body });

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

  it("toolExecutor 미주입 시 요청 body 에 tools 필드가 없다", async () => {
    const { fetchImpl, calls } = makeTextFetch('{"answer":"VER leads."}');
    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
    });

    const result = await provider.answerQuestion({
      question: "Who is leading?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    const body = JSON.parse(calls[0]!.body) as {
      tools?: unknown;
      systemInstruction: { parts: { text: string }[] };
    };

    // 단발 경로: tools 도, 오발동 억제 규칙도 없어야 기존과 바이트 동일하다.
    expect(body.tools).toBeUndefined();
    expect(body.systemInstruction.parts[0]!.text).not.toContain(
      "Do NOT call a tool",
    );
    expect(body.systemInstruction.parts[0]!.text).not.toContain(
      "lookupF1Knowledge",
    );
    expect(calls).toHaveLength(1);
    expect(result.answer).toBe("VER leads.");
  });
});

describe("GeminiProvider JSON 파싱 (마크다운·산문 처리)", () => {
  const makeJsonFetch = (
    text: string,
  ): { fetchImpl: GeminiFetch; calls: Call[] } => {
    const calls: Call[] = [];

    const fetchImpl: GeminiFetch = async (url, init) => {
      calls.push({ url, body: init.body });

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

  const makeNoToolProvider = (
    fetchImpl: GeminiFetch,
  ): GeminiProvider => {
    return new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
    });
  };

  it("펜스 없는 순수 JSON 은 기존대로 파싱한다 (회귀)", async () => {
    const jsonText = JSON.stringify({
      answer: "Pure JSON without fences.",
      confidence: "high",
      insufficientData: false,
      referencedDriverNumbers: [44],
    });
    const { fetchImpl } = makeJsonFetch(jsonText);
    const provider = makeNoToolProvider(fetchImpl);

    const result = await provider.answerQuestion({
      question: "Test?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(result.answer).toBe("Pure JSON without fences.");
    expect(result.confidence).toBe("high");
    expect(result.referencedDriverNumbers).toEqual([44]);
  });

  it("```json 펜스로 감싼 JSON 을 파싱한다 (fenced with language tag)", async () => {
    const jsonText = `\`\`\`json
{"answer": "HAM(해밀턴)은 9랩에 충돌을 유발한 혐의로 5초 페널티를 받았습니다.", "confidence": "high", "insufficientData": false, "referencedDriverNumbers": [44]}
\`\`\``;
    const { fetchImpl } = makeJsonFetch(jsonText);
    const provider = makeNoToolProvider(fetchImpl);

    const result = await provider.answerQuestion({
      question: "Test?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(result.answer).toBe(
      "HAM(해밀턴)은 9랩에 충돌을 유발한 혐의로 5초 페널티를 받았습니다.",
    );
    expect(result.confidence).toBe("high");
    expect(result.referencedDriverNumbers).toEqual([44]);
  });

  it("``` 펜스로 감싼 JSON 을 파싱한다 (언어 태그 없음)", async () => {
    const jsonText = `\`\`\`
{"answer": "Fenced without language tag.", "confidence": "medium", "insufficientData": false, "referencedDriverNumbers": [1]}
\`\`\``;
    const { fetchImpl } = makeJsonFetch(jsonText);
    const provider = makeNoToolProvider(fetchImpl);

    const result = await provider.answerQuestion({
      question: "Test?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(result.answer).toBe("Fenced without language tag.");
    expect(result.confidence).toBe("medium");
    expect(result.referencedDriverNumbers).toEqual([1]);
  });

  it("펜스 앞뒤 공백·개행을 허용한다", async () => {
    const jsonText = `
  \`\`\`json
  {"answer": "Whitespace handling.", "confidence": "low", "insufficientData": true, "referencedDriverNumbers": []}
  \`\`\`
  `;
    const { fetchImpl } = makeJsonFetch(jsonText);
    const provider = makeNoToolProvider(fetchImpl);

    const result = await provider.answerQuestion({
      question: "Test?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(result.answer).toBe("Whitespace handling.");
    expect(result.confidence).toBe("low");
    expect(result.insufficientData).toBe(true);
  });

  it("앞뒤 산문 + JSON 에서 중괄호 범위를 추출해 파싱한다", async () => {
    const jsonText =
      'Here is the response for you: {"answer": "From prose extraction.", "confidence": "high", "insufficientData": false, "referencedDriverNumbers": [33]} I hope this helps!';
    const { fetchImpl } = makeJsonFetch(jsonText);
    const provider = makeNoToolProvider(fetchImpl);

    const result = await provider.answerQuestion({
      question: "Test?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    expect(result.answer).toBe("From prose extraction.");
    expect(result.confidence).toBe("high");
    expect(result.referencedDriverNumbers).toEqual([33]);
  });

  it("파싱 완전 실패하면 content 전체를 answer 로 폴백한다", async () => {
    const invalidText = "This is not JSON at all, just plain text.";
    const { fetchImpl } = makeJsonFetch(invalidText);
    const provider = makeNoToolProvider(fetchImpl);

    const result = await provider.answerQuestion({
      question: "Test?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    // safeJson 이 null 을 반환하면 toAnswer 폴백이 content.trim() 을 answer 로 사용한다.
    expect(result.answer).toBe(invalidText);
  });
});

describe("createDriverEventsExecutor", () => {
  it("args 를 DriverEventQuery 로 매핑해 조회한다", async () => {
    const executor = createDriverEventsExecutor(buildEventsWithOldPit());

    const result = (await executor(QUERY_DRIVER_EVENTS_TOOL_NAME, {
      driverNumber: 44,
      types: ["pit_stop"],
    })) as { type: string; lapNumber: number }[];

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("pit_stop");
    expect(result[0]!.lapNumber).toBe(5);
  });

  it("잘못된 타입 args 는 안전하게 무시한다 (필터 없음으로 처리)", async () => {
    const executor = createDriverEventsExecutor(buildEventsWithOldPit());

    // driverNumber 가 문자열, types 가 배열이 아니고, lapFrom 이 숫자가 아니다.
    const result = (await executor(QUERY_DRIVER_EVENTS_TOOL_NAME, {
      driverNumber: "forty-four",
      types: "pit_stop",
      lapFrom: "early",
    })) as unknown[];

    // 크래시 없이 전체(필터 미적용)를 반환한다.
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("유효하지 않은 이벤트 타입은 걸러내고 유효한 것만 남긴다", async () => {
    const executor = createDriverEventsExecutor(buildEventsWithOldPit());

    const result = (await executor(QUERY_DRIVER_EVENTS_TOOL_NAME, {
      driverNumber: 44,
      types: ["pit_stop", "not_a_real_type"],
    })) as { type: string }[];

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("pit_stop");
  });

  it("모르는 툴 이름은 빈 배열로 안전 처리한다", async () => {
    const executor = createDriverEventsExecutor(buildEventsWithOldPit());

    const result = await executor("unknownTool", { driverNumber: 44 });

    expect(result).toEqual([]);
  });
});

describe("GeminiProvider 에러 처리", () => {
  it("executor 가 throw 해도 루프가 죽지 않고 error 페이로드를 functionResponse 로 되돌린다", async () => {
    const { fetchImpl, calls } = makeScriptedFetch([
      {
        functionCall: {
          name: QUERY_DRIVER_EVENTS_TOOL_NAME,
          args: { driverNumber: 44 },
        },
      },
      {
        text: JSON.stringify({
          answer: "Could not retrieve pit data.",
          confidence: "low",
          insufficientData: true,
          referencedDriverNumbers: [],
        }),
      },
    ]);

    // executor 가 항상 throw 하는 버전.
    const throwingExecutor = vi.fn(async () => {
      throw new Error("Database connection failed");
    });

    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
      toolExecutorFactory: () => throwingExecutor,
    });

    const result = await provider.answerQuestion({
      question: "VER pitted on which lap?",
      locale: SupportedLocale.En,
      explanationLevel: ExplanationLevel.Standard,
      snapshot: frame.snapshot,
      recentEvents: frame.events,
      favoriteDriverNumbers: [],
    });

    // (a) 루프가 죽지 않고 답까지 나온다.
    expect(result).toBeDefined();
    expect(result.answer).toBe("Could not retrieve pit data.");

    // (b) 2번의 왕복이 있다 (함수호출 1라운드 + 최종 1라운드).
    expect(calls).toHaveLength(2);

    // (c) 2번째 요청에 functionResponse 가 있고, 그 response 에 error 필드가 있다.
    const secondBody = JSON.parse(calls[1]!.body) as {
      contents: {
        role: string;
        parts: {
          functionResponse?: {
            name: string;
            response: { error?: string };
          };
        }[];
      }[];
    };

    const responseTurn = secondBody.contents.find(
      (c) => c.role === "user" && c.parts.some((p) => p.functionResponse),
    )!;

    expect(responseTurn).toBeDefined();

    const errorResponse = responseTurn.parts[0]!.functionResponse!;

    expect(errorResponse.response.error).toBe("Database connection failed");

    // executor 가 호출됐다.
    expect(throwingExecutor).toHaveBeenCalled();
  });

  it("runToolLoop 최종 라운드에서 빈 텍스트가 나오면 throw 한다", async () => {
    const { fetchImpl } = makeScriptedFetch([
      {
        // 함수호출 없이 빈 텍스트만.
        text: "",
      },
    ]);

    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
      toolExecutorFactory: () => createDriverEventsExecutor(buildEventsWithOldPit()),
    });

    await expect(
      provider.answerQuestion({
        question: "Who is leading?",
        locale: SupportedLocale.En,
        explanationLevel: ExplanationLevel.Standard,
        snapshot: frame.snapshot,
        recentEvents: frame.events,
        favoriteDriverNumbers: [],
      }),
    ).rejects.toThrow("Gemini response has no text part");
  });

  it("runToolLoop 중간 라운드에서 빈 텍스트 + 함수호출 없음이면 throw 한다", async () => {
    const { fetchImpl } = makeScriptedFetch([
      {
        // MAX_TOOL_ROUNDS 라운드에서 함수호출 없고 텍스트도 빈 경우.
        text: "",
      },
    ]);

    const provider = new GeminiProvider({
      apiKey: "gemini-test-key",
      fetchImpl,
      toolExecutorFactory: () => createDriverEventsExecutor(buildEventsWithOldPit()),
    });

    await expect(
      provider.answerQuestion({
        question: "Who is leading?",
        locale: SupportedLocale.En,
        explanationLevel: ExplanationLevel.Standard,
        snapshot: frame.snapshot,
        recentEvents: frame.events,
        favoriteDriverNumbers: [],
      }),
    ).rejects.toThrow("Gemini response has no text part");
  });
});
