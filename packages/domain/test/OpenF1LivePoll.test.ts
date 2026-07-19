import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  fetchLatestOpenF1Meta,
  fetchOpenF1SessionData,
  OpenF1Auth,
  OpenF1ClientOptions,
} from "../src/openf1/OpenF1Client";
import { buildOpenF1LiveFrame } from "../src/openf1/OpenF1Recording";

// 실제 OpenF1 라이브 세션을 폴링해 Firestore 에뮬레이터에 퍼블리시한다 (Worker 역할).
// 네트워크 + 인증 + 에뮬레이터가 필요하므로 기본 실행에서는 skip 된다.
// 토큰은 1시간 만료되므로 username/password 로 자동 갱신하는 것을 권장한다:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 OPENF1_USERNAME=... OPENF1_PASSWORD=... \
//     POLL_OPENF1=1 pnpm exec vitest run packages/domain/test/OpenF1LivePoll.test.ts
// (또는 단기 정적 토큰: OPENF1_API_KEY=... — 1시간 뒤 만료됨)
const shouldRun = process.env.POLL_OPENF1 === "1";
const LIVE_SESSION_ID = "openf1-live";
const ITERATIONS = Number(process.env.POLL_ITERATIONS ?? "20");
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? "6000");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

      const meta = await fetchLatestOpenF1Meta(clientOptions);
      // 고정 sessionId 로 덮어써 클라이언트가 알려진 경로를 구독하게 한다.
      const liveMeta = { ...meta, sessionId: LIVE_SESSION_ID };
      // eslint-disable-next-line no-console
      console.log(
        `Live session: ${meta.sessionName} @ ${meta.circuitName} (key ${meta.sessionKey}) -> ${LIVE_SESSION_ID}`,
      );

      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        const data = await fetchOpenF1SessionData(liveMeta, clientOptions);

        const lapStarts = data.laps
          .map((lap) => (lap.date_start === null ? NaN : Date.parse(lap.date_start)))
          .filter((n) => !Number.isNaN(n));
        const startMs =
          lapStarts.length > 0 ? Math.min(...lapStarts) : Date.now() - 3_600_000;
        const nowMs = Date.now();

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

        // eslint-disable-next-line no-console
        console.log(
          `poll ${iteration + 1}/${ITERATIONS}: lap ${snapshot.currentLap}/${snapshot.totalLaps} status ${snapshot.status}, ${snapshot.drivers.length} drivers, ${events.length} events`,
        );

        if (iteration < ITERATIONS - 1) {
          await sleep(INTERVAL_MS);
        }
      }

      expect(true).toBe(true);
    },
    ITERATIONS * (INTERVAL_MS + 10_000),
  );
});
