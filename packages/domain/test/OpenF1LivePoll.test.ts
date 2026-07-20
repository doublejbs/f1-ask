import { initializeApp } from "firebase-admin/app";
import { FieldValue, Firestore, getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  fetchLatestOpenF1Meta,
  fetchOpenF1SessionData,
  OpenF1Auth,
  OpenF1ClientOptions,
} from "../src/openf1/OpenF1Client";
import { buildOpenF1LiveFrame } from "../src/openf1/OpenF1Recording";
import { OpenF1SessionData } from "../src/openf1/OpenF1Types";

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

// 리플레이를 "처음부터" 재생하려면 이전 실행이 남긴 이벤트 문서를 지워야 한다.
// 에뮬레이터 REST DELETE 는 보안 규칙에 막히지만 admin SDK 는 규칙을 우회한다.
const deleteSessionEvents = async (
  db: Firestore,
  sessionId: string,
): Promise<number> => {
  const collection = db.collection(`sessions/${sessionId}/events`);
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
      expect(
        process.env.FIRESTORE_EMULATOR_HOST,
        "FIRESTORE_EMULATOR_HOST is required",
      ).toBeTruthy();

      const app = initializeApp(
        { projectId: process.env.GCLOUD_PROJECT ?? "demo-f1" },
        `poll-${Date.now()}`,
      );
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
        const deleted = await deleteSessionEvents(db, LIVE_SESSION_ID);

        // eslint-disable-next-line no-console
        console.log(
          `replay mode: speed x${REPLAY_SPEED}, duration ${formatElapsed(replayEndMs - replayStartMs)}, cleared ${deleted} existing events`,
        );
      }

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

        if (events.length > 0) {
          const batch = db.batch();

          for (const event of events) {
            batch.set(
              db.doc(
                `sessions/${LIVE_SESSION_ID}/events/${event.deduplicationKey}`,
              ),
              event,
            );
          }

          await batch.commit();
        }

        if (isReplayMode) {
          const totalMs = Math.max(1, replayEndMs - replayStartMs);
          const progress = Math.round(((nowMs - startMs) / totalMs) * 100);

          // eslint-disable-next-line no-console
          console.log(
            `replay ${iteration + 1}/${ITERATIONS}: t+${formatElapsed(nowMs - startMs)} (${progress}%) lap ${snapshot.currentLap}/${snapshot.totalLaps}, ${snapshot.drivers.length} drivers, ${events.length} events`,
          );
        } else {
          // eslint-disable-next-line no-console
          console.log(
            `poll ${iteration + 1}/${ITERATIONS}: lap ${snapshot.currentLap}/${snapshot.totalLaps} status ${snapshot.status}, ${snapshot.drivers.length} drivers, ${events.length} events`,
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

      expect(true).toBe(true);
    },
    ITERATIONS * (INTERVAL_MS + 10_000),
  );
});
