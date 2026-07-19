// 개발용 publisher: OpenF1 녹화본을 Firestore 에뮬레이터에 실시간으로 퍼블리시한다.
// 프로덕션의 Cloud Run Worker 역할을 흉내낸다 (서버가 공개 경기 데이터를 write).
//
//   firebase emulators:exec --only firestore --project demo-f1 \
//     "node scripts/publish-openf1-to-firestore.mjs"
//
// 또는 에뮬레이터가 이미 떠 있으면 FIRESTORE_EMULATOR_HOST 를 설정하고 실행한다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

const STEP_MS = Number(process.env.PUBLISH_STEP_MS ?? "1500");

const recordingPath = fileURLToPath(
  new URL("../apps/web/public/openf1-singapore-2023.json", import.meta.url),
);
const recording = JSON.parse(readFileSync(recordingPath, "utf8"));

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-f1" });
const db = getFirestore(app);

const sessionId = recording.sessionId;
const frames = recording.frames;
const timedEvents = recording.events;
const writtenEvents = new Set();

const sessionDocFields = (snapshot) => ({
  schemaVersion: snapshot.schemaVersion,
  sessionId: snapshot.sessionId,
  sessionKey: snapshot.sessionKey,
  meetingKey: snapshot.meetingKey,
  sessionName: snapshot.sessionName,
  sessionType: snapshot.sessionType,
  circuitName: snapshot.circuitName,
  countryCode: snapshot.countryCode,
  status: snapshot.status,
  currentLap: snapshot.currentLap,
  totalLaps: snapshot.totalLaps,
});

const publishFrame = async (index) => {
  const frame = frames[index];
  const nowIso = new Date().toISOString();
  const snapshot = {
    ...frame.snapshot,
    sourceUpdatedAt: nowIso,
    generatedAt: nowIso,
  };

  await db
    .doc(`sessions/${sessionId}`)
    .set(
      { ...sessionDocFields(snapshot), persistedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

  await db
    .doc(`sessions/${sessionId}/live/current`)
    .set({ ...snapshot, persistedAt: FieldValue.serverTimestamp() });

  const fresh = timedEvents.filter(
    (timed) =>
      timed.atSecond <= frame.atSecond &&
      !writtenEvents.has(timed.event.deduplicationKey),
  );

  if (fresh.length > 0) {
    const batch = db.batch();

    for (const timed of fresh) {
      writtenEvents.add(timed.event.deduplicationKey);
      batch.set(
        db.doc(`sessions/${sessionId}/events/${timed.event.deduplicationKey}`),
        timed.event,
      );
    }

    await batch.commit();
  }

  console.log(
    `published frame ${index}/${frames.length - 1} lap ${snapshot.currentLap} status ${snapshot.status} (+${fresh.length} events)`,
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  console.log(
    `Publishing ${frames.length} frames of ${sessionId} to Firestore emulator (${process.env.FIRESTORE_EMULATOR_HOST}), step ${STEP_MS}ms`,
  );

  // 데모용 무한 루프: 끝나면 처음부터 다시 퍼블리시한다.
  for (;;) {
    for (let index = 0; index < frames.length; index += 1) {
      await publishFrame(index);
      await sleep(STEP_MS);
    }

    writtenEvents.clear();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
