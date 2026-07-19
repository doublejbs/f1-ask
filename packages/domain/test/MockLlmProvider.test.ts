import { describe, expect, it } from "vitest";
import { AiConfidence } from "../src/ai/AiConfidence";
import { MockLlmProvider } from "../src/ai/MockLlmProvider";
import { LlmQuestionRequest } from "../src/ai/RaceLlmProvider";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { SupportedLocale } from "../src/SupportedLocale";

const START_EPOCH = Date.parse("2026-07-19T05:00:00.000Z");

const frame = new MockRaceEngine(DEFAULT_MOCK_SCENARIO, START_EPOCH).snapshotAt(
  70,
);

const provider = new MockLlmProvider();

const ask = (
  question: string,
  overrides: Partial<LlmQuestionRequest> = {},
) =>
  provider.answerQuestion({
    question,
    locale: SupportedLocale.En,
    explanationLevel: ExplanationLevel.Standard,
    snapshot: frame.snapshot,
    recentEvents: frame.events,
    favoriteDriverNumbers: [],
    ...overrides,
  });

describe("MockLlmProvider", () => {
  it("드라이버 코드를 인식해 High 신뢰도로 답한다", async () => {
    const answer = await ask("What tires is NOR on?");

    expect(answer.confidence).toBe(AiConfidence.High);
    expect(answer.insufficientData).toBe(false);
    expect(answer.referencedDriverNumbers).toContain(4);
    expect(answer.answer).toContain("NOR");
  });

  it("결정론적이다 — 동일 입력에 동일 출력", async () => {
    const a = await ask("How is NOR's pace?");
    const b = await ask("How is NOR's pace?");

    expect(a).toEqual(b);
  });

  it("드라이버를 특정할 수 없는 드라이버-중심 질문은 부족 데이터로 처리한다", async () => {
    const answer = await ask("Is he going to pit?");

    expect(answer.insufficientData).toBe(true);
    expect(answer.confidence).toBe(AiConfidence.Low);
    expect(answer.referencedDriverNumbers).toEqual([]);
  });

  it("드라이버 미지정 시 관심 드라이버로 폴백하고 Medium 신뢰도", async () => {
    const answer = await ask("Is he going to pit?", {
      favoriteDriverNumbers: [1],
    });

    expect(answer.insufficientData).toBe(false);
    expect(answer.confidence).toBe(AiConfidence.Medium);
    expect(answer.referencedDriverNumbers).toContain(1);
  });

  it("피트 질문은 팀 전략을 단정하지 않는다 (추정 명시)", async () => {
    const answer = await ask("Why doesn't VER pit now?");

    expect(answer.answer.toLowerCase()).toContain("can't be confirmed");
  });

  it("선두 질문은 드라이버 없이도 답한다", async () => {
    const answer = await ask("Who is leading now?");

    expect(answer.insufficientData).toBe(false);
    expect(answer.confidence).toBe(AiConfidence.High);
    expect(answer.referencedDriverNumbers.length).toBeGreaterThan(0);
  });

  it("gap 질문은 앞차를 참조 드라이버에 포함한다", async () => {
    // 70초 시점 P2 드라이버 기준으로 앞차(P1)가 참조되어야 한다.
    const p2 = frame.snapshot.drivers.find((d) => d.position === 2);
    const answer = await ask(`Is ${p2?.code} catching the car ahead?`);

    expect(answer.referencedDriverNumbers.length).toBeGreaterThanOrEqual(2);
  });

  it("응답 metadata 에 snapshot version 과 timestamp 를 포함한다", async () => {
    const answer = await ask("race status?");

    expect(answer.snapshotVersion).toBe(frame.snapshot.version);
    expect(answer.dataTimestamp).toBe(frame.snapshot.sourceUpdatedAt);
    expect(answer.suggestedQuestions.length).toBeGreaterThan(0);
  });

  it("locale 에 따라 답변 언어가 바뀐다", async () => {
    const ko = await ask("지금 누가 선두야?", { locale: SupportedLocale.Ko });

    expect(ko.answer).toMatch(/선두/);
  });
});
