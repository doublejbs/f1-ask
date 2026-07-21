import { describe, expect, it } from "vitest";
import {
  buildOpenF1Index,
  deriveOpenF1Status,
  mapCompound,
  normalizeOpenF1SnapshotAt,
} from "../src/openf1/OpenF1Normalizer";
import {
  buildOpenF1Recording,
  OpenF1ReplaySource,
} from "../src/openf1/OpenF1Recording";
import { OpenF1SessionData } from "../src/openf1/OpenF1Types";
import { RaceEventType } from "../src/RaceEventType";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";

const T0 = Date.parse("2023-01-01T00:00:00.000Z");
const at = (seconds: number): string => new Date(T0 + seconds * 1000).toISOString();

// 소형 합성 OpenF1 데이터 (네트워크 없이 결정론적 검증).
const data: OpenF1SessionData = {
  meta: {
    sessionId: "test-race",
    sessionKey: 1,
    meetingKey: 2,
    sessionName: "Test GP — Race",
    sessionType: "Race",
    circuitName: "Test Circuit",
    countryCode: "TS",
  },
  drivers: [
    { driver_number: 1, name_acronym: "VER", full_name: "Max Verstappen", team_name: "Red Bull Racing" },
    { driver_number: 44, name_acronym: "HAM", full_name: "Lewis Hamilton", team_name: "Mercedes" },
    { driver_number: 16, name_acronym: "LEC", full_name: "Charles Leclerc", team_name: "Ferrari" },
  ],
  positions: [
    { date: at(0), driver_number: 1, position: 1 },
    { date: at(0), driver_number: 44, position: 2 },
    { date: at(0), driver_number: 16, position: 3 },
    { date: at(60), driver_number: 44, position: 1 },
    { date: at(60), driver_number: 1, position: 2 },
  ],
  intervals: [
    { date: at(0), driver_number: 1, gap_to_leader: 0, interval: 0 },
    { date: at(0), driver_number: 44, gap_to_leader: 1.5, interval: 1.5 },
    { date: at(0), driver_number: 16, gap_to_leader: 3, interval: 1.5 },
    { date: at(60), driver_number: 44, gap_to_leader: 0, interval: 0 },
    { date: at(60), driver_number: 1, gap_to_leader: 0.8, interval: 0.8 },
    { date: at(60), driver_number: 16, gap_to_leader: "+1 LAP", interval: null },
  ],
  stints: [
    { driver_number: 1, lap_start: 1, lap_end: 20, compound: "MEDIUM", tyre_age_at_start: 0 },
    { driver_number: 44, lap_start: 1, lap_end: 20, compound: "SOFT", tyre_age_at_start: 2 },
    { driver_number: 16, lap_start: 1, lap_end: 20, compound: "HARD", tyre_age_at_start: 0 },
  ],
  laps: [
    { driver_number: 1, lap_number: 1, date_start: at(0), lap_duration: 95 },
    { driver_number: 1, lap_number: 2, date_start: at(90), lap_duration: 94 },
    { driver_number: 44, lap_number: 1, date_start: at(0), lap_duration: 93.5 },
  ],
  pits: [{ date: at(30), driver_number: 44, lap_number: 1, pit_duration: 25 }],
  raceControl: [
    { date: at(0), category: "Flag", flag: "GREEN", scope: "Track", message: "GREEN LIGHT - PIT EXIT OPEN" },
    { date: at(120), category: "SafetyCar", flag: null, scope: "Track", message: "SAFETY CAR DEPLOYED" },
    { date: at(200), category: "Flag", flag: "CHEQUERED", scope: "Track", message: "CHEQUERED FLAG" },
  ],
  teamRadio: [
    { date: at(50), driver_number: 1, recording_url: "https://example.com/ver_50.mp3" },
    { date: at(100), driver_number: 44, recording_url: "https://example.com/ham_100.mp3" },
  ],
};

describe("mapCompound", () => {
  it("문자열 컴파운드를 enum 으로 매핑한다", () => {
    expect(mapCompound("SOFT")).toBe(TireCompound.Soft);
    expect(mapCompound("medium")).toBe(TireCompound.Medium);
    expect(mapCompound("???")).toBe(TireCompound.Unknown);
  });
});

describe("normalizeOpenF1SnapshotAt", () => {
  const index = buildOpenF1Index(data);

  it("초반 순위·컴파운드·총랩을 정규화한다", () => {
    const snapshot = normalizeOpenF1SnapshotAt(index, T0 + 10_000, 0);
    const ver = snapshot.drivers.find((d) => d.driverNumber === 1);

    expect(snapshot.status).toBe(SessionStatus.Green);
    expect(snapshot.totalLaps).toBe(20);
    expect(ver?.position).toBe(1);
    expect(ver?.compound).toBe(TireCompound.Medium);
    expect(snapshot.drivers).toHaveLength(3);
  });

  it("팀 라디오는 atMs 이전 클립을 최신순으로 담고 드라이버 코드를 매핑한다", () => {
    // t=70s: VER(50s) 클립만 존재.
    const early = normalizeOpenF1SnapshotAt(index, T0 + 70_000, 0);
    expect(early.teamRadios).toHaveLength(1);
    expect(early.teamRadios?.[0]?.driverCode).toBe("VER");
    expect(early.teamRadios?.[0]?.recordingUrl).toBe("https://example.com/ver_50.mp3");

    // t=120s: HAM(100s)·VER(50s) 두 클립, 최신(HAM)이 먼저.
    const later = normalizeOpenF1SnapshotAt(index, T0 + 120_000, 0);
    expect(later.teamRadios?.map((c) => c.driverCode)).toEqual(["HAM", "VER"]);
  });

  it("추월 후 순위가 갱신된다", () => {
    const snapshot = normalizeOpenF1SnapshotAt(index, T0 + 65_000, 1);
    const leader = snapshot.drivers.find((d) => d.position === 1);

    expect(leader?.driverNumber).toBe(44);
  });

  it("선두의 앞차 간격은 null 이다 — OpenF1 의 interval 0 을 그대로 흘리지 않는다", () => {
    // OpenF1 은 선두에게도 `interval: 0` 을 보내지만 그 0 은 "간격이 0 초"가 아니라
    // "앞차가 없다"는 뜻이다. 흘려보내면 간격 수렴 감지가 `0 < 1.0` 으로 발화해
    // "P1 앞차와 0.0초" 같은 문장을 만들어 낸다.
    const early = normalizeOpenF1SnapshotAt(index, T0 + 10_000, 0);
    const earlyLeader = early.drivers.find((d) => d.position === 1);
    const earlySecond = early.drivers.find((d) => d.position === 2);

    expect(earlyLeader?.driverNumber).toBe(1);
    expect(earlyLeader?.intervalToAheadSeconds).toBeNull();
    // 선두 대비 간격 0 은 여전히 사실이므로 이 필드는 건드리지 않는다.
    expect(earlyLeader?.gapToLeaderSeconds).toBe(0);
    // 선두가 아닌 차의 간격은 그대로 통과한다 — 0 을 뭉개는 것이 아니다.
    expect(earlySecond?.intervalToAheadSeconds).toBe(1.5);

    // 선두가 바뀌면 null 도 따라 옮겨간다. 드라이버가 아니라 자리에 붙은 성질이다.
    const late = normalizeOpenF1SnapshotAt(index, T0 + 65_000, 1);
    const lateLeader = late.drivers.find((d) => d.position === 1);
    const lateSecond = late.drivers.find((d) => d.position === 2);

    expect(lateLeader?.driverNumber).toBe(44);
    expect(lateLeader?.intervalToAheadSeconds).toBeNull();
    expect(lateSecond?.driverNumber).toBe(1);
    expect(lateSecond?.intervalToAheadSeconds).toBe(0.8);
  });

  it("숫자가 아닌 gap('+1 LAP')은 null 로 처리한다", () => {
    const snapshot = normalizeOpenF1SnapshotAt(index, T0 + 65_000, 1);
    const lec = snapshot.drivers.find((d) => d.driverNumber === 16);

    expect(lec?.gapToLeaderSeconds).toBeNull();
  });

  it("피트 윈도우 동안 inPit 이고 피트 카운트가 오른다", () => {
    const during = normalizeOpenF1SnapshotAt(index, T0 + 40_000, 0).drivers.find(
      (d) => d.driverNumber === 44,
    );

    expect(during?.inPit).toBe(true);
    expect(during?.pitStopCount).toBe(1);
  });

  it("라이브 진행 중 총랩이 현재랩보다 작으면 null 로 둔다 (LAP 15 of 14 방지)", () => {
    // 스틴트 lap_end 가 14 인데 리더가 15랩째를 돌고 있는 라이브 상황.
    const liveData: OpenF1SessionData = {
      ...data,
      stints: [
        { driver_number: 1, lap_start: 1, lap_end: 14, compound: "MEDIUM", tyre_age_at_start: 0 },
      ],
      laps: [
        { driver_number: 1, lap_number: 14, date_start: at(0), lap_duration: 95 },
        { driver_number: 1, lap_number: 15, date_start: at(90), lap_duration: 94 },
      ],
    };
    const liveIndex = buildOpenF1Index(liveData);
    const snapshot = normalizeOpenF1SnapshotAt(liveIndex, T0 + 120_000, 0);

    expect(snapshot.currentLap).toBe(15);
    expect(snapshot.totalLaps).toBeNull();
  });

  it("완주 후 캡처된 데이터(스틴트가 현재 랩보다 앞)는 총랩을 신뢰한다", () => {
    // 초반(currentLap 2)에도 스틴트 lap_end=20 이 앞을 내다보므로 20 을 표시.
    const snapshot = normalizeOpenF1SnapshotAt(index, T0 + 10_000, 0);

    expect(snapshot.currentLap).toBeLessThan(20);
    expect(snapshot.totalLaps).toBe(20);
  });

  it("알려진 서킷(Race)은 라이브 중에도 예정 총랩을 표시한다 (LAP x of 44)", () => {
    // Spa 라이브: 스틴트 lap_end 는 현재 랩 근처지만, 서킷 참조로 44 를 안다.
    const spaData: OpenF1SessionData = {
      ...data,
      meta: { ...data.meta, circuitName: "Spa-Francorchamps", sessionType: "Race" },
      stints: [
        { driver_number: 1, lap_start: 1, lap_end: 15, compound: "MEDIUM", tyre_age_at_start: 0 },
      ],
      laps: [{ driver_number: 1, lap_number: 15, date_start: at(0), lap_duration: 95 }],
    };
    const spaIndex = buildOpenF1Index(spaData);
    const snapshot = normalizeOpenF1SnapshotAt(spaIndex, T0 + 120_000, 0);

    expect(snapshot.currentLap).toBe(15);
    expect(snapshot.totalLaps).toBe(44);
  });

  it("세션 종료 시에는 총랩=현재랩이어도 표시한다", () => {
    // 체커드 이후, 스틴트 lap_end=15 이고 리더가 15랩 완주.
    const finishedData: OpenF1SessionData = {
      ...data,
      stints: [
        { driver_number: 1, lap_start: 1, lap_end: 15, compound: "MEDIUM", tyre_age_at_start: 0 },
      ],
      laps: [{ driver_number: 1, lap_number: 15, date_start: at(0), lap_duration: 95 }],
      raceControl: [
        { date: at(0), category: "Flag", flag: "GREEN", scope: "Track", message: "GREEN" },
        { date: at(50), category: "Flag", flag: "CHEQUERED", scope: "Track", message: "CHEQUERED FLAG" },
      ],
    };
    const finishedIndex = buildOpenF1Index(finishedData);
    const snapshot = normalizeOpenF1SnapshotAt(finishedIndex, T0 + 120_000, 0);

    expect(snapshot.status).toBe(SessionStatus.Finished);
    expect(snapshot.currentLap).toBe(15);
    expect(snapshot.totalLaps).toBe(15);
  });
});

describe("deriveOpenF1Status", () => {
  const index = buildOpenF1Index(data);

  it("세이프티카 → 종료 순으로 상태가 바뀐다", () => {
    expect(deriveOpenF1Status(index.raceControlSorted, T0 + 10_000)).toBe(SessionStatus.Green);
    expect(deriveOpenF1Status(index.raceControlSorted, T0 + 130_000)).toBe(SessionStatus.SafetyCar);
    expect(deriveOpenF1Status(index.raceControlSorted, T0 + 250_000)).toBe(SessionStatus.Finished);
  });
});

describe("buildOpenF1Recording + OpenF1ReplaySource", () => {
  const recording = buildOpenF1Recording(data, {
    startMs: T0,
    endMs: T0 + 200_000,
    cadenceMs: 20_000,
  });

  it("cadence 단위로 프레임을 만든다", () => {
    expect(recording.frames).toHaveLength(11);
    expect(recording.durationSeconds).toBe(200);
  });

  it("피트·세이프티카·종료·시작 이벤트를 생성한다", () => {
    const types = recording.events.map((timed) => timed.event.type);

    expect(types).toContain(RaceEventType.PitStop);
    expect(types).toContain(RaceEventType.SafetyCar);
    expect(types).toContain(RaceEventType.SessionFinished);
    expect(types).toContain(RaceEventType.SessionStarted);
  });

  it("재생 소스는 freshness 를 위해 snapshot 시각을 재기록한다", () => {
    const playbackEpoch = Date.parse("2026-07-19T05:00:00.000Z");
    const source = new OpenF1ReplaySource(recording, playbackEpoch);
    const frame = source.frameAt(40);

    expect(Date.parse(frame.snapshot.sourceUpdatedAt)).toBeGreaterThanOrEqual(
      playbackEpoch,
    );
    // 40초 시점에는 이미 피트(30s) 이벤트가 포함된다.
    expect(frame.events.some((e) => e.type === RaceEventType.PitStop)).toBe(true);
  });

  it("경과 시간 이하의 최신 프레임을 반환한다", () => {
    const source = new OpenF1ReplaySource(recording, T0);

    expect(source.frameAt(25).snapshot.version).toBe(1);
    expect(source.durationSeconds).toBe(200);
  });
});
