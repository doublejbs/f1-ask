import { describe, expect, it } from "vitest";
import { ClaudeFetch, ClaudeProvider } from "../src/ai/ClaudeProvider";
import { GeminiFetch, GeminiProvider } from "../src/ai/GeminiProvider";
import { OpenAiFetch, OpenAiProvider } from "../src/ai/OpenAiProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SupportedLocale } from "../src/SupportedLocale";

// 세 provider(Claude·Gemini·OpenAI)가 같은 선별(selectQuestionEvents)을 쓰는지 검증한다.
//
// 왜 provider 로 돌리나: 선별 함수 자체는 QuestionEventSelection.test.ts 가 검증한다.
// 여기서는 세 provider 가 **각자** 그 함수를 통과시키는지 — 즉 예전처럼 slice(-8) 이
// 남지 않았는지 — 를 실제 요청 본문으로 확인한다. 8 을 40 으로만 바꿨다면 여전히
// overtake 가 창을 밀어냈을 것이므로, 이 테스트가 그 회귀를 잡는다.

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

// 소음(overtake)이 최신 8칸을 다 차지하고 pit_stop 은 그 앞(오래된 쪽)에 있는 목록.
// 예전 slice(-8) 이면 overtake 만 남고 pit_stop 은 밀렸다. 선별이 걸리면 반대가 된다.
const buildNoisyEvents = (): RaceEvent[] => {
  const events: RaceEvent[] = [];

  // 오래된 쪽: pit_stop 2건 (화이트리스트 통과 대상).
  for (let i = 0; i < 2; i += 1) {
    events.push({
      schemaVersion: 1,
      id: `pit:${i}`,
      sessionId: "test",
      type: RaceEventType.PitStop,
      priority: RaceEventPriority.High,
      timestamp: `2026-07-19T13:0${i}:00.000Z`,
      params: {},
      deduplicationKey: `pit:${i}`,
    });
  }

  // 최신 쪽: overtake 10건 (소음, 배제 대상).
  for (let i = 0; i < 10; i += 1) {
    events.push({
      schemaVersion: 1,
      id: `ot:${i}`,
      sessionId: "test",
      type: RaceEventType.Overtake,
      priority: RaceEventPriority.High,
      timestamp: `2026-07-19T13:3${i}:00.000Z`,
      params: {},
      deduplicationKey: `ot:${i}`,
    });
  }

  return events;
};

const captureClaudeBody = async (
  recentEvents: RaceEvent[],
): Promise<string> => {
  let body = "";
  const fetchImpl: ClaudeFetch = async (_url, init) => {
    body = init.body;

    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: '{"answer":"ok"}' }] }),
    };
  };

  const provider = new ClaudeProvider({ apiKey: "sk-ant-test", fetchImpl });

  await provider.answerQuestion({
    question: "피트 상황 알려줘",
    locale: SupportedLocale.Ko,
    explanationLevel: ExplanationLevel.Standard,
    snapshot: frame.snapshot,
    recentEvents,
    favoriteDriverNumbers: [],
  });

  return body;
};

const captureGeminiBody = async (
  recentEvents: RaceEvent[],
): Promise<string> => {
  let body = "";
  const fetchImpl: GeminiFetch = async (_url, init) => {
    body = init.body;

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          { content: { role: "model", parts: [{ text: '{"answer":"ok"}' }] } },
        ],
      }),
    };
  };

  const provider = new GeminiProvider({ apiKey: "gemini-test", fetchImpl });

  await provider.answerQuestion({
    question: "피트 상황 알려줘",
    locale: SupportedLocale.Ko,
    explanationLevel: ExplanationLevel.Standard,
    snapshot: frame.snapshot,
    recentEvents,
    favoriteDriverNumbers: [],
  });

  return body;
};

const captureOpenAiBody = async (
  recentEvents: RaceEvent[],
): Promise<string> => {
  let body = "";
  const fetchImpl: OpenAiFetch = async (_url, init) => {
    body = init.body;

    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"answer":"ok"}' } }],
      }),
    };
  };

  const provider = new OpenAiProvider({ apiKey: "sk-test", fetchImpl });

  await provider.answerQuestion({
    question: "피트 상황 알려줘",
    locale: SupportedLocale.Ko,
    explanationLevel: ExplanationLevel.Standard,
    snapshot: frame.snapshot,
    recentEvents,
    favoriteDriverNumbers: [],
  });

  return body;
};

describe("provider parity — 세 provider 가 같은 질문 이벤트 선별을 쓴다", () => {
  it("각 provider 요청 본문에 pit_stop 이 들어오고 overtake 는 빠진다", async () => {
    const events = buildNoisyEvents();

    const [claude, gemini, openai] = await Promise.all([
      captureClaudeBody(events),
      captureGeminiBody(events),
      captureOpenAiBody(events),
    ]);

    for (const body of [claude, gemini, openai]) {
      // 사용자가 물은 pit_stop 이 컨텍스트에 있다.
      expect(body).toContain("pit_stop");
      // 소음 overtake 는 선별에서 제거됐다 — slice(-8) 이었다면 반대였다.
      expect(body).not.toContain("overtake");
    }
  });
});
