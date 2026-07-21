import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { isCommentaryEligible, toAiCommentary } from "../ai/AiCommentary";
import {
  LlmCommentary,
  LlmCommentaryRequest,
} from "../ai/RaceLlmProvider";
import {
  CommentaryDocument,
  toCommentaryDocId,
  toCommentaryDocument,
} from "../firestore/CommentaryDocument";
import {
  appendCommentaryToRunContext,
  CommentaryRunContext,
  getRecentCommentary,
  hasExhaustedCommentaryRetries,
  hasGeneratedCommentary,
  MAX_COMMENTARY_ATTEMPTS,
  recordCommentaryFailure,
} from "./CommentaryRunContext";
import {
  CommentaryVariant,
  toCommentaryVariantKey,
} from "./CommentaryVariant";

// 워커의 해설 생성 루프 (docs/18-ai-commentary-worker.md).
//
// Firestore 도 LLM 도 직접 만지지 않는다. 둘 다 주입받는 함수로 두어 도메인 테스트에서
// 순서 · 멱등 · 실패 처리 · 시간 예산을 전부 고정할 수 있게 한다
// (vitest 는 packages/**/test 만 수집하므로 functions/ 안에 두면 검증할 방법이 없다).

// 한 이벤트 × 한 변형의 생성 작업.
export type CommentaryTask = {
  event: RaceEvent;
  variant: CommentaryVariant;
  // 러닝 컨텍스트에서 이 변형의 직전 해설을 꺼내는 키. 변형 간 맥락이 섞이지 않게 한다.
  variantKey: string;
  docId: string;
};

export type CommentaryTaskSelection = {
  tasks: CommentaryTask[];
  // 재시도 상한을 넘겨 영구히 건너뛴 작업 수. 관측용이며 다시 호출되지 않는다.
  retryExhausted: number;
};

export type CommentaryGenerationDeps = {
  // 실패하면 예외를 던진다. 그 이벤트만 건너뛰고 폴링은 계속된다.
  generate: (request: LlmCommentaryRequest) => Promise<LlmCommentary>;
  save: (docId: string, document: CommentaryDocument) => Promise<void>;
  nowMs: () => number;
  onFailure?: (task: CommentaryTask, error: unknown) => void;
  // mock 텍스트라 저장하지 않고 버린 경우.
  onMockDropped?: (task: CommentaryTask) => void;
  // 시간 예산이 모자라 남긴 작업 수.
  onBudgetExhausted?: (remaining: number) => void;
};

export type CommentaryGenerationOptions = {
  // 폴링이 계산한 이벤트 전체. 해설 대상 선별과 순서 정렬은 이 함수가 한다.
  events: readonly RaceEvent[];
  snapshot: LiveRaceSnapshot;
  variants: readonly CommentaryVariant[];
  context: CommentaryRunContext;
  // 해설 문서에 남길 모델 id.
  model: string;
  // 이 시각을 넘기면 새 생성을 시작하지 않는다.
  budgetEndMs: number;
  // LLM 호출 1회가 최악의 경우 잡아먹는 시간. 이만큼 여유가 없으면 시작하지 않는다.
  // provider 의 요청 타임아웃과 같은 출처여야 이 값이 가정이 아니라 계약이 된다
  // (packages/domain/src/ai/LlmRequestTimeout.ts).
  callBudgetMs: number;
  // 한 해설을 몇 번까지 시도할지. 기본값 MAX_COMMENTARY_ATTEMPTS.
  maxAttempts?: number;
};

export type CommentaryGenerationResult = {
  nextContext: CommentaryRunContext;
  // 실제로 저장한 건수.
  generated: number;
  // LLM 이 던져서 저장하지 못한 건수.
  failed: number;
  // mock 이라 버린 건수.
  mockDropped: number;
  // 시간 예산이 모자라 다음 기동으로 넘긴 건수.
  deferred: number;
  // 재시도 상한을 넘겨 영구히 포기한 건수.
  retryExhausted: number;
  // 러닝 컨텍스트를 실제로 갱신했는지. false 면 문서를 쓸 필요가 없다.
  hasContextChanged: boolean;
};

// 해설 대상을 시간순으로 늘어놓는다.
//
// 순서가 뒤집히면 직전 해설이 맥락으로 쌓이지 않아 이 작업의 핵심 가치가 사라진다.
// 같은 시각이면 id 로 갈라 재기동 간에도 같은 순서가 나오게 한다(결정론).
//
// 파싱 불가 timestamp 는 맨 뒤로 몰아 id 로 가른다. NaN 을 그대로 빼면 comparator 가
// NaN 을 돌려주고 정렬 결과가 엔진 구현에 맡겨져 위의 결정론 약속이 깨진다.
const UNPARSEABLE_TIMESTAMP_MS = Number.MAX_SAFE_INTEGER;

const toSortableMs = (timestamp: string): number => {
  const ms = Date.parse(timestamp);

  if (Number.isNaN(ms)) {
    return UNPARSEABLE_TIMESTAMP_MS;
  }

  return ms;
};

const orderEventsByTime = (events: readonly RaceEvent[]): RaceEvent[] =>
  [...events].sort((a, b) => {
    const diff = toSortableMs(a.timestamp) - toSortableMs(b.timestamp);

    if (diff !== 0) {
      return diff;
    }

    return a.id.localeCompare(b.id);
  });

// 아직 저장하지 않은 (이벤트 × 변형) 작업만 시간순으로 골라낸다.
//
// 이미 저장된 것은 러닝 컨텍스트의 키로 걸러 낸다 — 이벤트마다 Firestore 읽기를
// 날리지 않는다(CommentaryRunContext.ts 주석 참고). 폴링은 매번 "지금까지의 전체
// 이벤트"를 재계산하므로, 지난 창에서 예산 때문에 남긴 이벤트도 여기 다시 잡힌다.
export const selectPendingCommentaryTasks = (
  events: readonly RaceEvent[],
  variants: readonly CommentaryVariant[],
  context: CommentaryRunContext,
  maxAttempts: number = MAX_COMMENTARY_ATTEMPTS,
): CommentaryTaskSelection => {
  const tasks: CommentaryTask[] = [];
  let retryExhausted = 0;

  for (const event of orderEventsByTime(events)) {
    if (!isCommentaryEligible(event)) {
      continue;
    }

    for (const variant of variants) {
      const docId = toCommentaryDocId(
        event.id,
        variant.locale,
        variant.explanationLevel,
      );

      if (hasGeneratedCommentary(context, docId)) {
        continue;
      }

      // 결정론적으로 실패하는 해설을 레이스 내내 다시 부르지 않는다.
      if (hasExhaustedCommentaryRetries(context, docId, maxAttempts)) {
        retryExhausted += 1;

        continue;
      }

      tasks.push({
        event,
        variant,
        variantKey: toCommentaryVariantKey(variant),
        docId,
      });
    }
  }

  return { tasks, retryExhausted };
};

// 남은 작업을 시간순으로 처리한다.
//
// 원칙 네 가지 (docs/18 §폴백):
//   1. LLM 실패는 그 이벤트의 해설만 버린다. 이벤트 기록도 폴링도 멈추지 않는다.
//   2. mock 텍스트는 저장하지 않는다. 저장하면 키를 고친 뒤에도 영구히 남는다.
//   3. 잔여 시간을 넘기면 남은 작업은 다음 기동이 이어받는다.
//   4. 같은 해설이 상한(MAX_COMMENTARY_ATTEMPTS)만큼 실패하면 영구히 포기한다.
//
// 네 갈래 실패를 모두 같은 것으로 센다 — LLM 예외 · mock 폴백 · 빈 응답 · 저장 실패.
// 특히 mock 폴백을 실패로 세는 것이 중요하다. 워커는 FallbackLlmProvider 를 쓰므로
// 실제 LLM 오류가 예외가 아니라 `isMock: true` 로 돌아온다. mock 을 세지 않으면
// 재시도 상한이 프로덕션에서 한 번도 발동하지 않는다.
export const generateCommentaryForEvents = async (
  options: CommentaryGenerationOptions,
  deps: CommentaryGenerationDeps,
): Promise<CommentaryGenerationResult> => {
  const selection = selectPendingCommentaryTasks(
    options.events,
    options.variants,
    options.context,
    options.maxAttempts,
  );
  const tasks = selection.tasks;

  let context = options.context;
  const result: CommentaryGenerationResult = {
    nextContext: context,
    generated: 0,
    failed: 0,
    mockDropped: 0,
    deferred: 0,
    retryExhausted: selection.retryExhausted,
    hasContextChanged: false,
  };

  // 실패 횟수도 러닝 컨텍스트에 남겨야 다음 기동이 상한을 안다.
  const markFailure = (task: CommentaryTask): void => {
    context = recordCommentaryFailure(context, task.docId);
    result.hasContextChanged = true;
  };

  for (const [index, task] of tasks.entries()) {
    // 호출을 시작하기 전에 판정한다. 시작해 버리면 타임아웃 도중에 잘려
    // 러닝 컨텍스트 쓰기까지 함께 날아간다.
    if (deps.nowMs() + options.callBudgetMs > options.budgetEndMs) {
      result.deferred = tasks.length - index;
      deps.onBudgetExhausted?.(result.deferred);

      break;
    }

    let commentary: LlmCommentary;

    try {
      commentary = await deps.generate({
        event: task.event,
        locale: task.variant.locale,
        explanationLevel: task.variant.explanationLevel,
        snapshot: options.snapshot,
        // 이 변형이 만든 해설만 넘긴다. 다른 변형의 글이 섞이면 안 된다.
        recentCommentary: getRecentCommentary(context, task.variantKey),
      });
    } catch (error) {
      result.failed += 1;
      markFailure(task);
      deps.onFailure?.(task, error);

      continue;
    }

    if (commentary.isMock === true) {
      result.mockDropped += 1;
      markFailure(task);
      deps.onMockDropped?.(task);

      continue;
    }

    const text = commentary.text.trim();

    // 빈 응답은 실패로 본다. 저장 스키마가 text 를 min(1) 로 요구하므로 그대로 쓰면
    // 클라이언트가 파싱하지 못하는 문서가 남는다.
    if (text.length === 0) {
      result.failed += 1;
      markFailure(task);
      deps.onFailure?.(task, new Error("해설 텍스트가 비어 있다"));

      continue;
    }

    const document = toCommentaryDocument(
      toAiCommentary(task.event, text, false),
      task.variant.locale,
      task.variant.explanationLevel,
      options.model,
      new Date(deps.nowMs()).toISOString(),
    );

    try {
      await deps.save(task.docId, document);
    } catch (error) {
      result.failed += 1;
      markFailure(task);
      deps.onFailure?.(task, error);

      continue;
    }

    context = appendCommentaryToRunContext(
      context,
      task.variantKey,
      task.docId,
      document.text,
    );
    result.generated += 1;
    result.hasContextChanged = true;
  }

  result.nextContext = context;

  return result;
};
