import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { RaceEventScope } from "../RaceEventScope";
import { getRaceEventScope } from "../RaceEventScopeMap";
import { RaceEventType } from "../RaceEventType";
import { isCommentaryEligible } from "../ai/AiCommentary";
import { LlmCommentary, LlmCommentaryRequest } from "../ai/RaceLlmProvider";
import { CommentaryDocument } from "../firestore/CommentaryDocument";
import {
  CommentaryTask,
  generateCommentaryForEvents,
  selectPendingCommentaryTasks,
} from "./CommentaryGeneration";
import { CommentaryRunContext } from "./CommentaryRunContext";
import {
  CommentaryVariant,
  toCommentaryVariantKey,
} from "./CommentaryVariant";

// 리플레이 하네스의 해설 생성 (docs/04-worker-openf1.md §해설 생성).
//
// 실제 F1 세션 없이 워커의 해설 경로를 검증하기 위한 얇은 겉껍질이다.
// **생성 루프 자체는 한 줄도 다시 쓰지 않는다** — `generateCommentaryForEvents` 를
// 그대로 부른다. 하네스용으로 루프를 복제하면 하네스가 통과해도 워커가 다를 수 있어
// 검증 가치가 사라진다. 여기가 더하는 것은 두 가지뿐이다.
//
//   1. 호출 수 상한 — 무료 티어 한도(일 250회)와 지출 상한($5)을 하네스가 태우지 않게 한다.
//   2. 사람이 읽을 기록 — 연속된 문장이 서로 다른 이야기를 하는지는 눈으로만 판정된다.
//
// 상한을 "생성 루프에 카운터를 넣어" 구현하지 않는 이유도 같다. 루프에 하네스 전용
// 분기가 생기는 순간 워커가 도는 코드와 하네스가 도는 코드가 갈린다. 대신 루프에
// **넘길 이벤트를 미리 줄인다** — 루프는 자기가 상한 아래에서 돌고 있다는 것을 모른다.

// 기본 호출 상한. 레이스 하나의 해설 대상이 47건 수준(스파 실측)이라 한 변형이면
// 한 번 완주가 이 안에 들어온다. 보수적으로 잡아 두고 필요할 때만 환경변수로 올린다.
export const DEFAULT_REPLAY_COMMENTARY_CALL_CAP = 60;

export enum ReplayCommentaryOutcome {
  // 실제 LLM 문장을 받아 저장까지 끝난 건.
  Generated = "generated",
  // LLM 예외 · 빈 응답 · 저장 실패.
  Failed = "failed",
  // FallbackLlmProvider 가 mock 으로 떨어진 건. 저장하지 않는다(docs/18 §폴백).
  MockDropped = "mockDropped",
}

// 사람이 읽을 기록 한 줄. 생성 순서대로(=시간순) 쌓인다.
export type ReplayCommentaryEntry = {
  outcome: ReplayCommentaryOutcome;
  eventId: string;
  eventType: RaceEventType;
  scope: RaceEventScope;
  variantKey: string;
  // 원 이벤트 시각. 해설 생성 시각이 아니라 이것으로 정렬을 판정한다.
  timestamp: string;
  text: string | null;
  failureReason: string | null;
};

// 상한을 적용한 뒤의 실행 계획. 실행 전에 "몇 번 부를 것인지" 를 알리는 데 쓴다.
export type ReplayCommentaryPlan = {
  totalEvents: number;
  eligibleEvents: number;
  // 상한이 없었다면 부를 횟수.
  plannedCalls: number;
  // 상한을 적용해 실제로 시도할 횟수.
  acceptedCalls: number;
  // 상한 때문에 포기한 횟수.
  skippedByCallCap: number;
  callCap: number;
  isCallCapReached: boolean;
  // 이번에 생성 루프로 넘길 이벤트 id.
  acceptedEventIds: ReadonlySet<string>;
  // 재시도 상한을 넘겨 애초에 후보에서 빠진 수.
  retryExhausted: number;
};

export type ReplayCommentaryReport = {
  plan: ReplayCommentaryPlan;
  entries: readonly ReplayCommentaryEntry[];
  generated: number;
  failed: number;
  mockDropped: number;
  deferred: number;
  retryExhausted: number;
  // 실제로 provider 를 부른 횟수. 계획과 어긋나면 재시도 폭주를 의심해야 한다.
  llmCalls: number;
  nextContext: CommentaryRunContext;
  hasContextChanged: boolean;
};

export type ReplayCommentaryOptions = {
  events: readonly RaceEvent[];
  snapshot: LiveRaceSnapshot;
  variants: readonly CommentaryVariant[];
  context: CommentaryRunContext;
  model: string;
  budgetEndMs: number;
  callBudgetMs: number;
  callCap: number;
};

export type ReplayCommentaryDeps = {
  generate: (request: LlmCommentaryRequest) => Promise<LlmCommentary>;
  save: (docId: string, document: CommentaryDocument) => Promise<void>;
  nowMs: () => number;
};

const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류";
};

// 같은 이벤트의 변형 작업을 한 덩어리로 묶는다.
//
// `selectPendingCommentaryTasks` 가 이벤트 바깥 · 변형 안쪽으로 도는 덕에 같은 이벤트의
// 작업은 이미 연속으로 놓여 있다. 그 성질에 기대어 한 번 훑는다.
const groupTasksByEvent = (
  tasks: readonly CommentaryTask[],
): CommentaryTask[][] => {
  const groups: CommentaryTask[][] = [];
  let current: CommentaryTask[] = [];

  for (const task of tasks) {
    const head = current[0];

    if (head !== undefined && head.event.id !== task.event.id) {
      groups.push(current);
      current = [];
    }

    current.push(task);
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
};

// 호출 상한 안에 들어오는 이벤트만 고른다.
//
// **이벤트 단위로 자른다.** 변형이 둘 이상일 때 작업 단위로 자르면 한 이벤트의 ko 는
// 있고 en 은 없는 상태가 남아, 다음 실행이 그 이벤트를 다시 집는다. 상한이 중간을
// 가르지 않게 해 두면 "어디까지 봤는지" 가 이벤트 경계와 일치한다.
export const planReplayCommentary = (
  events: readonly RaceEvent[],
  variants: readonly CommentaryVariant[],
  context: CommentaryRunContext,
  callCap: number,
): ReplayCommentaryPlan => {
  const selection = selectPendingCommentaryTasks(events, variants, context);
  const acceptedEventIds = new Set<string>();
  let acceptedCalls = 0;

  for (const group of groupTasksByEvent(selection.tasks)) {
    const head = group[0];

    if (head === undefined) {
      continue;
    }

    if (acceptedCalls + group.length > callCap) {
      break;
    }

    acceptedEventIds.add(head.event.id);
    acceptedCalls += group.length;
  }

  const plannedCalls = selection.tasks.length;

  return {
    totalEvents: events.length,
    eligibleEvents: events.filter((event) => isCommentaryEligible(event)).length,
    plannedCalls,
    acceptedCalls,
    skippedByCallCap: plannedCalls - acceptedCalls,
    callCap,
    isCallCapReached: acceptedCalls < plannedCalls,
    acceptedEventIds,
    retryExhausted: selection.retryExhausted,
  };
};

// 워커와 같은 생성 루프를 상한 안에서 돌리고, 사람이 읽을 기록을 함께 모은다.
export const runReplayCommentary = async (
  options: ReplayCommentaryOptions,
  deps: ReplayCommentaryDeps,
): Promise<ReplayCommentaryReport> => {
  const plan = planReplayCommentary(
    options.events,
    options.variants,
    options.context,
    options.callCap,
  );
  const entries: ReplayCommentaryEntry[] = [];
  let llmCalls = 0;

  // 상한 밖의 이벤트는 루프에 아예 넘기지 않는다. 루프는 평소대로 돌 뿐이다.
  const acceptedEvents = options.events.filter((event) =>
    plan.acceptedEventIds.has(event.id),
  );

  const generation = await generateCommentaryForEvents(
    {
      events: acceptedEvents,
      snapshot: options.snapshot,
      variants: options.variants,
      context: options.context,
      model: options.model,
      budgetEndMs: options.budgetEndMs,
      callBudgetMs: options.callBudgetMs,
    },
    {
      // 계획이 아니라 **실제 호출 수**를 센다. 둘이 어긋나면 그것 자체가 보고할 사실이다.
      generate: async (request) => {
        llmCalls += 1;

        return deps.generate(request);
      },
      // 저장이 끝난 뒤에만 성공으로 적는다. 저장이 던지면 onFailure 가 실패로 적는다.
      save: async (docId, document) => {
        await deps.save(docId, document);

        entries.push({
          outcome: ReplayCommentaryOutcome.Generated,
          eventId: document.sourceEventId,
          eventType: document.sourceEventType,
          scope: getRaceEventScope(document.sourceEventType),
          variantKey: toCommentaryVariantKey({
            locale: document.locale,
            explanationLevel: document.explanationLevel,
          }),
          timestamp: document.timestamp,
          text: document.text,
          failureReason: null,
        });
      },
      nowMs: deps.nowMs,
      onFailure: (task, error) => {
        entries.push({
          outcome: ReplayCommentaryOutcome.Failed,
          eventId: task.event.id,
          eventType: task.event.type,
          scope: getRaceEventScope(task.event.type),
          variantKey: task.variantKey,
          timestamp: task.event.timestamp,
          text: null,
          failureReason: describeError(error),
        });
      },
      onMockDropped: (task) => {
        entries.push({
          outcome: ReplayCommentaryOutcome.MockDropped,
          eventId: task.event.id,
          eventType: task.event.type,
          scope: getRaceEventScope(task.event.type),
          variantKey: task.variantKey,
          timestamp: task.event.timestamp,
          text: null,
          // mock 은 "LLM 이 실패해 폴백했다" 는 뜻이다. 성공으로 읽히면 안 된다.
          failureReason: "실제 LLM 이 실패해 mock 으로 폴백했다 (저장하지 않음)",
        });
      },
    },
  );

  return {
    plan,
    entries,
    generated: generation.generated,
    failed: generation.failed,
    mockDropped: generation.mockDropped,
    deferred: generation.deferred,
    retryExhausted: plan.retryExhausted,
    llmCalls,
    nextContext: generation.nextContext,
    hasContextChanged: generation.hasContextChanged,
  };
};

const OUTCOME_LABELS: Record<ReplayCommentaryOutcome, string> = {
  [ReplayCommentaryOutcome.Generated]: "OK  ",
  [ReplayCommentaryOutcome.Failed]: "FAIL",
  [ReplayCommentaryOutcome.MockDropped]: "MOCK",
};

// 기록 한 건을 두 줄로 편다. 첫 줄이 무엇인지, 둘째 줄이 실제 문장이다.
export const formatReplayCommentaryEntry = (
  entry: ReplayCommentaryEntry,
  index: number,
): string => {
  const order = String(index + 1).padStart(3, " ");
  const head = `[${order}] ${OUTCOME_LABELS[entry.outcome]} ${entry.timestamp} ${entry.eventType} (${entry.scope}) ${entry.variantKey}`;
  const body = entry.text ?? `실패: ${entry.failureReason ?? "사유 없음"}`;

  return `${head}\n        ${body}`;
};

// 실행 **전에** 알릴 계획. 예상 호출 수를 모르고 시작하면 상한이 사후 통보가 된다.
export const formatReplayCommentaryPlan = (
  plan: ReplayCommentaryPlan,
): string[] => {
  const lines = [
    `해설 생성 계획: 이벤트 ${plan.totalEvents}건 중 해설 대상 ${plan.eligibleEvents}건, 예상 LLM 호출 ${plan.plannedCalls}회 (상한 ${plan.callCap}회)`,
  ];

  if (plan.retryExhausted > 0) {
    lines.push(
      `  재시도 상한을 넘겨 영구히 건너뛴 해설 ${plan.retryExhausted}건은 호출하지 않는다`,
    );
  }

  if (plan.isCallCapReached) {
    lines.push(
      `  호출 상한에 걸려 ${plan.skippedByCallCap}회는 이번 실행에서 생성하지 않는다. 상한을 올리려면 POLL_COMMENTARY_CALL_CAP 을 조정한다`,
    );
  }

  return lines;
};

export const formatReplayCommentarySummary = (
  report: ReplayCommentaryReport,
): string[] => {
  const lines = [
    "── 해설 생성 요약 ──",
    `총 이벤트 ${report.plan.totalEvents}건 · 해설 대상 ${report.plan.eligibleEvents}건 · 예상 호출 ${report.plan.plannedCalls}회`,
    `성공 ${report.generated} · 실패 ${report.failed} · mock 폐기 ${report.mockDropped} · 시간예산 이월 ${report.deferred} · 재시도 포기 ${report.retryExhausted}`,
    `실제 LLM 호출 ${report.llmCalls}회 (상한 ${report.plan.callCap}회)`,
  ];

  if (report.plan.isCallCapReached) {
    lines.push(
      `호출 상한에 도달해 ${report.plan.skippedByCallCap}회는 생성하지 않았다. 나머지를 보려면 상한을 올리고 다시 실행한다`,
    );
  }

  return lines;
};
