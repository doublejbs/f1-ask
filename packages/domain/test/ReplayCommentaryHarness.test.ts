import { describe, expect, it } from "vitest";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventScope } from "../src/RaceEventScope";
import { RaceEventType } from "../src/RaceEventType";
import { SessionStatus } from "../src/SessionStatus";
import { SupportedLocale } from "../src/SupportedLocale";
import { LlmCommentary, LlmCommentaryRequest } from "../src/ai/RaceLlmProvider";
import { CommentaryDocument } from "../src/firestore/CommentaryDocument";
import {
  EMPTY_COMMENTARY_RUN_CONTEXT,
  MAX_COMMENTARY_ATTEMPTS,
  recordCommentaryFailure,
} from "../src/worker/CommentaryRunContext";
import { CommentaryVariant } from "../src/worker/CommentaryVariant";
import {
  formatReplayCommentaryEntry,
  formatReplayCommentaryPlan,
  formatReplayCommentarySummary,
  planReplayCommentary,
  ReplayCommentaryDeps,
  ReplayCommentaryOptions,
  ReplayCommentaryOutcome,
  runReplayCommentary,
} from "../src/worker/ReplayCommentaryHarness";
import { toCommentaryDocId } from "../src/firestore/CommentaryDocument";

// 리플레이 하네스의 해설 배선 (docs/04-worker-openf1.md §해설 생성).
//
// 하네스는 실제 LLM 이 붙어야 돌아가므로 그대로는 CI 에서 검증할 수 없다. 대신 배선을
// 통째로 주입 가능한 형태로 뽑아 두고, 여기서 가짜 LLM 으로 세 가지를 고정한다.
//   1. 호출 수 상한이 실제로 호출을 막는가 (비용 안전장치)
//   2. 실패가 실패로 표시되는가 (성공으로 읽히면 품질 판단이 통째로 틀어진다)
//   3. 기록이 시간순인가 (연속 문장 비교가 이 하네스의 존재 이유다)

const SNAPSHOT: LiveRaceSnapshot = {
  schemaVersion: 1,
  sessionId: "session:test",
  sessionKey: 1,
  meetingKey: 1,
  sessionName: "Race",
  sessionType: "Race",
  circuitName: "Spa-Francorchamps",
  countryCode: "BEL",
  status: SessionStatus.Green,
  currentLap: 41,
  totalLaps: 44,
  drivers: [],
  generatedAt: "2026-07-19T05:00:00.000Z",
  sourceUpdatedAt: "2026-07-19T05:00:00.000Z",
  version: 1,
};

const KO_VARIANT: CommentaryVariant = {
  locale: SupportedLocale.Ko,
  explanationLevel: ExplanationLevel.Standard,
};

const EN_VARIANT: CommentaryVariant = {
  locale: SupportedLocale.En,
  explanationLevel: ExplanationLevel.Beginner,
};

const MODEL = "gemini-3.5-flash";

// 시간 예산은 이 테스트의 관심사가 아니다. 넉넉히 열어 두고 상한만 본다.
const WIDE_BUDGET_END_MS = Number.MAX_SAFE_INTEGER;
const CALL_BUDGET_MS = 12_000;

const buildEvent = (
  id: string,
  offsetSeconds: number,
  type: RaceEventType = RaceEventType.Penalty,
): RaceEvent => ({
  schemaVersion: 1,
  id,
  sessionId: "session:test",
  type,
  priority: RaceEventPriority.High,
  lapNumber: 41,
  timestamp: new Date(
    Date.parse("2026-07-19T05:00:00.000Z") + offsetSeconds * 1000,
  ).toISOString(),
  params: {},
  deduplicationKey: id,
});

type FakeLlm = {
  deps: ReplayCommentaryDeps;
  requests: LlmCommentaryRequest[];
  saved: { docId: string; document: CommentaryDocument }[];
};

// 가짜 LLM · 가짜 저장소. respond 로 건별 성공/실패/mock 을 갈라 낸다.
const buildFakeLlm = (
  respond: (
    request: LlmCommentaryRequest,
    index: number,
  ) => LlmCommentary | Error,
): FakeLlm => {
  const requests: LlmCommentaryRequest[] = [];
  const saved: { docId: string; document: CommentaryDocument }[] = [];

  return {
    requests,
    saved,
    deps: {
      generate: async (request) => {
        const index = requests.length;

        requests.push(request);

        const outcome = respond(request, index);

        if (outcome instanceof Error) {
          throw outcome;
        }

        return outcome;
      },
      save: async (docId, document) => {
        saved.push({ docId, document });
      },
      nowMs: () => Date.parse("2026-07-19T05:10:00.000Z"),
    },
  };
};

const buildOptions = (
  events: readonly RaceEvent[],
  variants: readonly CommentaryVariant[],
  callCap: number,
): ReplayCommentaryOptions => ({
  events,
  snapshot: SNAPSHOT,
  variants,
  context: EMPTY_COMMENTARY_RUN_CONTEXT,
  model: MODEL,
  budgetEndMs: WIDE_BUDGET_END_MS,
  callBudgetMs: CALL_BUDGET_MS,
  callCap,
});

const succeedWith = (
  request: LlmCommentaryRequest,
  text: string,
): LlmCommentary => ({
  sourceEventId: request.event.id,
  text,
  isMock: false,
});

describe("리플레이 하네스 해설 배선", () => {
  it("호출 수 상한을 넘겨 LLM 을 부르지 않는다", async () => {
    const events = [
      buildEvent("e1", 0),
      buildEvent("e2", 10),
      buildEvent("e3", 20),
      buildEvent("e4", 30),
      buildEvent("e5", 40),
    ];
    const fake = buildFakeLlm((request, index) =>
      succeedWith(request, `해설 ${index + 1}`),
    );

    const report = await runReplayCommentary(
      buildOptions(events, [KO_VARIANT], 2),
      fake.deps,
    );

    expect(fake.requests).toHaveLength(2);
    expect(report.llmCalls).toBe(2);
    expect(report.generated).toBe(2);
    expect(report.plan.plannedCalls).toBe(5);
    expect(report.plan.acceptedCalls).toBe(2);
    expect(report.plan.skippedByCallCap).toBe(3);
    expect(report.plan.isCallCapReached).toBe(true);
  });

  it("상한이 한 이벤트의 변형을 중간에서 가르지 않는다", async () => {
    const events = [buildEvent("e1", 0), buildEvent("e2", 10)];
    const fake = buildFakeLlm((request) => succeedWith(request, "해설"));

    // 변형 2개 × 이벤트 2건 = 4회. 상한 3이면 이벤트 1건(2회)까지만 받는다.
    const report = await runReplayCommentary(
      buildOptions(events, [KO_VARIANT, EN_VARIANT], 3),
      fake.deps,
    );

    expect(report.llmCalls).toBe(2);
    expect(report.plan.acceptedCalls).toBe(2);
    expect(new Set(fake.saved.map((entry) => entry.document.sourceEventId))).toEqual(
      new Set(["e1"]),
    );
  });

  it("상한 안에 들어오면 계획대로 전부 생성한다", async () => {
    const events = [buildEvent("e1", 0), buildEvent("e2", 10)];
    const fake = buildFakeLlm((request) => succeedWith(request, "해설"));

    const report = await runReplayCommentary(
      buildOptions(events, [KO_VARIANT], 60),
      fake.deps,
    );

    expect(report.llmCalls).toBe(2);
    expect(report.plan.isCallCapReached).toBe(false);
    expect(report.plan.skippedByCallCap).toBe(0);
  });

  it("해설 대상이 아닌 이벤트는 호출 대상에서 빠진다", async () => {
    const events = [
      buildEvent("e1", 0, RaceEventType.Overtake),
      buildEvent("e2", 10, RaceEventType.PitStop),
      buildEvent("e3", 20, RaceEventType.Penalty),
    ];
    const fake = buildFakeLlm((request) => succeedWith(request, "해설"));

    const report = await runReplayCommentary(
      buildOptions(events, [KO_VARIANT], 60),
      fake.deps,
    );

    expect(report.plan.totalEvents).toBe(3);
    expect(report.plan.eligibleEvents).toBe(1);
    expect(report.llmCalls).toBe(1);
  });

  // Session 범위 이벤트의 해설은 폐기됐다 (docs/19-watch-now.md §폐기한다, 수용 기준 6).
  // SC · VSC · 재개 · 플래그는 방송이 가장 잘하는 영역이고, 실측에서 나온 무가치한 문장이
  // 전부 여기였다. **이전 버전의 이 파일은 SafetyCar 해설이 생성되는 것을 성공으로
  // 단언해 폐기 대상 동작을 못박아 놨다.** 이제 반대를 고정한다.
  it("Session 범위 이벤트는 해설이 생성되지 않는다", async () => {
    const events = [
      buildEvent("e1", 0, RaceEventType.SafetyCar),
      buildEvent("e2", 10, RaceEventType.VirtualSafetyCar),
      buildEvent("e3", 20, RaceEventType.SessionRestarted),
      buildEvent("e4", 30, RaceEventType.TrackHazard),
    ];
    const fake = buildFakeLlm((request) => succeedWith(request, "해설"));

    const report = await runReplayCommentary(
      buildOptions(events, [KO_VARIANT], 60),
      fake.deps,
    );

    expect(report.plan.totalEvents).toBe(4);
    expect(report.plan.eligibleEvents).toBe(0);
    expect(report.llmCalls).toBe(0);
    expect(fake.saved).toHaveLength(0);
    expect(report.entries).toHaveLength(0);
  });

  it("실패를 실패로 표시하고 사유를 남긴다", async () => {
    const events = [buildEvent("e1", 0), buildEvent("e2", 10)];
    const fake = buildFakeLlm((request, index) => {
      if (index === 1) {
        return new Error("429 quota exceeded");
      }

      return succeedWith(request, "첫 번째 해설");
    });

    const report = await runReplayCommentary(
      buildOptions(events, [KO_VARIANT], 60),
      fake.deps,
    );

    expect(report.generated).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.entries).toHaveLength(2);
    expect(report.entries[1]?.outcome).toBe(ReplayCommentaryOutcome.Failed);
    expect(report.entries[1]?.failureReason).toContain("429 quota exceeded");
    expect(report.entries[1]?.text).toBeNull();
  });

  it("mock 폴백은 저장하지 않고 mock 으로 표시한다", async () => {
    const events = [buildEvent("e1", 0)];
    const fake = buildFakeLlm((request) => ({
      sourceEventId: request.event.id,
      text: "경기의 주목할 만한 순간입니다.",
      isMock: true,
    }));

    const report = await runReplayCommentary(
      buildOptions(events, [KO_VARIANT], 60),
      fake.deps,
    );

    expect(fake.saved).toHaveLength(0);
    expect(report.generated).toBe(0);
    expect(report.mockDropped).toBe(1);
    expect(report.entries[0]?.outcome).toBe(
      ReplayCommentaryOutcome.MockDropped,
    );
    expect(report.entries[0]?.failureReason).toContain("mock");
  });

  it("입력 순서와 무관하게 기록이 이벤트 시간순으로 쌓인다", async () => {
    // 일부러 뒤섞어 넣는다. 폴링이 계산한 이벤트 배열의 순서를 믿으면 안 된다.
    const events = [
      buildEvent("late", 40),
      buildEvent("early", 0),
      buildEvent("middle", 20),
    ];
    const fake = buildFakeLlm((request) =>
      succeedWith(request, `해설:${request.event.id}`),
    );

    const report = await runReplayCommentary(
      buildOptions(events, [KO_VARIANT], 60),
      fake.deps,
    );

    expect(report.entries.map((entry) => entry.eventId)).toEqual([
      "early",
      "middle",
      "late",
    ]);
    expect(fake.requests.map((request) => request.event.id)).toEqual([
      "early",
      "middle",
      "late",
    ]);
  });

  it("직전 해설이 다음 호출의 맥락으로 이어진다", async () => {
    const events = [buildEvent("e1", 0), buildEvent("e2", 10)];
    const fake = buildFakeLlm((request) =>
      succeedWith(request, `해설:${request.event.id}`),
    );

    await runReplayCommentary(buildOptions(events, [KO_VARIANT], 60), fake.deps);

    expect(fake.requests[0]?.recentCommentary).toEqual([]);
    expect(fake.requests[1]?.recentCommentary).toEqual(["해설:e1"]);
  });

  it("변형 사이에 직전 해설이 섞이지 않는다", async () => {
    const events = [buildEvent("e1", 0), buildEvent("e2", 10)];
    const fake = buildFakeLlm((request) =>
      succeedWith(request, `${request.locale}:${request.event.id}`),
    );

    await runReplayCommentary(
      buildOptions(events, [KO_VARIANT, EN_VARIANT], 60),
      fake.deps,
    );

    const enSecond = fake.requests.find(
      (request) =>
        request.locale === SupportedLocale.En && request.event.id === "e2",
    );

    expect(enSecond?.recentCommentary).toEqual(["en:e1"]);
  });

  it("재시도 상한을 넘긴 해설은 계획 단계에서 빠진다", async () => {
    const event = buildEvent("e1", 0);
    const docId = toCommentaryDocId(
      event.id,
      KO_VARIANT.locale,
      KO_VARIANT.explanationLevel,
    );
    let context = EMPTY_COMMENTARY_RUN_CONTEXT;

    for (let attempt = 0; attempt < MAX_COMMENTARY_ATTEMPTS; attempt += 1) {
      context = recordCommentaryFailure(context, docId);
    }

    const plan = planReplayCommentary([event], [KO_VARIANT], context, 60);

    expect(plan.plannedCalls).toBe(0);
    expect(plan.retryExhausted).toBe(1);
  });

  // 해설 대상이 Driver 범위뿐이므로 기록 한 줄도 Driver 범위로 확인한다.
  it("기록 한 줄에 범위 · 변형 · 문장이 모두 담긴다", async () => {
    const events = [buildEvent("e1", 0, RaceEventType.Retirement)];
    const fake = buildFakeLlm((request) =>
      succeedWith(request, "RUS 의 리타이어로 포디움 다툼이 다시 열린다."),
    );

    const report = await runReplayCommentary(
      buildOptions(events, [KO_VARIANT], 60),
      fake.deps,
    );
    const entry = report.entries[0];
    const line = formatReplayCommentaryEntry(entry!, 0);

    expect(entry?.scope).toBe(RaceEventScope.Driver);
    expect(line).toContain("OK");
    expect(line).toContain(RaceEventType.Retirement);
    expect(line).toContain(RaceEventScope.Driver);
    expect(line).toContain("ko:standard");
    expect(line).toContain("RUS 의 리타이어로 포디움 다툼이 다시 열린다.");
  });

  it("요약이 호출 수와 상한 도달을 알린다", async () => {
    const events = [buildEvent("e1", 0), buildEvent("e2", 10)];
    const fake = buildFakeLlm((request) => succeedWith(request, "해설"));

    const report = await runReplayCommentary(
      buildOptions(events, [KO_VARIANT], 1),
      fake.deps,
    );
    const planLines = formatReplayCommentaryPlan(report.plan).join("\n");
    const summary = formatReplayCommentarySummary(report).join("\n");

    expect(planLines).toContain("예상 LLM 호출 2회");
    expect(planLines).toContain("상한 1회");
    expect(summary).toContain("실제 LLM 호출 1회");
    expect(summary).toContain("호출 상한에 도달");
  });
});
