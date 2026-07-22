import { describe, expect, it } from "vitest";
import { ClaudeFetch, ClaudeProvider } from "../src/ai/ClaudeProvider";
import { buildCommentaryContext } from "../src/ai/CommentaryContext";
import { GeminiFetch, GeminiProvider } from "../src/ai/GeminiProvider";
import { OpenAiFetch, OpenAiProvider } from "../src/ai/OpenAiProvider";
import { buildQuestionPrompt } from "../src/ai/QuestionPrompt";
import {
  LlmQuestionFocus,
  LlmQuestionRequest,
  RaceLlmProvider,
} from "../src/ai/RaceLlmProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SupportedLocale } from "../src/SupportedLocale";

// 포커스 문구는 QuestionPrompt.ts 안에서 private 이다. 오탈자/문구 드리프트를 잡기 위해
// 기대 문자열을 여기에 그대로 박아 둔다 — 이 상수가 소스와 어긋나면 테스트가 깨진다.
const FOCUS_SYSTEM_RULE =
  "- This question is about a specific past event and its point-in-time context, both provided below. Answer ONLY within that event and its point-in-time context; if the answer lies outside them, say you do not know.";

const FOCUS_USER_HEADING =
  "Focus event and its point-in-time context (JSON):";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

const buildEvent = (type: RaceEventType, driverNumber?: number): RaceEvent => ({
  schemaVersion: 1,
  id: `event:${type}`,
  sessionId: frame.snapshot.sessionId,
  type,
  priority: RaceEventPriority.High,
  driverNumber,
  lapNumber: 12,
  timestamp: "2026-07-19T05:00:00.000Z",
  params: { seconds: 5 },
  deduplicationKey: `dedup:${type}`,
});

const focusEvent = buildEvent(
  RaceEventType.Penalty,
  frame.snapshot.drivers[4]!.driverNumber,
);

const focus: LlmQuestionFocus = {
  event: focusEvent,
  context: buildCommentaryContext(focusEvent, frame.snapshot),
};

// buildQuestionPrompt 자체의 순수 계약: 포커스가 없으면 바이트 동일, 있으면 순수 추가.
describe("buildQuestionPrompt", () => {
  const base = {
    systemLines: ["RULE_A", "RULE_B", "RULE_C"],
    question: "Why the penalty?",
    dataContext: "{DATA_JSON}",
  };

  it("포커스가 없으면 골격만 그대로 나온다 (바이트 동일)", () => {
    const { system, user } = buildQuestionPrompt(base);

    expect(system).toBe("RULE_A\nRULE_B\nRULE_C");
    expect(user).toBe(
      "Question: Why the penalty?\n\nCurrent race data (JSON):\n{DATA_JSON}",
    );
  });

  it("포커스가 있으면 규칙 한 줄과 포커스 JSON 만 덧붙는다 (순수 추가)", () => {
    const without = buildQuestionPrompt(base);
    const withFocus = buildQuestionPrompt({ ...base, focus });

    // system 은 골격 뒤에 규칙 한 줄만 붙는다.
    expect(withFocus.system).toBe(`${without.system}\n${FOCUS_SYSTEM_RULE}`);

    // user 는 기존 뒤에 포커스 헤딩 + JSON 만 붙는다.
    expect(withFocus.user.startsWith(`${without.user}\n\n`)).toBe(true);
    expect(withFocus.user).toContain(FOCUS_USER_HEADING);

    // 시점 맥락(순위 슬라이스·세션 상태)이 실제로 실린다.
    expect(withFocus.user).toContain(JSON.stringify(focus.context));
    // 원본 이벤트 요약(timestamp 포함)도 실린다.
    expect(withFocus.user).toContain(focus.event.timestamp);
  });
});

// provider 별 전송 형식에서 다시 system·user 를 꺼내는 방법.
type SentPrompt = { system: string; user: string };

type ProviderCase = {
  name: string;
  create: (record: (body: string) => void) => RaceLlmProvider;
  readPrompt: (body: string) => SentPrompt;
};

const okResponse = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ content: { role: "model", parts: [{ text: '{"answer":"ok"}' }] } }],
    content: [{ type: "text", text: '{"answer":"ok"}' }],
    choices: [{ message: { content: '{"answer":"ok"}' } }],
  }),
});

const PROVIDER_CASES: ProviderCase[] = [
  {
    name: "Gemini",
    create: (record) => {
      const fetchImpl: GeminiFetch = async (_url, init) => {
        record(init.body);

        return okResponse();
      };

      return new GeminiProvider({ apiKey: "k", fetchImpl });
    },
    readPrompt: (body) => {
      const parsed = JSON.parse(body) as {
        systemInstruction: { parts: { text: string }[] };
        contents: { parts: { text: string }[] }[];
      };

      return {
        system: parsed.systemInstruction.parts.map((p) => p.text).join(""),
        user: parsed.contents[0]!.parts.map((p) => p.text).join(""),
      };
    },
  },
  {
    name: "Claude",
    create: (record) => {
      const fetchImpl: ClaudeFetch = async (_url, init) => {
        record(init.body);

        return okResponse();
      };

      return new ClaudeProvider({ apiKey: "k", fetchImpl });
    },
    readPrompt: (body) => {
      const parsed = JSON.parse(body) as {
        system: string;
        messages: { role: string; content: string }[];
      };

      return { system: parsed.system, user: parsed.messages[0]!.content };
    },
  },
  {
    name: "OpenAI",
    create: (record) => {
      const fetchImpl: OpenAiFetch = async (_url, init) => {
        record(init.body);

        return okResponse();
      };

      return new OpenAiProvider({ apiKey: "k", fetchImpl });
    },
    readPrompt: (body) => {
      const parsed = JSON.parse(body) as {
        messages: { role: string; content: string }[];
      };

      return {
        system: parsed.messages[0]!.content,
        user: parsed.messages[1]!.content,
      };
    },
  },
];

const baseRequest = (focusValue?: LlmQuestionFocus): LlmQuestionRequest => ({
  question: "Why the penalty?",
  locale: SupportedLocale.En,
  explanationLevel: ExplanationLevel.Standard,
  snapshot: frame.snapshot,
  recentEvents: frame.events,
  favoriteDriverNumbers: [],
  focus: focusValue,
});

describe.each(PROVIDER_CASES)(
  "$name 질문 프롬프트는 공용 조립(buildQuestionPrompt)을 그대로 보낸다",
  ({ create, readPrompt }) => {
    const capture = async (
      request: LlmQuestionRequest,
    ): Promise<SentPrompt> => {
      let sent: string | null = null;
      const provider = create((body) => {
        sent = body;
      });

      await provider.answerQuestion(request);

      expect(sent).not.toBeNull();

      return readPrompt(sent!);
    };

    it("포커스가 없으면 포커스 규칙·JSON 이 새지 않는다", async () => {
      const { system, user } = await capture(baseRequest());

      expect(system).not.toContain(FOCUS_SYSTEM_RULE);
      expect(user).not.toContain(FOCUS_USER_HEADING);
    });

    it("포커스가 있으면 이벤트와 시점 맥락이 프롬프트에 실린다", async () => {
      const { system, user } = await capture(baseRequest(focus));

      expect(system).toContain(FOCUS_SYSTEM_RULE);
      expect(user).toContain(FOCUS_USER_HEADING);
      expect(user).toContain(JSON.stringify(focus.context));
    });

    it("포커스는 순수 추가다 — 없을 때 프롬프트는 있을 때에서 추가분만 뺀 것과 같다", async () => {
      const without = await capture(baseRequest());
      const withFocus = await capture(baseRequest(focus));

      // 같은 요청에서 포커스만 켜면 골격(system·user)은 한 글자도 바뀌지 않고
      // 규칙 한 줄과 포커스 JSON 만 덧붙는다.
      expect(withFocus.system.startsWith(`${without.system}\n`)).toBe(true);
      expect(withFocus.user.startsWith(`${without.user}\n\n`)).toBe(true);
      expect(withFocus.system).toBe(`${without.system}\n${FOCUS_SYSTEM_RULE}`);
    });
  },
);
