import { describe, expect, it } from "vitest";
import {
  buildEvents,
  buildOpenF1LiveFrame,
} from "../src/openf1/OpenF1Recording";
import { OpenF1SessionData } from "../src/openf1/OpenF1Types";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventType } from "../src/RaceEventType";

// 폴러는 6초마다 "전체 원본 데이터 + 현재 시각"으로 이벤트를 통째로 재계산한다.
// 그래서 같은 사건은 어느 시점에 재계산해도 같은 deduplicationKey 로 나와야 하고,
// 한 번 발행된 키는 이후 시점의 결과에서 사라지면 안 된다.
// (Firestore 문서 id 가 deduplicationKey 라, 사라졌다 다시 나타나는 키는
//  그대로 문서 수 증폭이 된다 — docs/16-poller-worker.md "쓰기 증폭 정리")

const T0 = Date.parse("2026-07-19T12:00:00.000Z");
const RACE_DURATION_MS = 3600 * 1000;
const END = T0 + RACE_DURATION_MS;

const at = (seconds: number): string =>
  new Date(T0 + seconds * 1000).toISOString();

// 상한에 걸릴 만큼 이벤트가 많은 드라이버. 문제가 났던 지점이다.
const BUSY_DRIVER = 1;

const makeData = (overrides: Partial<OpenF1SessionData>): OpenF1SessionData => ({
  meta: {
    sessionId: "test-key-stability",
    sessionKey: 11334,
    meetingKey: 1300,
    sessionName: "Race",
    sessionType: "Race",
    circuitName: "Test Circuit",
    countryCode: "TS",
  },
  drivers: [
    { driver_number: 1, name_acronym: "VER", full_name: "Max Verstappen", team_name: "Red Bull Racing" },
    { driver_number: 44, name_acronym: "HAM", full_name: "Lewis Hamilton", team_name: "Mercedes" },
    { driver_number: 63, name_acronym: "RUS", full_name: "George Russell", team_name: "Mercedes" },
    { driver_number: 23, name_acronym: "ALB", full_name: "Alexander Albon", team_name: "Williams" },
  ],
  positions: [],
  intervals: [],
  stints: [],
  laps: [],
  pits: [],
  raceControl: [],
  ...overrides,
});

// 상한(드라이버당 3~5건)을 모두 넉넉히 넘기는 밀도로 만든다.
const makeBusyData = (): OpenF1SessionData => {
  // 매 랩 자기 최속을 갱신한다 → 19건 (첫 랩은 기준선).
  const laps = Array.from({ length: 20 }, (_, index) => ({
    driver_number: BUSY_DRIVER,
    lap_number: index + 1,
    date_start: at(index * 120),
    lap_duration: 140 - index,
  }));
  // 팀 라디오 10건.
  const teamRadio = Array.from({ length: 10 }, (_, index) => ({
    date: at(index * 200 + 30),
    driver_number: BUSY_DRIVER,
    recording_url: `https://example.com/ver-${index}.mp3`,
  }));
  // 쿨다운(60초)보다 넉넉히 벌려 매번 새 진입으로 잡히게 한다 → 10건.
  const intervals = Array.from({ length: 10 }, (_, index) => [
    {
      date: at(index * 240),
      driver_number: BUSY_DRIVER,
      gap_to_leader: 3,
      interval: 2.5,
    },
    {
      date: at(index * 240 + 120),
      driver_number: BUSY_DRIVER,
      gap_to_leader: 1,
      interval: 0.5,
    },
  ]).flat();
  // 피트 후 새 스틴트마다 필드 다수와 다른 컴파운드를 고른다 → StrategyNote 5건.
  const noteLaps = [3, 6, 9, 12, 15];
  const stints = [
    { driver_number: 44, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
    { driver_number: 63, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
    { driver_number: 23, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
    ...noteLaps.map((lap) => ({
      driver_number: BUSY_DRIVER,
      lap_start: lap,
      lap_end: lap + 2,
      compound: "SOFT",
      tyre_age_at_start: 0,
    })),
  ];

  return makeData({ laps, teamRadio, intervals, stints });
};

const keysOf = (events: readonly RaceEvent[]): Set<string> =>
  new Set(events.map((event) => event.deduplicationKey));

const eventsAt = (data: OpenF1SessionData, nowMs: number): RaceEvent[] =>
  buildEvents(data, T0, nowMs).map((timed) => timed.event);

// 창 상한에 실제로 걸릴 만큼 데이터를 넣었는지 먼저 확인한다.
// 이 전제가 깨지면 아래 안정성 테스트가 조용히 무의미해진다.
describe("재계산 안정성 픽스처 전제", () => {
  it("상한 대상 타입이 드라이버당 상한을 넘길 만큼 생성된다", () => {
    const events = eventsAt(makeBusyData(), END);
    const countOf = (type: RaceEventType): number =>
      events.filter(
        (event) => event.type === type && event.driverNumber === BUSY_DRIVER,
      ).length;

    expect(countOf(RaceEventType.PersonalBestLap)).toBeGreaterThan(5);
    expect(countOf(RaceEventType.TeamRadioPosted)).toBeGreaterThan(5);
    expect(countOf(RaceEventType.StrategyNote)).toBeGreaterThan(3);
    expect(
      countOf(RaceEventType.GapClosing) +
        countOf(RaceEventType.OverrideRangeEntered),
    ).toBeGreaterThan(5);
  });
});

describe("deduplicationKey 재계산 안정성", () => {
  it("앞 시점에서 나온 키가 뒤 시점 결과에도 그대로 남는다", () => {
    const data = makeBusyData();
    const earlyKeys = eventsAt(data, T0 + RACE_DURATION_MS / 2);
    const lateKeys = keysOf(eventsAt(data, END));

    expect(earlyKeys.length).toBeGreaterThan(0);

    for (const event of earlyKeys) {
      expect(
        lateKeys.has(event.deduplicationKey),
        `${event.type} 키가 뒤 시점에서 사라졌다: ${event.deduplicationKey}`,
      ).toBe(true);
    }
  });

  it("여러 시점을 순회하며 모은 키 집합이 최종 시점 키 집합과 같다", () => {
    const data = makeBusyData();
    const accumulated = new Set<string>();

    // 폴러가 6초 간격으로 훑는 것을 흉내 낸다(테스트에서는 60초 간격 60회).
    for (let step = 1; step <= 60; step += 1) {
      const nowMs = T0 + (RACE_DURATION_MS / 60) * step;

      for (const key of keysOf(eventsAt(data, nowMs))) {
        accumulated.add(key);
      }
    }

    // 누적 집합이 최종 계산보다 크면 그만큼이 곧 Firestore 문서 증폭이다.
    expect([...accumulated].sort()).toEqual([...keysOf(eventsAt(data, END))].sort());
  });

  it("같은 키는 시점이 달라도 같은 timestamp 와 타입을 유지한다", () => {
    const data = makeBusyData();
    const seen = new Map<string, string>();

    for (let step = 1; step <= 20; step += 1) {
      const nowMs = T0 + (RACE_DURATION_MS / 20) * step;

      for (const event of eventsAt(data, nowMs)) {
        const signature = `${event.type}:${event.timestamp}`;
        const previous = seen.get(event.deduplicationKey);

        if (previous !== undefined) {
          expect(signature, `키 ${event.deduplicationKey} 의 내용이 바뀌었다`).toBe(
            previous,
          );
        }

        seen.set(event.deduplicationKey, signature);
      }
    }
  });

  it("buildOpenF1LiveFrame 도 시점이 흘러도 과거 키를 유지한다", () => {
    const data = makeBusyData();
    const early = buildOpenF1LiveFrame(data, {
      startMs: T0,
      nowMs: T0 + RACE_DURATION_MS / 3,
    });
    const late = buildOpenF1LiveFrame(data, { startMs: T0, nowMs: END });
    const lateKeys = keysOf(late.events);

    expect(early.events.length).toBeGreaterThan(0);

    for (const event of early.events) {
      expect(
        lateKeys.has(event.deduplicationKey),
        `${event.type} 키가 뒤 시점에서 사라졌다: ${event.deduplicationKey}`,
      ).toBe(true);
    }
  });
});
