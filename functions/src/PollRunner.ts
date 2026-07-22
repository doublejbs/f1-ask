import { Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  buildOpenF1LiveFrame,
  buildOvertakeForecastEvent,
  CommentaryRunContext,
  CommentaryVariant,
  decidePublish,
  EMPTY_PUBLISH_STATE,
  EventWriteCursor,
  fetchOpenF1SessionData,
  generateCommentaryForEvents,
  LiveRaceSnapshot,
  OpenF1ClientOptions,
  OpenF1SessionData,
  OpenF1SessionMeta,
  OvertakeForecastTracker,
  PublishState,
  RaceEvent,
  SelectedLlmProvider,
  selectUnwrittenEvents,
} from "@f1/domain";
import {
  readCommentaryRunContext,
  readEventWriteCursor,
  writeCommentaryDocument,
  writeCommentaryRunContext,
  writeEvents,
  writeEventWriteCursor,
  writeLiveSnapshot,
  writeSessionDoc,
} from "./FirestoreWorkerStore";
import {
  COMMENTARY_CALL_BUDGET_MS,
  COMMENTARY_DEADLINE_MARGIN_MS,
  COMMENTARY_PHASE_END_MS,
  POLL_DEADLINE_MARGIN_MS,
  POLL_INTERVAL_MS,
  POLL_ITERATIONS,
} from "./WorkerConfig";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// 랩 시각이 하나도 없을 때 쓰는 fallback 세션 길이 (로컬 하네스와 같은 값).
const FALLBACK_SESSION_MS = 3_600_000;

// 랩 date_start 최솟값을 세션 시작으로 본다 (로컬 하네스와 동일한 계산).
// 아직 랩이 없으면 nowMs 로 잡지 말고 한 시간 뒤로 물린다 — 창을 [now, now] 로
// 좁히면 포메이션 랩 전의 race_control 메시지가 통째로 버려진다.
const resolveStartMs = (data: OpenF1SessionData, nowMs: number): number => {
  const lapStarts = data.laps
    .map((lap) => (lap.date_start === null ? Number.NaN : Date.parse(lap.date_start)))
    .filter((ms) => !Number.isNaN(ms));

  return lapStarts.length > 0
    ? Math.min(...lapStarts)
    : nowMs - FALLBACK_SESSION_MS;
};

export type PollRunOptions = {
  db: Firestore;
  sessionId: string;
  meta: OpenF1SessionMeta;
  clientOptions: OpenF1ClientOptions;
  // 이 기동이 시작한 시각. 리스 만료 기준의 해설 마감을 여기서 잰다.
  startedAtMs: number;
  // 이 시각을 넘겨 폴링을 시작하지 않는다 (함수 타임아웃 보호).
  deadlineMs: number;
  // 해설 생성에 쓸 LLM. 키가 없으면 생략해 해설 없이 폴링만 한다.
  llm?: SelectedLlmProvider;
  variants: readonly CommentaryVariant[];
};

export type PollRunResult = {
  polls: number;
  eventWrites: number;
  snapshotWrites: number;
  sessionDocWrites: number;
  commentaryWrites: number;
  commentaryFailures: number;
  commentaryMockDropped: number;
  commentaryDeferred: number;
  commentaryRetryExhausted: number;
};

// 마지막 폴링이 계산한 프레임. 해설은 폴링 창이 끝난 뒤 이것으로 만든다.
type LastFrame = {
  snapshot: LiveRaceSnapshot;
  events: RaceEvent[];
};

// 한 번의 함수 기동이 담당하는 폴링 창.
//
// 이벤트 커서와 해설 러닝 컨텍스트는 기동 시작에 한 번 읽고 끝에 한 번 쓴다.
// 폴링마다 저장하면 그 문서 자체가 쓰기 폭증이 된다 (docs/16-poller-worker.md).
//
// 해설은 폴링 루프 안이 아니라 루프가 끝난 뒤에 만든다. 루프 안에서 LLM 을 기다리면
// 6초 폴링 간격이 밀려 데이터가 성겨진다(docs/18 §생성 주체). 폴링 창(약 60초)이 끝나면
// 남는 시간이 해설의 몫인데, 그 끝은 함수 타임아웃과 **리스 만료** 중 이른 쪽이다.
// 리스를 넘겨 쓰면 다음 기동이 만료된 리스를 잡아 아직 살아 있는 이 기동과 겹친다.
export const runPollWindow = async (
  options: PollRunOptions,
): Promise<PollRunResult> => {
  const { db, sessionId, meta, clientOptions } = options;

  let cursor: EventWriteCursor = await readEventWriteCursor(db, sessionId);
  let commentaryContext: CommentaryRunContext = await readCommentaryRunContext(
    db,
    sessionId,
  );
  let publishState: PublishState = EMPTY_PUBLISH_STATE;
  // 추월 예측을 엣지 트리거로 바꾸는 상태는 세션(=이 폴링 창) 단위로 하나만 든다. 매 폴링이
  // 스냅샷의 forecasts 전부를 observe 하면 "새로 성립한" 것만 돌아온다(docs/23 §이벤트). 프레임 간
  // 상태이므로 루프 밖에 둔다. 인스턴스가 함수 기동마다 리셋돼도 최종 중복 쓰기는 EventWriteCursor 가 막는다.
  const overtakeForecastTracker = new OvertakeForecastTracker();
  const result: PollRunResult = {
    polls: 0,
    eventWrites: 0,
    snapshotWrites: 0,
    sessionDocWrites: 0,
    commentaryWrites: 0,
    commentaryFailures: 0,
    commentaryMockDropped: 0,
    commentaryDeferred: 0,
    commentaryRetryExhausted: 0,
  };
  let hasCursorChanged = false;
  let hasCommentaryContextChanged = false;
  let lastFrame: LastFrame | null = null;

  try {
    for (let iteration = 0; iteration < POLL_ITERATIONS; iteration += 1) {
      if (Date.now() + POLL_DEADLINE_MARGIN_MS > options.deadlineMs) {
        logger.info("폴링 창 마감이 임박해 조기 종료한다", {
          iteration,
        });

        break;
      }

      const data = await fetchOpenF1SessionData(meta, clientOptions);
      const nowMs = Date.now();
      const startMs = resolveStartMs(data, nowMs);
      const { snapshot, events } = buildOpenF1LiveFrame(data, {
        startMs,
        nowMs,
        version: iteration,
      });
      const iso = new Date().toISOString();
      const liveSnapshot = {
        ...snapshot,
        sessionId,
        sourceUpdatedAt: iso,
        generatedAt: iso,
      };
      const decision = decidePublish(liveSnapshot, publishState, { nowMs });

      publishState = decision.nextState;

      if (decision.shouldWriteSnapshot) {
        await writeLiveSnapshot(db, sessionId, liveSnapshot);
        result.snapshotWrites += 1;
      }

      if (decision.shouldWriteSessionDoc) {
        await writeSessionDoc(db, sessionId, liveSnapshot);
        result.sessionDocWrites += 1;
      }

      // 추월 예측은 buildEvents 경로 밖이다(엣지 트리거라 상태가 필요하다). 스냅샷에 실린
      // forecasts 를 트래커에 넣어 "새로 성립한" 것만 이벤트화하고, 기존 이벤트와 합쳐 같은
      // 쓰기 경로(selectUnwrittenEvents → writeEvents)에 태운다.
      const newForecasts = overtakeForecastTracker.observe(
        liveSnapshot.overtakeForecasts ?? [],
        liveSnapshot,
      );
      const forecastEvents = newForecasts.map((forecast) =>
        buildOvertakeForecastEvent(forecast, liveSnapshot, nowMs),
      );
      const allEvents = [...events, ...forecastEvents];

      // 핵심: 매 폴링은 "지금까지의 전체 이벤트"를 다시 계산한다.
      // 커서로 아직 쓰지 않은 것만 걸러 낸다.
      const selection = selectUnwrittenEvents(allEvents, cursor);

      if (selection.events.length > 0) {
        await writeEvents(db, sessionId, selection.events);
        cursor = selection.nextCursor;
        hasCursorChanged = true;
        result.eventWrites += selection.events.length;
      }

      result.polls += 1;
      lastFrame = { snapshot: liveSnapshot, events: allEvents };

      logger.info("폴링 완료", {
        iteration,
        lap: snapshot.currentLap,
        totalLaps: snapshot.totalLaps,
        status: snapshot.status,
        computedEvents: events.length,
        newEvents: selection.events.length,
        wroteSnapshot: decision.shouldWriteSnapshot,
      });

      if (iteration < POLL_ITERATIONS - 1) {
        await sleep(POLL_INTERVAL_MS);
      }
    }

    // 폴링이 끝난 뒤 남은 시간으로 해설을 만든다.
    // 해설 실패가 폴링 결과(이벤트·스냅샷)를 되돌리면 안 되므로 여기서 삼킨다.
    if (lastFrame !== null && options.llm !== undefined) {
      try {
        const llm = options.llm;
        const generation = await generateCommentaryForEvents(
          {
            events: lastFrame.events,
            snapshot: lastFrame.snapshot,
            variants: options.variants,
            context: commentaryContext,
            model: llm.model,
            // 두 마감 중 이른 쪽을 쓴다. 함수 타임아웃과 리스 만료 어느 것도 넘기면 안 된다.
            budgetEndMs: Math.min(
              options.deadlineMs - COMMENTARY_DEADLINE_MARGIN_MS,
              options.startedAtMs + COMMENTARY_PHASE_END_MS,
            ),
            callBudgetMs: COMMENTARY_CALL_BUDGET_MS,
          },
          {
            generate: (request) => llm.provider.generateCommentary(request),
            save: (docId, document) =>
              writeCommentaryDocument(db, sessionId, docId, document),
            nowMs: () => Date.now(),
            // 키 값은 어떤 경로로도 로그에 남기지 않는다.
            onFailure: (task, error) => {
              logger.warn("해설 생성에 실패해 이 이벤트는 건너뛴다", {
                eventId: task.event.id,
                eventType: task.event.type,
                message:
                  error instanceof Error ? error.message : "unknown error",
              });
            },
            onMockDropped: (task) => {
              logger.warn("mock 해설이라 저장하지 않는다", {
                eventId: task.event.id,
              });
            },
            onBudgetExhausted: (remaining) => {
              logger.info("시간 예산이 모자라 남은 해설은 다음 기동이 이어받는다", {
                remaining,
              });
            },
          },
        );

        commentaryContext = generation.nextContext;
        hasCommentaryContextChanged = generation.hasContextChanged;
        result.commentaryWrites = generation.generated;
        result.commentaryFailures = generation.failed;
        result.commentaryMockDropped = generation.mockDropped;
        result.commentaryDeferred = generation.deferred;
        result.commentaryRetryExhausted = generation.retryExhausted;

        if (generation.retryExhausted > 0) {
          logger.warn("재시도 상한을 넘긴 해설은 영구히 건너뛴다", {
            count: generation.retryExhausted,
          });
        }
      } catch (error) {
        logger.error("해설 생성 단계가 통째로 실패했다", {
          message: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
  } finally {
    // 중간에 실패해도 여기까지 쓴 것은 커서에 남겨야 다음 기동이 다시 쓰지 않는다.
    //
    // 두 쓰기는 서로 독립이어야 한다. 순차 await 로 두면 커서 쓰기가 던졌을 때 해설
    // 컨텍스트 쓰기가 통째로 건너뛰어지고, generatedKeys 가 날아간 다음 기동이 이미
    // 저장된 해설을 전부 다시 만든다(문서는 안 늘지만 LLM 비용은 다시 나간다).
    const pendingWrites: { name: string; write: Promise<void> }[] = [];

    if (hasCursorChanged) {
      pendingWrites.push({
        name: "eventCursor",
        write: writeEventWriteCursor(db, sessionId, cursor),
      });
    }

    if (hasCommentaryContextChanged) {
      pendingWrites.push({
        name: "commentaryContext",
        write: writeCommentaryRunContext(db, sessionId, commentaryContext),
      });
    }

    const settled = await Promise.allSettled(
      pendingWrites.map((entry) => entry.write),
    );

    // finally 에서 다시 던지면 원래 예외를 덮어쓴다. 로그로만 남긴다.
    settled.forEach((outcome, index) => {
      if (outcome.status !== "rejected") {
        return;
      }

      logger.error("기동 마무리 쓰기에 실패했다", {
        target: pendingWrites[index]?.name,
        message:
          outcome.reason instanceof Error
            ? outcome.reason.message
            : "unknown error",
      });
    });
  }

  return result;
};
