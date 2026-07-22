import { describe, expect, it } from "vitest";
import { ClaudeFetch, ClaudeProvider } from "../src/ai/ClaudeProvider";
import { buildCommentaryPrompt } from "../src/ai/CommentaryPrompt";
import { GeminiFetch, GeminiProvider } from "../src/ai/GeminiProvider";
import { OpenAiFetch, OpenAiProvider } from "../src/ai/OpenAiProvider";
import { LlmCommentaryRequest, RaceLlmProvider } from "../src/ai/RaceLlmProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SupportedLocale } from "../src/SupportedLocale";

// 해설 프롬프트 조립이 provider 별로 갈라지지 않는지 본다.
//
// 예전에는 세 provider 가 같은 조립 코드를 복붙해 갖고 있었고, 테스트는 Gemini 만
// 봤다. 한 provider 의 문구가 조용히 어긋나도 아무도 몰랐다는 뜻이다
// (docs/18-ai-commentary-worker.md §프롬프트).
//
// 그래서 "공용 함수를 쓴다"를 wire 본문으로 고정한다. 어떤 provider 가 자체 조립으로
// 되돌아가는 순간, 문구가 한 글자만 달라도 여기서 깨진다.
const frame = new MockRaceEngine(
  DEFAULT_MOCK_SCENARIO,
  Date.parse("2026-07-19T05:00:00.000Z"),
).snapshotAt(70);

const HEDGE_RULE =
  "If the data is insufficient to answer, say you do not know.";

const buildEvent = (type: RaceEventType, driverNumber?: number): RaceEvent => ({
  schemaVersion: 1,
  id: `event:${type}`,
  sessionId: frame.snapshot.sessionId,
  type,
  priority: RaceEventPriority.High,
  driverNumber,
  timestamp: "2026-07-19T05:00:00.000Z",
  params: { seconds: 5 },
  deduplicationKey: `dedup:${type}`,
});

// provider 마다 전송 형식이 다르므로, 본문에서 system·user 를 다시 꺼내는 방법도 다르다.
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
    candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
    content: [{ type: "text", text: "ok" }],
    choices: [{ message: { content: "ok" } }],
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

// locale · 설명수준 · 범위를 모두 돌린다. 갈라짐은 대개 한 조합에서만 드러난다.
const REQUEST_CASES: { label: string; request: LlmCommentaryRequest }[] = [];

for (const locale of [
  SupportedLocale.En,
  SupportedLocale.Ko,
  SupportedLocale.Ja,
]) {
  for (const level of [
    ExplanationLevel.Beginner,
    ExplanationLevel.Standard,
    ExplanationLevel.Expert,
  ]) {
    for (const [scope, event] of [
      [
        "Driver",
        buildEvent(
          RaceEventType.Penalty,
          frame.snapshot.drivers[4]!.driverNumber,
        ),
      ],
      ["Session", buildEvent(RaceEventType.SafetyCar)],
    ] as [string, RaceEvent][]) {
      REQUEST_CASES.push({
        label: `${locale}/${level}/${scope}`,
        request: {
          event,
          locale,
          explanationLevel: level,
          snapshot: frame.snapshot,
          recentCommentary: ["직전 해설 하나", "직전 해설 둘"],
        },
      });
    }
  }
}

describe.each(PROVIDER_CASES)(
  "$name 해설 프롬프트는 공용 조립을 그대로 보낸다",
  ({ create, readPrompt }) => {
    it.each(REQUEST_CASES)(
      "$label 조합이 buildCommentaryPrompt 결과와 한 글자도 다르지 않다",
      async ({ request }) => {
        let sent: string | null = null;
        const provider = create((body) => {
          sent = body;
        });

        await provider.generateCommentary(request);

        expect(sent).not.toBeNull();

        // context 는 프롬프트로 "전송" 되는 별도 필드가 아니라 user JSON 안에 이미 녹아
        // 있다. 전송 본문과 비교할 대상은 system·user 뿐이다.
        const { system, user } = buildCommentaryPrompt(request);

        expect(readPrompt(sent!)).toEqual({ system, user });
      },
    );

    it("Q&A 의 '모르면 모른다' 규칙이 해설로 새지 않는다", async () => {
      let sent: string | null = null;
      const provider = create((body) => {
        sent = body;
      });

      await provider.generateCommentary(REQUEST_CASES[0]!.request);

      const { system } = readPrompt(sent!);

      expect(system).not.toContain(HEDGE_RULE);
      expect(system).not.toContain("say it cannot be confirmed from the data");
      expect(system).toContain("If it is not in the data, it does not exist.");
    });
  },
);
