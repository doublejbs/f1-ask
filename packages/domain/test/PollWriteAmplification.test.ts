import { describe, expect, it } from "vitest";
import { buildOpenF1LiveFrame } from "../src/openf1/OpenF1Recording";
import { OpenF1SessionData } from "../src/openf1/OpenF1Types";
import {
  EMPTY_EVENT_WRITE_CURSOR,
  EventWriteCursor,
  selectUnwrittenEvents,
} from "../src/worker/EventWriteCursor";
import {
  decidePublish,
  EMPTY_PUBLISH_STATE,
  PublishState,
} from "../src/worker/PublishDecision";

// 쓰기 폭증 회귀 테스트 (docs/16-poller-worker.md).
//
// 예전 폴러는 매 폴링마다 "지금까지의 전체 이벤트"를 통째로 batch.set 했다.
// 레이스당 폴링 900회 × 폴링당 수백 건 = 수십만 쓰기. 무료 티어 일 2만의 27배다.
// 워커는 새로 생긴 이벤트만 써야 한다. 이 테스트가 그것을 고정한다.

const T0 = Date.parse("2026-07-19T13:00:00.000Z");
const RACE_DURATION_MS = 90 * 60 * 1000;
const POLL_INTERVAL_MS = 6000;
const POLL_COUNT = RACE_DURATION_MS / POLL_INTERVAL_MS;

const at = (seconds: number): string =>
  new Date(T0 + seconds * 1000).toISOString();

// 레이스 한 편에 가까운 밀도의 원본 데이터.
const makeRaceData = (): OpenF1SessionData => {
  const driverNumbers = [1, 44, 63, 23, 16, 55, 4, 81];
  const laps = driverNumbers.flatMap((driverNumber, driverIndex) =>
    Array.from({ length: 50 }, (_, lapIndex) => ({
      driver_number: driverNumber,
      lap_number: lapIndex + 1,
      date_start: at(lapIndex * 100 + driverIndex),
      // 랩마다 조금씩 빨라져 PersonalBestLap 을 계속 만든다.
      lap_duration: 100 - lapIndex * 0.3 + driverIndex,
    })),
  );
  const teamRadio = driverNumbers.flatMap((driverNumber, driverIndex) =>
    Array.from({ length: 8 }, (_, index) => ({
      date: at(index * 600 + driverIndex * 7 + 30),
      driver_number: driverNumber,
      recording_url: `https://example.com/${driverNumber}-${index}.mp3`,
    })),
  );
  const pits = driverNumbers.flatMap((driverNumber, driverIndex) =>
    [18, 36].map((lapNumber) => ({
      date: at(lapNumber * 100 + driverIndex),
      driver_number: driverNumber,
      lap_number: lapNumber,
      pit_duration: 2.4,
    })),
  );
  const stints = driverNumbers.flatMap((driverNumber) => [
    { driver_number: driverNumber, lap_start: 1, lap_end: 18, compound: "MEDIUM", tyre_age_at_start: 0 },
    { driver_number: driverNumber, lap_start: 19, lap_end: 36, compound: "HARD", tyre_age_at_start: 0 },
    { driver_number: driverNumber, lap_start: 37, lap_end: 50, compound: "SOFT", tyre_age_at_start: 0 },
  ]);
  const positions = driverNumbers.flatMap((driverNumber, driverIndex) =>
    Array.from({ length: 50 }, (_, lapIndex) => ({
      date: at(lapIndex * 100),
      driver_number: driverNumber,
      position: driverIndex + 1,
    })),
  );
  // 쿨다운(60초)보다 넉넉히 벌려 반복 진입이 잡히게 한다.
  const intervals = driverNumbers.flatMap((driverNumber, driverIndex) =>
    Array.from({ length: 20 }, (_, index) => [
      { date: at(index * 240 + driverIndex), driver_number: driverNumber, gap_to_leader: 3, interval: 2.5 },
      { date: at(index * 240 + 120 + driverIndex), driver_number: driverNumber, gap_to_leader: 1, interval: 0.5 },
    ]).flat(),
  );

  return {
    meta: {
      sessionId: "amplification-test",
      sessionKey: 9999,
      meetingKey: 8888,
      sessionName: "Race",
      sessionType: "Race",
      circuitName: "Test Circuit",
      countryCode: "TS",
    },
    drivers: driverNumbers.map((driverNumber, index) => ({
      driver_number: driverNumber,
      name_acronym: `D${index}`,
      full_name: `Driver ${index}`,
      team_name: `Team ${index % 4}`,
    })),
    positions,
    intervals,
    stints,
    laps,
    pits,
    raceControl: [],
    teamRadio,
  };
};

type PollTotals = {
  eventWrites: number;
  snapshotWrites: number;
  sessionDocWrites: number;
  distinctEventCount: number;
};

// 워커의 한 레이스 분량 폴링을 흉내내 실제 Firestore 쓰기 횟수를 센다.
const simulateRace = (data: OpenF1SessionData): PollTotals => {
  let cursor: EventWriteCursor = EMPTY_EVENT_WRITE_CURSOR;
  let publishState: PublishState = EMPTY_PUBLISH_STATE;
  let eventWrites = 0;
  let snapshotWrites = 0;
  let sessionDocWrites = 0;
  let lastEventCount = 0;

  for (let poll = 1; poll <= POLL_COUNT; poll += 1) {
    const nowMs = T0 + poll * POLL_INTERVAL_MS;
    const frame = buildOpenF1LiveFrame(data, {
      startMs: T0,
      nowMs,
      version: poll,
    });
    const selection = selectUnwrittenEvents(frame.events, cursor);

    cursor = selection.nextCursor;
    eventWrites += selection.events.length;
    lastEventCount = frame.events.length;

    const decision = decidePublish(frame.snapshot, publishState, { nowMs });

    publishState = decision.nextState;

    if (decision.shouldWriteSnapshot) {
      snapshotWrites += 1;
    }

    if (decision.shouldWriteSessionDoc) {
      sessionDocWrites += 1;
    }
  }

  return {
    eventWrites,
    snapshotWrites,
    sessionDocWrites,
    distinctEventCount: lastEventCount,
  };
};

describe("레이스 한 편의 폴러 쓰기 예산", () => {
  const totals = simulateRace(makeRaceData());

  it("픽스처가 회귀를 잡을 만큼 이벤트를 만든다", () => {
    // 이 전제가 깨지면 아래 예산 검증이 조용히 무의미해진다.
    expect(totals.distinctEventCount).toBeGreaterThan(300);
  });

  it("이벤트 쓰기가 고유 이벤트 수로 수렴한다", () => {
    // 같은 이벤트를 두 번 쓰지 않는다 — 이것이 폭증의 원인이었다.
    expect(totals.eventWrites).toBe(totals.distinctEventCount);
  });

  it("예전 방식(매 폴링 전체 재기록) 대비 두 자릿수 배로 줄어든다", () => {
    // 예전 폴러가 냈을 쓰기: 폴링마다 그 시점의 전체 이벤트를 batch.set.
    const naiveWrites = totals.distinctEventCount * POLL_COUNT;

    expect(naiveWrites / totals.eventWrites).toBeGreaterThan(50);
  });

  it("세션 메타 문서는 내용이 바뀔 때만 쓴다", () => {
    // 랩/상태가 바뀔 때만 달라진다. 폴링 횟수에 비례하면 안 된다.
    expect(totals.sessionDocWrites).toBeLessThan(POLL_COUNT / 5);
  });

  it("전체 쓰기가 레이스당 무료 티어(일 2만) 안에 넉넉히 들어온다", () => {
    const leaseWrites = POLL_COUNT / 10;
    const cursorWrites = POLL_COUNT / 10;
    const total =
      totals.eventWrites +
      totals.snapshotWrites +
      totals.sessionDocWrites +
      leaseWrites +
      cursorWrites;

    expect(total).toBeLessThan(3000);
  });
});
