import { describe, expect, it } from "vitest";
import { ClaudeFetch, ClaudeProvider } from "../src/ai/ClaudeProvider";
import { GeminiFetch, GeminiProvider } from "../src/ai/GeminiProvider";
import { OpenAiFetch, OpenAiProvider } from "../src/ai/OpenAiProvider";
import {
  LlmQuestionRequest,
  LlmSummaryRequest,
  RaceLlmProvider,
} from "../src/ai/RaceLlmProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { SupportedLocale } from "../src/SupportedLocale";
import { NARRATIVE_RULES } from "../src/ai/QuestionSystemRules";
import { RaceSummaryData } from "../src/RaceSummary";

// narrative 규칙은 세 provider 의 공용 상수(QuestionSystemRules)에서 나온다. 문구가 소스와
// 어긋나면 이 테스트가 깨지도록 기대 문자열을 그대로 박아 둔다 (FOCUS_SYSTEM_RULE 패턴과 동일).
const NARRATIVE_FACT_RULE =
  "- narrative (the race story) is already-happened fact: cite ONLY the drivers, laps, and positions inside it, and never invent what is not there.";

const LEAD_CHANGES_RULE =
  "- narrative.leadChanges is the order in which drivers held the lead, not on-track overtakes — do not assert them as overtakes.";

const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

type ProviderCase = {
  name: string;
  create: (record: (body: string) => void) => RaceLlmProvider;
  readSystem: (body: string) => string;
};

const okResponse = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [
      { content: { role: "model", parts: [{ text: '{"answer":"ok"}' }] } },
    ],
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
    readSystem: (body) => {
      const parsed = JSON.parse(body) as {
        systemInstruction: { parts: { text: string }[] };
      };

      return parsed.systemInstruction.parts.map((p) => p.text).join("");
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
    readSystem: (body) => (JSON.parse(body) as { system: string }).system,
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
    readSystem: (body) => {
      const parsed = JSON.parse(body) as {
        messages: { role: string; content: string }[];
      };

      return parsed.messages[0]!.content;
    },
  },
];

const baseRequest = (): LlmQuestionRequest => ({
  question: "지금까지 경기 어땠어?",
  locale: SupportedLocale.Ko,
  explanationLevel: ExplanationLevel.Standard,
  snapshot: frame.snapshot,
  recentEvents: frame.events,
  favoriteDriverNumbers: [],
});

describe.each(PROVIDER_CASES)(
  "$name 답변 프롬프트에 narrative 규칙이 실린다",
  ({ create, readSystem }) => {
    const captureSystem = async (): Promise<string> => {
      let sent: string | null = null;
      const provider = create((body) => {
        sent = body;
      });

      await provider.answerQuestion(baseRequest());

      expect(sent).not.toBeNull();

      return readSystem(sent!);
    };

    it("narrative 는 사실이므로 지어내지 말라는 규칙이 있다", async () => {
      const system = await captureSystem();

      expect(system).toContain(NARRATIVE_FACT_RULE);
    });

    it("leadChanges 는 리드 보유 순서지 추월이 아니라는 규칙이 있다", async () => {
      const system = await captureSystem();

      expect(system).toContain(LEAD_CHANGES_RULE);
    });
  },
);

// 요약 경로에서 narrative 규칙 부재 검증. generateSummary 는 narrative 입력이 없으므로
// narrative 규칙이 포함되면 안 된다. 뮤테이션(SUMMARY_SYSTEM_RULES = QUESTION_SYSTEM_RULES)이
// 모든 테스트를 통과하는 구멍을 막는다.
describe.each(PROVIDER_CASES)(
  "$name 요약 프롬프트에 narrative 규칙이 없다",
  ({ create, readSystem }) => {
    const captureSystem = async (): Promise<string> => {
      let sent: string | null = null;
      const provider = create((body) => {
        sent = body;
      });

      const mockSummary: RaceSummaryData = {
        sessionId: "test-session-id",
        sessionName: "Test Race",
        winnerDriverNumber: 1,
        podiumDriverNumbers: [1, 2, 3],
        fastestLapDriverNumber: 1,
        totalOvertakes: 10,
        totalPitStops: 30,
        retiredDriverNumbers: [],
        keyMoments: [],
      };

      const summaryRequest: LlmSummaryRequest = {
        summary: mockSummary,
        snapshot: frame.snapshot,
        locale: SupportedLocale.Ko,
      };

      await provider.generateSummary(summaryRequest);

      expect(sent).not.toBeNull();

      return readSystem(sent!);
    };

    it("NARRATIVE_RULES 의 각 줄이 요약 프롬프트에 없다", async () => {
      const system = await captureSystem();

      // narrative 규칙의 모든 줄이 요약 프롬프트에 포함되지 않음을 확인한다.
      for (const rule of NARRATIVE_RULES) {
        expect(system).not.toContain(rule);
      }
    });
  },
);
