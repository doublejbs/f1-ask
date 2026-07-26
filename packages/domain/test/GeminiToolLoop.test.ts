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

// 스크립트의 한 라운드 응답: 텍스트(최종 답) 또는 함수 호출.
type ScriptedResponse =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } };

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

    const parts =
      "text" in response
        ? [{ text: response.text }]
        : [{ functionCall: response.functionCall }];

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
