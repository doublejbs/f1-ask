import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, Firestore, getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { RaceEvent } from "../src/RaceEvent";
import { LLM_REQUEST_TIMEOUT_MS } from "../src/ai/LlmRequestTimeout";
import {
  createProcessEnvReader,
  createRaceLlmProvider,
  MOCK_LLM_PROVIDER_NAME,
} from "../src/ai/LlmProviderSelection";
import { CommentaryDocument } from "../src/firestore/CommentaryDocument";
import {
  COMMENTARY_CONTEXT_DOC_ID,
  firestorePaths,
} from "../src/firestore/LiveRaceRepository";
import {
  CommentaryRunContext,
  parseCommentaryRunContext,
} from "../src/worker/CommentaryRunContext";
import {
  parseCommentaryVariants,
  toCommentaryVariantKey,
} from "../src/worker/CommentaryVariant";
import {
  DEFAULT_REPLAY_COMMENTARY_CALL_CAP,
  formatReplayCommentaryEntry,
  formatReplayCommentaryPlan,
  formatReplayCommentarySummary,
  planReplayCommentary,
  runReplayCommentary,
} from "../src/worker/ReplayCommentaryHarness";
import { mergeEventsByDeduplicationKey } from "../src/worker/RaceEventMerge";
import {
  fetchLatestOpenF1Meta,
  fetchOpenF1SessionData,
  OpenF1Auth,
  OpenF1ClientOptions,
} from "../src/openf1/OpenF1Client";
import { buildOpenF1LiveFrame } from "../src/openf1/OpenF1Recording";
import { OpenF1SessionData } from "../src/openf1/OpenF1Types";
import { buildOvertakeForecastEvent } from "../src/openf1/OvertakeForecastEvent";
import { OvertakeForecastTracker } from "../src/openf1/OvertakeForecastTracker";

// 실제 OpenF1 라이브 세션을 폴링해 Firestore 에뮬레이터에 퍼블리시한다 (Worker 역할).
// 네트워크 + 인증 + 에뮬레이터가 필요하므로 기본 실행에서는 skip 된다.
// 토큰은 1시간 만료되므로 username/password 로 자동 갱신하는 것을 권장한다:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 OPENF1_USERNAME=... OPENF1_PASSWORD=... \
//     POLL_OPENF1=1 pnpm exec vitest run packages/domain/test/OpenF1LivePoll.test.ts
// (또는 단기 정적 토큰: OPENF1_API_KEY=... — 1시간 뒤 만료됨)
//
// POLL_REPLAY_SPEED 를 주면 리플레이 모드로 동작한다. 대상 세션이 이미 끝난 레이스라
// 실제 시각을 쓰면 매 폴링마다 레이스 전체가 한꺼번에 들어와 아무것도 변하지 않는다.
// 리플레이 모드는 가상 시계를 써서 이벤트가 하나씩 쌓이는 것을 볼 수 있게 한다.
// 실행 방법은 docs/04-worker-openf1.md 참고.
//
// POLL_COMMENTARY=1 을 주면 폴링이 끝난 뒤 워커와 **같은 도메인 함수**로 AI 해설을
// 생성해 Firestore 에 저장하고 콘솔에 시간순으로 찍는다. 기본은 꺼짐 — 기존 하네스
// 사용자가 모르는 사이에 LLM 비용을 물면 안 된다.
const shouldRun = process.env.POLL_OPENF1 === "1";
const LIVE_SESSION_ID = "openf1-live";
const ITERATIONS = Number(process.env.POLL_ITERATIONS ?? "20");
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? "6000");
// 미설정이면 라이브 모드(실제 시각). 설정하면 "실제 1초 = 경기 N초" 배속 리플레이.
const REPLAY_SPEED_RAW = process.env.POLL_REPLAY_SPEED;
const REPLAY_SPEED =
  REPLAY_SPEED_RAW === undefined ? null : Number(REPLAY_SPEED_RAW);
// Firestore 배치 쓰기 상한.
const MAX_DELETE_BATCH_SIZE = 500;
// 랩 시각이 하나도 없을 때 쓰는 fallback 세션 길이.
const FALLBACK_SESSION_MS = 3_600_000;

// ── AI 해설 (docs/18-ai-commentary-worker.md) ──

// 기본은 꺼짐. 켜지 않으면 이 파일은 예전과 완전히 같게 동작한다.
const SHOULD_GENERATE_COMMENTARY = process.env.POLL_COMMENTARY === "1";
// 총 LLM 호출 수 상한. 무료 티어 한도(일 250회)와 지출 상한($5)을 하네스가 태우지 않게
// 막는 마지막 방어선이다. 넘기면 생성을 멈추고 그 사실을 출력한다.
const COMMENTARY_CALL_CAP = Number(
  process.env.POLL_COMMENTARY_CALL_CAP ??
    String(DEFAULT_REPLAY_COMMENTARY_CALL_CAP),
);
// 해설 단계 전체의 벽시계 상한. 워커는 함수 타임아웃·리스 TTL 에서 끌어오지만 하네스에는
// 그 둘이 없으므로 폭주 방지용으로만 둔다. 기본 10분.
const COMMENTARY_BUDGET_MS = Number(
  process.env.POLL_COMMENTARY_BUDGET_MS ?? "600000",
);
// 러닝 컨텍스트와 이미 만든 해설을 지우고 처음부터 다시 생성할지.
// 기본은 유지다 — 리플레이를 다시 돌릴 때마다 같은 해설을 다시 사는 일이 없게 한다.
const SHOULD_RESET_COMMENTARY = process.env.POLL_COMMENTARY_RESET === "1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const parseMs = (date: string | null | undefined): number =>
  date === null || date === undefined ? Number.NaN : Date.parse(date);

// 랩 date_start 최솟값을 세션 시작으로 본다 (기존 라이브 모드와 동일한 계산).
const resolveStartMs = (data: OpenF1SessionData): number => {
  const lapStarts = data.laps
    .map((lap) => parseMs(lap.date_start))
    .filter((ms) => !Number.isNaN(ms));

  return lapStarts.length > 0
    ? Math.min(...lapStarts)
    : Date.now() - FALLBACK_SESSION_MS;
};

// 가장 늦은 랩/이벤트 시각을 세션 끝으로 본다 (리플레이 종료 조건).
const resolveEndMs = (data: OpenF1SessionData, startMs: number): number => {
  const candidates = [
    ...data.laps.map((lap) => parseMs(lap.date_start)),
    ...data.pits.map((pit) => parseMs(pit.date)),
    ...data.raceControl.map((message) => parseMs(message.date)),
    ...(data.overtakes ?? []).map((overtake) => parseMs(overtake.date)),
    ...(data.teamRadio ?? []).map((radio) => parseMs(radio.date)),
  ].filter((ms) => !Number.isNaN(ms));

  return candidates.length > 0
    ? Math.max(...candidates)
    : startMs + FALLBACK_SESSION_MS;
};

// 가상 경과 시간을 "m:ss" 로 포맷한다.
const formatElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

// 리플레이를 "처음부터" 재생하려면 이전 실행이 남긴 문서를 지워야 한다.
// 에뮬레이터 REST DELETE 는 보안 규칙에 막히지만 admin SDK 는 규칙을 우회한다.
const deleteCollectionDocs = async (
  db: Firestore,
  collectionPath: string,
): Promise<number> => {
  const collection = db.collection(collectionPath);
  let deleted = 0;

  // 문서가 수백 건이라 배치 상한(500) 단위로 끊어 지운다.
  for (;;) {
    const snapshot = await collection.limit(MAX_DELETE_BATCH_SIZE).get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }

    await batch.commit();
    deleted += snapshot.size;
  }

  return deleted;
};

// 러닝 컨텍스트 입출력. 워커(functions/src/FirestoreWorkerStore.ts)와 **같은 문서 경로 ·
// 같은 파서 · 같은 필드**를 쓴다. functions/ 는 별도 tsconfig(rootDir 밖)라 여기서
// import 할 수 없어 이 열 줄만 형태가 겹치지만, 판정 로직은 전부 도메인 함수 쪽에 있다.
//
// 워커와 마찬가지로 **창당 읽기 1 · 쓰기 1** 이다. 해설마다 쓰면 이 문서가 쓰기 폭증이 된다.
const readCommentaryContext = async (
  db: Firestore,
  sessionId: string,
): Promise<CommentaryRunContext> => {
  const snapshot = await db
    .doc(firestorePaths.runtimeDoc(sessionId, COMMENTARY_CONTEXT_DOC_ID))
    .get();

  return parseCommentaryRunContext(snapshot.data());
};

const writeCommentaryContext = async (
  db: Firestore,
  sessionId: string,
  context: CommentaryRunContext,
): Promise<void> => {
  await db
    .doc(firestorePaths.runtimeDoc(sessionId, COMMENTARY_CONTEXT_DOC_ID))
    .set({
      recentTextsByVariant: context.recentTextsByVariant,
      generatedKeys: context.generatedKeys,
      failureCounts: context.failureCounts,
      generatedCount: context.generatedCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
};

// 해설 문서. id 가 `{eventId}:{locale}:{explanationLevel}` 라 재기록이 멱등이다.
const writeCommentaryDocument = async (
  db: Firestore,
  sessionId: string,
  docId: string,
  document: CommentaryDocument,
): Promise<void> => {
  await db.doc(firestorePaths.aiCommentaryDoc(sessionId, docId)).set({
    ...document,
    persistedAt: FieldValue.serverTimestamp(),
  });
};

// 마지막 폴링이 계산한 프레임. 워커와 같이 **폴링 루프가 끝난 뒤** 이것으로 해설을 만든다
// (docs/18 §생성 주체 — 루프 안에서 LLM 을 기다리면 폴링 간격이 통째로 밀린다).
type LastFrame = {
  snapshot: LiveRaceSnapshot;
  events: RaceEvent[];
};

// 해설 생성 한 판. 실패해도 폴링 결과(이벤트·스냅샷)를 되돌리지 않는다.
const runCommentaryPhase = async (
  db: Firestore,
  sessionId: string,
  lastFrame: LastFrame,
  context: CommentaryRunContext,
): Promise<void> => {
  const variants = parseCommentaryVariants(process.env.COMMENTARY_VARIANTS);
  // provider 선택은 워커와 같은 경로다. 키가 하나도 없으면 Mock 이 돌아온다.
  const llm = createRaceLlmProvider(
    createProcessEnvReader(process.env),
    (error) => {
      // 키 값은 어떤 경로로도 남기지 않는다. 사유만 남긴다.
      // eslint-disable-next-line no-console
      console.log(
        `  LLM 호출 실패 → mock 폴백: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    },
  );

  // mock 으로 조용히 도는 것이 이 하네스에서 가장 위험하다. 문장이 그럴듯하게 찍혀
  // "잘 됐다" 고 오해하게 만든다. 실제 provider 가 아니면 아예 생성하지 않는다.
  if (llm.name === MOCK_LLM_PROVIDER_NAME) {
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        "해설 생성을 건너뛴다: LLM API 키가 없다.",
        "  GEMINI_API_KEY 를 셸 환경에 넣고 다시 실행할 것 (값은 문서·로그에 남기지 않는다).",
        "    export GEMINI_API_KEY=...",
        "  키 없이 도는 mock 문장은 품질 판단에 쓸 수 없으므로 생성도 저장도 하지 않는다.",
      ].join("\n"),
    );

    return;
  }

  const plan = planReplayCommentary(
    lastFrame.events,
    variants,
    context,
    COMMENTARY_CALL_CAP,
  );

  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      `해설 provider: ${llm.name} (${llm.model}), 변형 ${variants.map(toCommentaryVariantKey).join(" · ")}`,
      ...formatReplayCommentaryPlan(plan),
    ].join("\n"),
  );

  if (plan.acceptedCalls === 0) {
    // eslint-disable-next-line no-console
    console.log(
      "새로 만들 해설이 없다. 다시 생성하려면 POLL_COMMENTARY_RESET=1 로 러닝 컨텍스트를 비운다.",
    );

    return;
  }

  const report = await runReplayCommentary(
    {
      events: lastFrame.events,
      snapshot: lastFrame.snapshot,
      variants,
      context,
      model: llm.model,
      budgetEndMs: Date.now() + COMMENTARY_BUDGET_MS,
      // 호출 1회의 최악 소요는 provider 의 요청 타임아웃과 같은 상수에서 온다.
      callBudgetMs: LLM_REQUEST_TIMEOUT_MS,
      callCap: COMMENTARY_CALL_CAP,
    },
    {
      generate: (request) => llm.provider.generateCommentary(request),
      save: (docId, document) =>
        writeCommentaryDocument(db, sessionId, docId, document),
      nowMs: () => Date.now(),
    },
  );

  // 생성 결과를 시간순으로 찍는다. 연속된 문장이 서로 다른 이야기를 하는지가
  // 이 하네스의 핵심 관전 포인트다.
  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      "── 생성된 해설 (이벤트 시간순) ──",
      ...report.entries.map((entry, index) =>
        formatReplayCommentaryEntry(entry, index),
      ),
      "",
      ...formatReplayCommentarySummary(report),
    ].join("\n"),
  );

  // 워커와 같이 창 끝에 한 번만 쓴다.
  if (report.hasContextChanged) {
    await writeCommentaryContext(db, sessionId, report.nextContext);
  }
};

describe("OpenF1 live poll → Firestore", () => {
  (shouldRun ? it : it.skip)(
    "polls the live session and publishes to Firestore",
    async () => {
      const username = process.env.OPENF1_USERNAME;
      const password = process.env.OPENF1_PASSWORD;
      const apiKey = process.env.OPENF1_API_KEY;

      // username/password 가 있으면 자동 갱신 auth, 없으면 정적 토큰.
      const clientOptions: OpenF1ClientOptions =
        username !== undefined && password !== undefined
          ? { auth: new OpenF1Auth({ username, password }) }
          : { apiKey };

      expect(
        username !== undefined || apiKey !== undefined,
        "OPENF1_USERNAME/PASSWORD or OPENF1_API_KEY is required",
      ).toBe(true);

      // 기본은 에뮬레이터 강제다 — 실수로 프로덕션 Firestore 를 오염시키지 않게 하는
      // 안전장치다. POLL_TARGET=production 을 **명시**했을 때만 이 강제를 풀고
      // 서비스 계정 키로 실서버에 붙는다. 명시 플래그가 없으면 기존 동작 그대로다.
      const isProductionTarget = process.env.POLL_TARGET === "production";

      let app;

      if (isProductionTarget) {
        const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        expect(
          keyPath,
          "POLL_TARGET=production 에는 GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 키 경로)가 필요하다",
        ).toBeTruthy();
        expect(
          process.env.FIRESTORE_EMULATOR_HOST,
          "POLL_TARGET=production 에서는 FIRESTORE_EMULATOR_HOST 를 설정하면 안 된다 (에뮬레이터로 새어 나간다)",
        ).toBeFalsy();

        const serviceAccount = JSON.parse(
          readFileSync(keyPath as string, "utf8"),
        );

        app = initializeApp(
          { credential: cert(serviceAccount) },
          `poll-${Date.now()}`,
        );

        // eslint-disable-next-line no-console
        console.log(
          `⚠️  PRODUCTION TARGET: ${serviceAccount.project_id} 실서버에 쓴다`,
        );
      } else {
        expect(
          process.env.FIRESTORE_EMULATOR_HOST,
          "FIRESTORE_EMULATOR_HOST is required",
        ).toBeTruthy();

        app = initializeApp(
          { projectId: process.env.GCLOUD_PROJECT ?? "demo-f1" },
          `poll-${Date.now()}`,
        );
      }
      const db = getFirestore(app);
      // 스냅샷의 optional 필드(weather/lastSectorsSeconds 등)가 undefined 일 수 있어
      // Firestore 쓰기 시 오류가 나지 않도록 undefined 프로퍼티를 무시한다.
      db.settings({ ignoreUndefinedProperties: true });

      const meta = await fetchLatestOpenF1Meta(clientOptions);
      // 고정 sessionId 로 덮어써 클라이언트가 알려진 경로를 구독하게 한다.
      const liveMeta = { ...meta, sessionId: LIVE_SESSION_ID };
      // eslint-disable-next-line no-console
      console.log(
        `Live session: ${meta.sessionName} @ ${meta.circuitName} (key ${meta.sessionKey}) -> ${LIVE_SESSION_ID}`,
      );

      const isReplayMode = REPLAY_SPEED !== null;

      if (isReplayMode) {
        expect(
          Number.isFinite(REPLAY_SPEED) && REPLAY_SPEED > 0,
          "POLL_REPLAY_SPEED must be a positive number",
        ).toBe(true);
      }

      // 리플레이 대상은 이미 끝난 세션이라 원본 데이터가 변하지 않는다.
      // 루프 시작 전 1회만 조회해 재사용한다 (라이브 모드는 기존대로 매번 조회).
      const replayData = isReplayMode
        ? await fetchOpenF1SessionData(liveMeta, clientOptions)
        : null;
      const replayStartMs = replayData === null ? 0 : resolveStartMs(replayData);
      const replayEndMs =
        replayData === null ? 0 : resolveEndMs(replayData, replayStartMs);
      const wallClockStartMs = Date.now();

      if (replayData !== null) {
        const deleted = await deleteCollectionDocs(
          db,
          firestorePaths.events(LIVE_SESSION_ID),
        );

        // eslint-disable-next-line no-console
        console.log(
          `replay mode: speed x${REPLAY_SPEED}, duration ${formatElapsed(replayEndMs - replayStartMs)}, cleared ${deleted} existing events`,
        );
      }

      // 해설 러닝 컨텍스트는 폴링 창 **시작에 한 번** 읽는다 (워커와 같은 방식).
      // 해설을 끄면 읽지도 않는다 — 기존 동작이 그대로여야 한다.
      let commentaryContext: CommentaryRunContext | null = null;

      if (SHOULD_GENERATE_COMMENTARY) {
        if (SHOULD_RESET_COMMENTARY) {
          const clearedDocs = await deleteCollectionDocs(
            db,
            firestorePaths.aiCommentary(LIVE_SESSION_ID),
          );

          await db
            .doc(
              firestorePaths.runtimeDoc(
                LIVE_SESSION_ID,
                COMMENTARY_CONTEXT_DOC_ID,
              ),
            )
            .delete();

          // eslint-disable-next-line no-console
          console.log(
            `commentary reset: cleared ${clearedDocs} commentary docs and the running context`,
          );
        }

        commentaryContext = await readCommentaryContext(db, LIVE_SESSION_ID);

        // 예상 호출 수는 폴링이 끝나야 확정되지만, 상한과 이미 만든 건수는 지금 알린다.
        // eslint-disable-next-line no-console
        console.log(
          `commentary enabled: 호출 상한 ${COMMENTARY_CALL_CAP}회, 이미 생성된 해설 ${commentaryContext.generatedKeys.length}건 (예상 호출 수는 폴링 종료 후 알린다)`,
        );
      }

      let lastFrame: LastFrame | null = null;

      // 추월 예측을 엣지 트리거로 바꾸는 상태는 워커(PollRunner)와 같이 폴링 창 단위 1개다.
      // 매 프레임 스냅샷의 forecasts 전부를 observe 하면 "새로 성립한" 것만 돌아온다.
      const forecastTracker = new OvertakeForecastTracker();
      // 프레임 간 누적. 엣지 트리거 발화는 그 프레임에만 존재하고 마지막 프레임 events 에는
      // 없으므로, 누적해 두지 않으면 해설 대상에서 통째로 빠진다.
      const firedForecastEvents: RaceEvent[] = [];
      // 요약 로그용 고유 페어 집합.
      const firedForecastPairs = new Set<string>();

      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        const data = replayData ?? (await fetchOpenF1SessionData(liveMeta, clientOptions));
        const startMs = replayData === null ? resolveStartMs(data) : replayStartMs;
        // 리플레이는 가상 시계. 실제 1초가 경기 REPLAY_SPEED 초에 대응한다.
        const simulatedNowMs =
          REPLAY_SPEED === null
            ? Date.now()
            : startMs + (Date.now() - wallClockStartMs) * REPLAY_SPEED;
        // 세션 끝을 넘어가면 마지막 프레임까지 발행하고 종료한다.
        const isFinished = isReplayMode && simulatedNowMs >= replayEndMs;
        const nowMs = isFinished ? replayEndMs : simulatedNowMs;

        const { snapshot, events } = buildOpenF1LiveFrame(data, {
          startMs,
          nowMs,
          version: iteration,
        });
        const iso = new Date().toISOString();
        const liveSnapshot = {
          ...snapshot,
          sourceUpdatedAt: iso,
          generatedAt: iso,
        };

        // 추월 예측은 buildEvents 경로 밖이다(엣지 트리거라 상태가 필요하다). 워커와 같은
        // 배선: 스냅샷의 forecasts 를 트래커에 넣어 "새로 성립한" 것만 이벤트화한다.
        // nowMs 는 라이브면 실제 시각(Date.now()), 리플레이면 가상 시계다 — 워커의
        // Date.now() 자리에 가상 시계가 들어가는 것이 리플레이의 핵심이다.
        const newForecasts = forecastTracker.observe(
          liveSnapshot.overtakeForecasts ?? [],
          liveSnapshot,
        );
        const forecastEvents = newForecasts.map((forecast) =>
          buildOvertakeForecastEvent(forecast, liveSnapshot, nowMs),
        );

        firedForecastEvents.push(...forecastEvents);

        for (const forecast of newForecasts) {
          firedForecastPairs.add(
            `${forecast.chaserNumber}:${forecast.targetNumber}`,
          );
        }

        await db
          .doc(`sessions/${LIVE_SESSION_ID}/live/current`)
          .set({ ...liveSnapshot, persistedAt: FieldValue.serverTimestamp() });

        await db.doc(`sessions/${LIVE_SESSION_ID}`).set(
          {
            schemaVersion: snapshot.schemaVersion,
            sessionId: LIVE_SESSION_ID,
            sessionName: snapshot.sessionName,
            circuitName: snapshot.circuitName,
            countryCode: snapshot.countryCode,
            status: snapshot.status,
            currentLap: snapshot.currentLap,
            totalLaps: snapshot.totalLaps,
            persistedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        // 예측 이벤트는 기존 이벤트와 같은 경로(deduplicationKey 문서 ID)로 함께 쓴다.
        const frameEvents = [...events, ...forecastEvents];

        if (frameEvents.length > 0) {
          const batch = db.batch();

          for (const event of frameEvents) {
            batch.set(
              db.doc(
                `sessions/${LIVE_SESSION_ID}/events/${event.deduplicationKey}`,
              ),
              event,
            );
          }

          await batch.commit();
        }

        lastFrame = { snapshot: liveSnapshot, events: frameEvents };

        // 발화가 없으면 생략해 로그를 어지럽히지 않는다.
        const forecastLog =
          forecastEvents.length > 0
            ? `, forecasts fired ${forecastEvents.length}`
            : "";

        if (isReplayMode) {
          const totalMs = Math.max(1, replayEndMs - replayStartMs);
          const progress = Math.round(((nowMs - startMs) / totalMs) * 100);

          // eslint-disable-next-line no-console
          console.log(
            `replay ${iteration + 1}/${ITERATIONS}: t+${formatElapsed(nowMs - startMs)} (${progress}%) lap ${snapshot.currentLap}/${snapshot.totalLaps}, ${snapshot.drivers.length} drivers, ${events.length} events${forecastLog}`,
          );
        } else {
          // eslint-disable-next-line no-console
          console.log(
            `poll ${iteration + 1}/${ITERATIONS}: lap ${snapshot.currentLap}/${snapshot.totalLaps} status ${snapshot.status}, ${snapshot.drivers.length} drivers, ${events.length} events${forecastLog}`,
          );
        }

        if (isFinished) {
          // eslint-disable-next-line no-console
          console.log(
            `replay finished at t+${formatElapsed(replayEndMs - replayStartMs)} after ${iteration + 1} polls`,
          );

          break;
        }

        if (iteration < ITERATIONS - 1) {
          await sleep(INTERVAL_MS);
        }
      }

      // eslint-disable-next-line no-console
      console.log(
        `overtake forecasts: 총 ${firedForecastEvents.length}건 발화, 고유 페어 ${firedForecastPairs.size}개`,
      );

      // 워커와 같은 순서다: 폴링 루프가 끝난 뒤 일괄 생성한다.
      // 해설 실패가 이미 퍼블리시한 이벤트를 되돌릴 이유는 없으므로 여기서 삼킨다.
      if (lastFrame !== null && commentaryContext !== null) {
        // 예측 이벤트는 엣지 트리거라 성립한 그 프레임에만 실리고 마지막 프레임 events 에는
        // 없다. 워커(PollRunner)와 같은 창 내 누적 병합이다 — 누적분을 deduplicationKey 로
        // 합치지 않으면 창 중간에 발화한 예측이 해설 대상에서 통째로 빠진다.
        const commentaryFrame: LastFrame = {
          snapshot: lastFrame.snapshot,
          events: mergeEventsByDeduplicationKey(
            lastFrame.events,
            firedForecastEvents,
          ),
        };

        try {
          await runCommentaryPhase(
            db,
            LIVE_SESSION_ID,
            commentaryFrame,
            commentaryContext,
          );
        } catch (error) {
          // eslint-disable-next-line no-console
          console.log(
            `해설 생성 단계가 통째로 실패했다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
          );
        }
      }

      expect(true).toBe(true);
    },
    // 해설을 켜면 폴링이 끝난 뒤 생성 단계가 붙는다. 그 몫을 더해 준다.
    ITERATIONS * (INTERVAL_MS + 10_000) +
      (SHOULD_GENERATE_COMMENTARY ? COMMENTARY_BUDGET_MS : 0),
  );
});
