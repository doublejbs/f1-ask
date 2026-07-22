import { describe, expect, it } from "vitest";
import { ExplanationLevel } from "../src/ExplanationLevel";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SessionStatus } from "../src/SessionStatus";
import { SupportedLocale } from "../src/SupportedLocale";
import {
  CommentaryContext,
  RECENT_COMMENTARY_LIMIT,
} from "../src/ai/CommentaryContext";
import { RaceEventScope } from "../src/RaceEventScope";
import {
  LlmCommentary,
  LlmCommentaryRequest,
} from "../src/ai/RaceLlmProvider";
import { CommentaryDocument } from "../src/firestore/CommentaryDocument";
import { toCommentaryDocId } from "../src/firestore/CommentaryDocument";
import {
  generateCommentaryForEvents,
  selectPendingCommentaryTasks,
} from "../src/worker/CommentaryGeneration";
import {
  appendCommentaryToRunContext,
  CommentaryRunContext,
  EMPTY_COMMENTARY_RUN_CONTEXT,
  MAX_COMMENTARY_ATTEMPTS,
  recordCommentaryFailure,
} from "../src/worker/CommentaryRunContext";
import {
  CommentaryVariant,
  toCommentaryVariantKey,
} from "../src/worker/CommentaryVariant";

// 워커의 해설 생성 루프 (docs/18-ai-commentary-worker.md).
// LLM 과 Firestore 를 모두 주입받는 순수 루프라 여기서 순서·멱등·실패·예산을 고정한다.

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

const VARIANT: CommentaryVariant = {
  locale: SupportedLocale.Ko,
  explanationLevel: ExplanationLevel.Standard,
};

const EN_VARIANT: CommentaryVariant = {
  locale: SupportedLocale.En,
  explanationLevel: ExplanationLevel.Beginner,
};

const VARIANTS: readonly CommentaryVariant[] = [VARIANT];

const MODEL = "gemini-3.5-flash";

// 초 단위 오프셋으로 발생 시각을 벌린다.
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

const docIdOf = (eventId: string): string =>
  toCommentaryDocId(eventId, VARIANT.locale, VARIANT.explanationLevel);

// 호출 · 저장 기록을 남기는 테스트 하네스. 시간은 호출마다 step 만큼 흐른다.
const buildHarness = (
  options: {
    generate?: (request: LlmCommentaryRequest) => Promise<LlmCommentary>;
    startMs?: number;
    stepMs?: number;
  } = {},
) => {
  const requests: LlmCommentaryRequest[] = [];
  const saved: { docId: string; document: CommentaryDocument }[] = [];
  let now = options.startMs ?? 0;

  return {
    requests,
    saved,
    deps: {
      generate: async (request: LlmCommentaryRequest): Promise<LlmCommentary> => {
        requests.push(request);
        now += options.stepMs ?? 0;

        if (options.generate !== undefined) {
          return options.generate(request);
        }

        return { sourceEventId: request.event.id, text: `해설 ${request.event.id}` };
      },
      save: async (docId: string, document: CommentaryDocument): Promise<void> => {
        saved.push({ docId, document });
      },
      nowMs: (): number => now,
    },
  };
};

const runOptions = (
  events: readonly RaceEvent[],
  context: CommentaryRunContext,
  budgetEndMs = Number.MAX_SAFE_INTEGER,
) => ({
  events,
  snapshot: SNAPSHOT,
  variants: VARIANTS,
  context,
  model: MODEL,
  budgetEndMs,
  callBudgetMs: 0,
});

describe("selectPendingCommentaryTasks", () => {
  it("해설 대상 타입만 고른다", () => {
    const { tasks } = selectPendingCommentaryTasks(
      [
        buildEvent("event:penalty", 0, RaceEventType.Penalty),
        // 추월은 도메인 문장이 사실을 다 전달해 allowlist 에서 빠져 있다.
        buildEvent("event:overtake", 1, RaceEventType.Overtake),
      ],
      VARIANTS,
      EMPTY_COMMENTARY_RUN_CONTEXT,
    );

    expect(tasks.map((task) => task.event.id)).toEqual(["event:penalty"]);
  });

  it("입력 순서와 무관하게 시간순으로 늘어놓는다", () => {
    const { tasks } = selectPendingCommentaryTasks(
      [
        buildEvent("event:c", 30),
        buildEvent("event:a", 10),
        buildEvent("event:b", 20),
      ],
      VARIANTS,
      EMPTY_COMMENTARY_RUN_CONTEXT,
    );

    expect(tasks.map((task) => task.event.id)).toEqual([
      "event:a",
      "event:b",
      "event:c",
    ]);
  });

  it("변형이 늘면 이벤트당 작업 수도 그만큼 는다", () => {
    const { tasks } = selectPendingCommentaryTasks(
      [buildEvent("event:a", 0)],
      [VARIANT, EN_VARIANT],
      EMPTY_COMMENTARY_RUN_CONTEXT,
    );

    expect(tasks).toHaveLength(2);
    expect(new Set(tasks.map((task) => task.docId)).size).toBe(2);
    // 변형 키가 작업마다 실려야 러닝 컨텍스트에서 자기 맥락만 꺼낼 수 있다.
    expect(tasks.map((task) => task.variantKey)).toEqual([
      toCommentaryVariantKey(VARIANT),
      toCommentaryVariantKey(EN_VARIANT),
    ]);
  });

  it("파싱 불가 timestamp 가 섞여도 순서가 결정론적이다", () => {
    // comparator 가 NaN 을 돌려주면 정렬이 엔진 구현에 맡겨진다.
    const broken = { ...buildEvent("event:broken", 0), timestamp: "not-a-date" };
    const order = (events: RaceEvent[]): string[] =>
      selectPendingCommentaryTasks(
        events,
        VARIANTS,
        EMPTY_COMMENTARY_RUN_CONTEXT,
      ).tasks.map((task) => task.event.id);

    const forward = order([
      buildEvent("event:b", 20),
      broken,
      buildEvent("event:a", 10),
    ]);
    const reversed = order([
      buildEvent("event:a", 10),
      broken,
      buildEvent("event:b", 20),
    ]);

    expect(forward).toEqual(reversed);
    // 시각을 모르는 이벤트는 맨 뒤로 몰아 맥락 순서를 흐리지 않는다.
    expect(forward).toEqual(["event:a", "event:b", "event:broken"]);
  });

  it("재시도 상한을 넘긴 해설은 더 이상 작업으로 잡히지 않는다", () => {
    let context = EMPTY_COMMENTARY_RUN_CONTEXT;

    for (let attempt = 0; attempt < MAX_COMMENTARY_ATTEMPTS; attempt += 1) {
      context = recordCommentaryFailure(context, docIdOf("event:a"));
    }

    const selection = selectPendingCommentaryTasks(
      [buildEvent("event:a", 0), buildEvent("event:b", 10)],
      VARIANTS,
      context,
    );

    expect(selection.tasks.map((task) => task.event.id)).toEqual(["event:b"]);
    expect(selection.retryExhausted).toBe(1);
  });
});

describe("generateCommentaryForEvents", () => {
  it("이벤트를 시간순으로 처리하고 직전 해설을 다음 프롬프트에 넘긴다", async () => {
    const events = [
      buildEvent("event:c", 30),
      buildEvent("event:a", 10),
      buildEvent("event:b", 20),
    ];
    const harness = buildHarness();

    const result = await generateCommentaryForEvents(
      runOptions(events, EMPTY_COMMENTARY_RUN_CONTEXT),
      harness.deps,
    );

    expect(result.generated).toBe(3);
    expect(harness.requests.map((request) => request.event.id)).toEqual([
      "event:a",
      "event:b",
      "event:c",
    ]);
    // 첫 호출은 맥락이 비어 있고, 이후 호출은 직전 해설을 들고 간다.
    expect(harness.requests[0]?.recentCommentary).toEqual([]);
    expect(harness.requests[1]?.recentCommentary).toEqual(["해설 event:a"]);
    expect(harness.requests[2]?.recentCommentary).toEqual([
      "해설 event:a",
      "해설 event:b",
    ]);
  });

  it("러닝 컨텍스트의 직전 해설을 최근 N 건으로 유지한다", async () => {
    const events = Array.from({ length: RECENT_COMMENTARY_LIMIT + 3 }, (_, index) =>
      buildEvent(`event:${index}`, index),
    );
    const harness = buildHarness();

    const result = await generateCommentaryForEvents(
      runOptions(events, EMPTY_COMMENTARY_RUN_CONTEXT),
      harness.deps,
    );

    const recent =
      result.nextContext.recentTextsByVariant[toCommentaryVariantKey(VARIANT)];

    expect(recent).toHaveLength(RECENT_COMMENTARY_LIMIT);
    expect(recent?.at(-1)).toBe(`해설 event:${events.length - 1}`);
    expect(result.nextContext.generatedCount).toBe(events.length);
  });

  it("이미 저장한 해설은 다시 생성하지 않는다 (멱등)", async () => {
    const events = [buildEvent("event:a", 0), buildEvent("event:b", 10)];
    const context = appendCommentaryToRunContext(
      EMPTY_COMMENTARY_RUN_CONTEXT,
      toCommentaryVariantKey(VARIANT),
      docIdOf("event:a"),
      "이미 만든 해설",
    );
    const harness = buildHarness();

    const result = await generateCommentaryForEvents(
      runOptions(events, context),
      harness.deps,
    );

    expect(harness.requests.map((request) => request.event.id)).toEqual([
      "event:b",
    ]);
    expect(result.generated).toBe(1);
  });

  it("같은 입력을 두 번 처리해도 저장이 늘지 않는다", async () => {
    const events = [buildEvent("event:a", 0), buildEvent("event:b", 10)];
    const first = buildHarness();
    const firstRun = await generateCommentaryForEvents(
      runOptions(events, EMPTY_COMMENTARY_RUN_CONTEXT),
      first.deps,
    );

    const second = buildHarness();
    const secondRun = await generateCommentaryForEvents(
      runOptions(events, firstRun.nextContext),
      second.deps,
    );

    expect(first.saved).toHaveLength(2);
    expect(second.saved).toHaveLength(0);
    expect(secondRun.generated).toBe(0);
    expect(secondRun.hasContextChanged).toBe(false);
  });

  it("mock 해설은 저장하지 않고 맥락에도 남기지 않는다", async () => {
    const harness = buildHarness({
      generate: async (request) => ({
        sourceEventId: request.event.id,
        text: "경기의 주목할 만한 순간입니다",
        isMock: true,
      }),
    });

    const result = await generateCommentaryForEvents(
      runOptions([buildEvent("event:a", 0)], EMPTY_COMMENTARY_RUN_CONTEXT),
      harness.deps,
    );

    expect(harness.saved).toHaveLength(0);
    expect(result.mockDropped).toBe(1);
    expect(result.generated).toBe(0);
    // 텍스트는 맥락에 남지 않는다. 실패 횟수만 남아 재시도 상한을 센다.
    expect(result.nextContext.recentTextsByVariant).toEqual({});
    expect(result.nextContext.generatedKeys).toEqual([]);
  });

  it("LLM 실패는 그 이벤트만 건너뛰고 나머지는 계속 처리한다", async () => {
    const harness = buildHarness({
      generate: async (request) => {
        if (request.event.id === "event:a") {
          throw new Error("quota exceeded");
        }

        return { sourceEventId: request.event.id, text: `해설 ${request.event.id}` };
      },
    });

    const result = await generateCommentaryForEvents(
      runOptions(
        [buildEvent("event:a", 0), buildEvent("event:b", 10)],
        EMPTY_COMMENTARY_RUN_CONTEXT,
      ),
      harness.deps,
    );

    // 실패한 이벤트는 저장되지 않지만 예외가 밖으로 새지 않는다 — 폴링이 멈추면 안 된다.
    expect(result.failed).toBe(1);
    expect(result.generated).toBe(1);
    expect(harness.saved.map((entry) => entry.document.sourceEventId)).toEqual([
      "event:b",
    ]);
  });

  it("빈 응답은 저장하지 않는다 (저장 스키마가 text 를 요구한다)", async () => {
    const harness = buildHarness({
      generate: async (request) => ({
        sourceEventId: request.event.id,
        text: "   ",
      }),
    });

    const result = await generateCommentaryForEvents(
      runOptions([buildEvent("event:a", 0)], EMPTY_COMMENTARY_RUN_CONTEXT),
      harness.deps,
    );

    expect(harness.saved).toHaveLength(0);
    expect(result.failed).toBe(1);
  });

  it("저장 실패도 폴링을 중단시키지 않고 맥락에 남지 않는다", async () => {
    const harness = buildHarness();
    const failingDeps = {
      ...harness.deps,
      save: async (): Promise<void> => {
        throw new Error("firestore unavailable");
      },
    };

    const result = await generateCommentaryForEvents(
      runOptions([buildEvent("event:a", 0)], EMPTY_COMMENTARY_RUN_CONTEXT),
      failingDeps,
    );

    expect(result.failed).toBe(1);
    expect(result.nextContext.generatedKeys).toEqual([]);
  });

  it("시간 예산을 넘기면 남은 이벤트를 다음 기동으로 넘긴다", async () => {
    const events = [
      buildEvent("event:a", 0),
      buildEvent("event:b", 10),
      buildEvent("event:c", 20),
    ];
    // 호출마다 10초가 흐르고 예산은 25초다 — 두 건 뒤에는 남은 시간이 모자란다.
    const harness = buildHarness({ startMs: 0, stepMs: 10_000 });
    const deferred: number[] = [];

    const result = await generateCommentaryForEvents(
      {
        ...runOptions(events, EMPTY_COMMENTARY_RUN_CONTEXT, 25_000),
        callBudgetMs: 10_000,
      },
      {
        ...harness.deps,
        onBudgetExhausted: (remaining) => deferred.push(remaining),
      },
    );

    expect(result.generated).toBe(2);
    expect(result.deferred).toBe(1);
    expect(deferred).toEqual([1]);
  });

  it("예산으로 넘긴 이벤트를 다음 기동이 이어받는다", async () => {
    const events = [
      buildEvent("event:a", 0),
      buildEvent("event:b", 10),
      buildEvent("event:c", 20),
    ];
    const first = buildHarness({ startMs: 0, stepMs: 10_000 });
    const firstRun = await generateCommentaryForEvents(
      {
        ...runOptions(events, EMPTY_COMMENTARY_RUN_CONTEXT, 25_000),
        callBudgetMs: 10_000,
      },
      first.deps,
    );

    // 다음 기동은 같은 이벤트 목록을 다시 계산해 받는다(폴러는 매번 전체를 재계산한다).
    const second = buildHarness();
    const secondRun = await generateCommentaryForEvents(
      runOptions(events, firstRun.nextContext),
      second.deps,
    );

    expect(second.requests.map((request) => request.event.id)).toEqual([
      "event:c",
    ]);
    expect(secondRun.generated).toBe(1);
    // 이어받은 해설도 직전 창의 맥락을 그대로 들고 간다.
    expect(second.requests[0]?.recentCommentary).toEqual([
      "해설 event:a",
      "해설 event:b",
    ]);
  });

  it("변형마다 자기 직전 해설만 프롬프트로 받는다", async () => {
    // 평평한 배열 하나를 공유하면 한국어 해설이 영어 프롬프트의 "직전 해설"로 들어간다.
    const events = [buildEvent("event:a", 0), buildEvent("event:b", 10)];
    const harness = buildHarness({
      generate: async (request) => ({
        sourceEventId: request.event.id,
        text: `${request.locale} ${request.event.id}`,
      }),
    });

    const result = await generateCommentaryForEvents(
      {
        ...runOptions(events, EMPTY_COMMENTARY_RUN_CONTEXT),
        variants: [VARIANT, EN_VARIANT],
      },
      harness.deps,
    );

    expect(result.generated).toBe(4);

    const byVariant = (locale: SupportedLocale): (string[] | undefined)[] =>
      harness.requests
        .filter((request) => request.locale === locale)
        .map((request) => request.recentCommentary);

    // 각 변형이 자기 것만, 그리고 온전히 N 건까지 들고 간다.
    expect(byVariant(SupportedLocale.Ko)).toEqual([[], ["ko event:a"]]);
    expect(byVariant(SupportedLocale.En)).toEqual([[], ["en event:a"]]);

    expect(
      result.nextContext.recentTextsByVariant[
        toCommentaryVariantKey(EN_VARIANT)
      ],
    ).toEqual(["en event:a", "en event:b"]);
  });

  it("실패가 상한에 닿으면 다음 기동부터 영구히 건너뛴다", async () => {
    const events = [buildEvent("event:a", 0)];
    let context = EMPTY_COMMENTARY_RUN_CONTEXT;
    let totalCalls = 0;

    // 결정론적으로 실패하는 이벤트(콘텐츠 필터 등)를 상한 뒤에도 계속 부르면
    // 90분 레이스에서 이벤트 1건이 90회를 먹는다.
    for (let window = 0; window < MAX_COMMENTARY_ATTEMPTS + 3; window += 1) {
      const harness = buildHarness({
        generate: async () => {
          throw new Error("content filtered");
        },
      });
      const run = await generateCommentaryForEvents(
        runOptions(events, context),
        harness.deps,
      );

      totalCalls += harness.requests.length;
      context = run.nextContext;
    }

    expect(totalCalls).toBe(MAX_COMMENTARY_ATTEMPTS);
    expect(
      selectPendingCommentaryTasks(events, VARIANTS, context).retryExhausted,
    ).toBe(1);
  });

  it("mock 폴백도 실패로 세어 상한에 반영한다", async () => {
    // 워커는 FallbackLlmProvider 를 쓴다 — 실제 LLM 오류는 예외가 아니라 isMock 으로 온다.
    // 여기서 세지 않으면 재시도 상한이 프로덕션에서 한 번도 발동하지 않는다.
    const harness = buildHarness({
      generate: async (request) => ({
        sourceEventId: request.event.id,
        text: "경기의 주목할 만한 순간입니다",
        isMock: true,
      }),
    });

    const result = await generateCommentaryForEvents(
      runOptions([buildEvent("event:a", 0)], EMPTY_COMMENTARY_RUN_CONTEXT),
      harness.deps,
    );

    expect(result.mockDropped).toBe(1);
    expect(result.nextContext.failureCounts[docIdOf("event:a")]).toBe(1);
    // 실패 횟수를 저장해야 다음 기동이 상한을 안다.
    expect(result.hasContextChanged).toBe(true);
  });

  it("저장 실패도 실패 횟수로 남는다", async () => {
    const harness = buildHarness();
    const failingDeps = {
      ...harness.deps,
      save: async (): Promise<void> => {
        throw new Error("firestore unavailable");
      },
    };

    const result = await generateCommentaryForEvents(
      runOptions([buildEvent("event:a", 0)], EMPTY_COMMENTARY_RUN_CONTEXT),
      failingDeps,
    );

    expect(result.nextContext.failureCounts[docIdOf("event:a")]).toBe(1);
    expect(result.hasContextChanged).toBe(true);
  });

  it("저장 문서에 모델과 변형이 남는다", async () => {
    const harness = buildHarness({ startMs: Date.parse("2026-07-19T06:00:00.000Z") });

    await generateCommentaryForEvents(
      runOptions([buildEvent("event:a", 0)], EMPTY_COMMENTARY_RUN_CONTEXT),
      harness.deps,
    );

    const entry = harness.saved[0];

    expect(entry?.docId).toBe(docIdOf("event:a"));
    expect(entry?.document.model).toBe(MODEL);
    expect(entry?.document.locale).toBe(SupportedLocale.Ko);
    expect(entry?.document.explanationLevel).toBe(ExplanationLevel.Standard);
    expect(entry?.document.generatedAt).toBe("2026-07-19T06:00:00.000Z");
  });

  // 시점 맥락 저장 (docs/21-commentary-ask.md §시점 맥락을 해설 문서에 저장한다).
  // provider 가 프롬프트에서 본 맥락을 실어 보내면, 워커가 재계산 없이 그대로 저장한다.
  const buildContext = (currentLap: number): CommentaryContext => ({
    scope: RaceEventScope.Driver,
    event: {
      type: RaceEventType.Penalty,
      driverNumber: 44,
      driverCode: "HAM",
      lapNumber: currentLap,
      params: {},
    },
    session: {
      status: SessionStatus.Green,
      currentLap,
      totalLaps: 44,
      lapsRemaining: 44 - currentLap,
      retiredCount: 0,
    },
    standings: [
      { position: 1, code: "VER", team: "Red Bull", gapToLeaderSeconds: null },
    ],
    recentCommentary: [],
  });

  it("provider 가 실어 보낸 시점 맥락을 저장 문서에 그대로 담는다", async () => {
    const context = buildContext(12);
    const harness = buildHarness({
      generate: async (request) => ({
        sourceEventId: request.event.id,
        text: `해설 ${request.event.id}`,
        pointInTimeContext: context,
      }),
    });

    await generateCommentaryForEvents(
      runOptions([buildEvent("event:a", 0)], EMPTY_COMMENTARY_RUN_CONTEXT),
      harness.deps,
    );

    // 재계산이 아니라 provider 가 준 그 객체를 저장한다 — "해설이 본 것 == 저장한 것".
    expect(harness.saved[0]?.document.pointInTimeContext).toEqual(context);
  });

  it("provider 가 맥락을 안 주면 저장 문서에 필드를 담지 않는다", async () => {
    // 기존 불변식: 맥락 없는 생성물은 옛 문서 형태(필드 없음)를 그대로 유지한다.
    const harness = buildHarness({
      generate: async (request) => ({
        sourceEventId: request.event.id,
        text: `해설 ${request.event.id}`,
      }),
    });

    await generateCommentaryForEvents(
      runOptions([buildEvent("event:a", 0)], EMPTY_COMMENTARY_RUN_CONTEXT),
      harness.deps,
    );

    expect(Object.keys(harness.saved[0]?.document ?? {})).not.toContain(
      "pointInTimeContext",
    );
  });
});
