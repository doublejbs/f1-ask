import { describe, expect, it } from "vitest";
import { buildEvents } from "../src/openf1/OpenF1Recording";
import {
  OpenF1RaceControl,
  OpenF1SessionData,
} from "../src/openf1/OpenF1Types";
import { InvestigationStatus } from "../src/InvestigationStatus";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { RetirementReason } from "../src/RetirementReason";
import { TrackHazardKind } from "../src/TrackHazardKind";

const T0 = Date.parse("2026-07-19T12:00:00.000Z");
const END = T0 + 3600 * 1000;

const at = (seconds: number): string =>
  new Date(T0 + seconds * 1000).toISOString();

const makeData = (overrides: Partial<OpenF1SessionData>): OpenF1SessionData => ({
  meta: {
    sessionId: "test-events",
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

// race_control 메시지만 담은 데이터에서 이벤트를 만든다.
const eventsFromRaceControl = (raceControl: OpenF1RaceControl[]): RaceEvent[] =>
  buildEvents(makeData({ raceControl }), T0, END).map((timed) => timed.event);

const typesOf = (events: RaceEvent[]): RaceEventType[] =>
  events.map((event) => event.type);

const findEvent = (
  events: RaceEvent[],
  type: RaceEventType,
): RaceEvent | undefined => events.find((event) => event.type === type);

describe("race_control 구조화 분기", () => {
  it("flag/scope 조합이 올바른 이벤트 타입과 우선순위를 만든다", () => {
    const events = eventsFromRaceControl([
      { date: at(1), category: "Flag", flag: "GREEN", scope: "Track", message: "GREEN LIGHT" },
      { date: at(2), category: "Flag", flag: "BLUE", scope: "Driver", message: "WAVED BLUE FLAG FOR CAR 23 (ALB)", driver_number: 23, lap_number: 5 },
      { date: at(3), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 7", sector: 7 },
      { date: at(4), category: "Flag", flag: "CLEAR", scope: "Sector", message: "CLEAR IN TRACK SECTOR 7", sector: 7 },
      { date: at(5), category: "Flag", flag: "YELLOW", scope: "Sector", message: "YELLOW IN TRACK SECTOR 3", sector: 3 },
      { date: at(6), category: "Flag", flag: "RED", scope: "Track", message: "RED FLAG" },
      { date: at(7), category: "Flag", flag: "CHEQUERED", scope: "Track", message: "CHEQUERED FLAG" },
    ]);

    const green = findEvent(events, RaceEventType.GreenFlag);
    expect(green?.priority).toBe(RaceEventPriority.High);

    const blue = findEvent(events, RaceEventType.BlueFlag);
    expect(blue?.priority).toBe(RaceEventPriority.Low);
    expect(blue?.params.driverCode).toBe("ALB");
    expect(blue?.driverNumber).toBe(23);

    const sectorYellow = findEvent(events, RaceEventType.SectorYellow);
    expect(sectorYellow?.priority).toBe(RaceEventPriority.Medium);
    expect(sectorYellow?.params.sector).toBe(7);
    expect(sectorYellow?.params.double).toBe(true);

    const sectorClear = findEvent(events, RaceEventType.SectorClear);
    expect(sectorClear?.priority).toBe(RaceEventPriority.Low);
    expect(sectorClear?.params.sector).toBe(7);

    const singleYellow = events.find(
      (event) =>
        event.type === RaceEventType.SectorYellow && event.params.sector === 3,
    );
    expect(singleYellow?.params.double).toBe(false);

    const red = findEvent(events, RaceEventType.RedFlag);
    expect(red?.priority).toBe(RaceEventPriority.Critical);

    const chequered = findEvent(events, RaceEventType.ChequeredFlag);
    expect(chequered?.priority).toBe(RaceEventPriority.High);
  });

  it("scope 가 Track 인 옐로는 YellowFlag 를 만든다", () => {
    const events = eventsFromRaceControl([
      { date: at(1), category: "Flag", flag: "DOUBLE YELLOW", scope: "Track", message: "DOUBLE YELLOW" },
    ]);

    expect(findEvent(events, RaceEventType.YellowFlag)?.priority).toBe(
      RaceEventPriority.High,
    );
    expect(typesOf(events)).not.toContain(RaceEventType.SectorYellow);
  });

  it("SessionStatus 카테고리가 세션 시작·종료 이벤트를 만든다", () => {
    const events = eventsFromRaceControl([
      { date: at(1), category: "SessionStatus", flag: null, scope: null, message: "SESSION STARTED" },
      { date: at(2), category: "SessionStatus", flag: null, scope: null, message: "SESSION FINISHED" },
    ]);

    expect(findEvent(events, RaceEventType.SessionStarted)?.priority).toBe(
      RaceEventPriority.Medium,
    );
    expect(findEvent(events, RaceEventType.SessionFinished)?.priority).toBe(
      RaceEventPriority.High,
    );
  });

  it("SafetyCar 카테고리가 SC/VSC/재시작 이벤트를 만든다", () => {
    const events = eventsFromRaceControl([
      { date: at(1), category: "SafetyCar", flag: null, scope: "Track", message: "SAFETY CAR DEPLOYED" },
      { date: at(2), category: "SafetyCar", flag: null, scope: "Track", message: "SAFETY CAR IN THIS LAP" },
      { date: at(3), category: "SafetyCar", flag: null, scope: "Track", message: "VIRTUAL SAFETY CAR DEPLOYED" },
      { date: at(4), category: "SafetyCar", flag: null, scope: "Track", message: "VIRTUAL SAFETY CAR ENDING" },
    ]);

    expect(findEvent(events, RaceEventType.SafetyCar)?.priority).toBe(
      RaceEventPriority.Critical,
    );
    expect(findEvent(events, RaceEventType.VirtualSafetyCar)?.priority).toBe(
      RaceEventPriority.Critical,
    );
    expect(
      events.filter((event) => event.type === RaceEventType.SessionRestarted),
    ).toHaveLength(2);
  });

  it("알 수 없는 category/flag/scope 값은 무시하고 예외를 던지지 않는다", () => {
    const run = (): RaceEvent[] =>
      eventsFromRaceControl([
        { date: at(1), category: "Weather", flag: "PURPLE", scope: "Galaxy", message: "???" },
        { date: "not-a-date", category: "Flag", flag: "GREEN", scope: "Track", message: "GREEN" },
      ]);

    expect(run).not.toThrow();
    expect(run()).toHaveLength(0);
  });
});

describe("race_control 메시지 파싱", () => {
  it("다중 차량 인시던트에서 차량 2대를 모두 추출한다", () => {
    const events = eventsFromRaceControl([
      {
        date: at(10),
        category: "Other",
        flag: null,
        scope: null,
        message:
          "TURN 6 INCIDENT INVOLVING CARS 44 (HAM) AND 63 (RUS) NOTED - CAUSING A COLLISION (15:04:29)",
      },
    ]);

    const investigation = findEvent(events, RaceEventType.Investigation);

    expect(investigation?.priority).toBe(RaceEventPriority.High);
    expect(String(investigation?.params.driverCodes).split(",")).toEqual([
      "HAM",
      "RUS",
    ]);
    expect(investigation?.driverNumber).toBe(44);
    expect(investigation?.params.reason).toBe("causing_a_collision");
    expect(investigation?.params.turn).toBe(6);
  });

  // NOTED 는 스튜어드의 "접수"이지 종결이 아니다. 실제 레이스에서는
  // NOTED → WILL BE INVESTIGATED → (종결 통보) 순으로 온다.
  it("NOTED / 조사 중 / 종결을 3-상태로 구분한다", () => {
    const events = eventsFromRaceControl([
      {
        date: at(10),
        category: "Other",
        flag: null,
        scope: null,
        message:
          "INCIDENT INVOLVING CAR 23 (ALB) NOTED - CAR SAFETY LIGHTS (14:22:09)",
      },
      {
        date: at(20),
        category: "Other",
        flag: null,
        scope: null,
        message:
          "FIA STEWARDS: INCIDENT INVOLVING CAR 23 (ALB) WILL BE INVESTIGATED AFTER THE RACE - CAR SAFETY LIGHTS (14:25:00)",
      },
      {
        date: at(30),
        category: "Other",
        flag: null,
        scope: null,
        message:
          "FIA STEWARDS: NO FURTHER INVESTIGATION - CAR 23 (ALB) - CAR SAFETY LIGHTS (14:40:00)",
      },
    ]);

    const investigations = events.filter(
      (event) => event.type === RaceEventType.Investigation,
    );

    expect(investigations).toHaveLength(3);
    expect(investigations[0]?.params.status).toBe(InvestigationStatus.Noted);
    expect(investigations[1]?.params.status).toBe(
      InvestigationStatus.UnderInvestigation,
    );
    expect(investigations[2]?.params.status).toBe(
      InvestigationStatus.Concluded,
    );

    // 뒤집힌 boolean(`resolved`)은 더 이상 담지 않는다.
    for (const investigation of investigations) {
      expect(investigation.params.resolved).toBeUndefined();
    }
  });

  it("NO FURTHER ACTION / INVESTIGATION COMPLETE 도 종결로 본다", () => {
    const events = eventsFromRaceControl([
      {
        date: at(10),
        category: "Other",
        flag: null,
        scope: null,
        message:
          "FIA STEWARDS: NO FURTHER ACTION - CAR 44 (HAM) - IMPEDING (14:50:00)",
      },
      {
        date: at(20),
        category: "Other",
        flag: null,
        scope: null,
        message:
          "FIA STEWARDS: INVESTIGATION COMPLETE - CAR 63 (RUS) - IMPEDING (14:55:00)",
      },
    ]);

    const investigations = events.filter(
      (event) => event.type === RaceEventType.Investigation,
    );

    expect(investigations).toHaveLength(2);
    expect(
      investigations.every(
        (event) => event.params.status === InvestigationStatus.Concluded,
      ),
    ).toBe(true);
  });

  // ` - ` 가 두 번 나오는 스튜어드 문구. 최좌측·최우측 어느 한쪽만 봐도 실패한다.
  it("하이픈이 여러 개인 문구에서도 사유를 추출한다", () => {
    const events = eventsFromRaceControl([
      {
        date: at(10),
        category: "Other",
        flag: null,
        scope: null,
        message:
          "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 1 (VER) - CAUSING A COLLISION - TURN 4 (15:10:00)",
      },
    ]);

    const penalty = findEvent(events, RaceEventType.Penalty);

    expect(penalty?.params.reason).toBe("causing_a_collision");
    expect(penalty?.params.penaltySeconds).toBe(5);
    expect(penalty?.params.driverCode).toBe("VER");
  });

  // `숫자 (대문자코드)` 를 무조건 차량으로 보면 "LAP 12 (SC)" 가 유령 차량이 된다.
  it("CARS 절 밖의 괄호 표기를 차량으로 오인하지 않는다", () => {
    const events = eventsFromRaceControl([
      {
        date: at(10),
        category: "Other",
        flag: null,
        scope: null,
        message: "TURN 1 INCIDENT INVOLVING CAR 5 (VET) LAP 12 (SC) NOTED - IMPEDING",
      },
    ]);

    const investigation = findEvent(events, RaceEventType.Investigation);

    expect(String(investigation?.params.driverCodes).split(",")).toEqual([
      "VET",
    ]);
  });

  it("Penalty 는 다중 차량 전체를 driverCodes 에 담는다", () => {
    const events = eventsFromRaceControl([
      {
        date: at(10),
        category: "Other",
        flag: null,
        scope: null,
        message:
          "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CARS 44 (HAM) AND 63 (RUS) - CAUSING A COLLISION",
      },
    ]);

    const penalty = findEvent(events, RaceEventType.Penalty);

    expect(penalty?.params.driverCode).toBe("HAM");
    expect(String(penalty?.params.driverCodes).split(",")).toEqual([
      "HAM",
      "RUS",
    ]);
  });

  it("페널티 초를 추출한다", () => {
    const events = eventsFromRaceControl([
      {
        date: at(10),
        category: "Other",
        flag: null,
        scope: null,
        message:
          "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 23 (ALB) - CAUSING A COLLISION (14:30:00)",
      },
      {
        date: at(20),
        category: "Other",
        flag: null,
        scope: null,
        message: "FIA STEWARDS: 10 SECONDS PENALTY FOR CAR 44 (HAM) - IMPEDING",
      },
    ]);

    const penalties = events.filter(
      (event) => event.type === RaceEventType.Penalty,
    );

    expect(penalties).toHaveLength(2);
    expect(penalties[0]?.priority).toBe(RaceEventPriority.Critical);
    expect(penalties[0]?.params.penaltySeconds).toBe(5);
    expect(penalties[0]?.params.driverCode).toBe("ALB");
    expect(penalties[1]?.params.penaltySeconds).toBe(10);
  });

  it("트랙 리밋·트랙 위험물·DRS·피트레인·강우 확률을 매핑한다", () => {
    const events = eventsFromRaceControl([
      { date: at(10), category: "Other", flag: null, scope: null, message: "CAR 44 (HAM) TRACK LIMITS AT TURN 4 LAP 12 - LAP TIME DELETED" },
      { date: at(20), category: "Other", flag: null, scope: null, message: "RECOVERY VEHICLE ON TRACK AT TURN 6" },
      { date: at(30), category: "Other", flag: null, scope: null, message: "MARSHALS ON TRACK AT TURN 6" },
      { date: at(40), category: "Other", flag: null, scope: null, message: "OVERTAKE ENABLED" },
      { date: at(50), category: "Other", flag: null, scope: null, message: "OVERTAKE DISABLED" },
      { date: at(60), category: "Other", flag: null, scope: null, message: "PIT EXIT CLOSED" },
      { date: at(70), category: "Other", flag: null, scope: null, message: "GREEN LIGHT - PIT EXIT OPEN" },
      { date: at(80), category: "Other", flag: null, scope: null, message: "RISK OF RAIN FOR THE F1 RACE IS 10%" },
    ]);

    const trackLimits = findEvent(events, RaceEventType.TrackLimits);
    expect(trackLimits?.priority).toBe(RaceEventPriority.Low);
    expect(trackLimits?.params.driverCode).toBe("HAM");
    expect(trackLimits?.params.turn).toBe(4);

    const hazards = events.filter(
      (event) => event.type === RaceEventType.TrackHazard,
    );
    expect(hazards).toHaveLength(2);
    expect(hazards[0]?.priority).toBe(RaceEventPriority.High);
    expect(hazards[0]?.params.kind).toBe(TrackHazardKind.RecoveryVehicle);
    expect(hazards[0]?.params.turn).toBe(6);
    expect(hazards[1]?.params.kind).toBe(TrackHazardKind.Marshals);

    expect(findEvent(events, RaceEventType.DrsEnabled)?.priority).toBe(
      RaceEventPriority.Medium,
    );
    expect(typesOf(events)).toContain(RaceEventType.DrsDisabled);
    expect(typesOf(events)).toContain(RaceEventType.PitLaneClosed);
    expect(typesOf(events)).toContain(RaceEventType.PitLaneOpen);

    const rain = findEvent(events, RaceEventType.RainRisk);
    expect(rain?.priority).toBe(RaceEventPriority.Medium);
    expect(rain?.params.percent).toBe(10);
  });

  it("파싱에 실패한 메시지는 이벤트를 만들지 않고 예외도 던지지 않는다", () => {
    const run = (): RaceEvent[] =>
      eventsFromRaceControl([
        { date: at(10), category: "Other", flag: null, scope: null, message: "SOME UNKNOWN MESSAGE" },
        { date: at(20), category: "Other", flag: null, scope: null, message: "" },
        { date: at(30), category: "Other", flag: null, scope: null, message: "INCIDENT INVOLVING UNKNOWN PARTIES NOTED" },
        { date: at(40), category: "Other", flag: null, scope: null, message: "((((" },
      ]);

    expect(run).not.toThrow();
    expect(run()).toHaveLength(0);
  });

  it("알 수 없는 사유 문구는 reason 을 담지 않는다", () => {
    const events = eventsFromRaceControl([
      {
        date: at(10),
        category: "Other",
        flag: null,
        scope: null,
        message: "INCIDENT INVOLVING CAR 23 (ALB) NOTED - SOMETHING NEVER SEEN BEFORE (14:22:09)",
      },
    ]);

    const investigation = findEvent(events, RaceEventType.Investigation);

    expect(investigation).toBeDefined();
    expect(investigation?.params.reason).toBeUndefined();
  });
});

describe("상태 전이 중복 제거", () => {
  it("같은 섹터의 동일 상태 연속 입력은 1건만 만든다", () => {
    const events = eventsFromRaceControl([
      { date: at(1), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 7", sector: 7 },
      { date: at(2), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 7", sector: 7 },
      { date: at(3), category: "Flag", flag: "CLEAR", scope: "Sector", message: "CLEAR IN TRACK SECTOR 7", sector: 7 },
      { date: at(4), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 7", sector: 7 },
    ]);

    expect(
      events.filter((event) => event.type === RaceEventType.SectorYellow),
    ).toHaveLength(2);
    expect(
      events.filter((event) => event.type === RaceEventType.SectorClear),
    ).toHaveLength(1);
  });

  it("다른 섹터의 동일 상태는 각각 발행한다", () => {
    const events = eventsFromRaceControl([
      { date: at(1), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 7", sector: 7 },
      { date: at(2), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 8", sector: 8 },
    ]);

    expect(
      events.filter((event) => event.type === RaceEventType.SectorYellow),
    ).toHaveLength(2);
  });

  it("동일 DRS 상태 연속 입력은 1건만 만든다", () => {
    const events = eventsFromRaceControl([
      { date: at(1), category: "Other", flag: null, scope: null, message: "OVERTAKE ENABLED" },
      { date: at(2), category: "Other", flag: null, scope: null, message: "OVERTAKE ENABLED" },
      { date: at(3), category: "Other", flag: null, scope: null, message: "OVERTAKE DISABLED" },
    ]);

    expect(
      events.filter((event) => event.type === RaceEventType.DrsEnabled),
    ).toHaveLength(1);
    expect(
      events.filter((event) => event.type === RaceEventType.DrsDisabled),
    ).toHaveLength(1);
  });

  // 상태 전이 dedup 은 시간 순서에 전적으로 의존한다. 응답이 뒤섞여 와도
  // 정렬 후 소비해야 옐로/클리어 쌍이 뒤집히지 않는다.
  it("응답 순서가 뒤섞여 있어도 시각 기준으로 정렬해 소비한다", () => {
    const shuffled = eventsFromRaceControl([
      { date: at(3), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 7", sector: 7 },
      { date: at(1), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 7", sector: 7 },
      { date: at(2), category: "Flag", flag: "CLEAR", scope: "Sector", message: "CLEAR IN TRACK SECTOR 7", sector: 7 },
    ]);
    const ordered = eventsFromRaceControl([
      { date: at(1), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 7", sector: 7 },
      { date: at(2), category: "Flag", flag: "CLEAR", scope: "Sector", message: "CLEAR IN TRACK SECTOR 7", sector: 7 },
      { date: at(3), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 7", sector: 7 },
    ]);

    expect(typesOf(shuffled)).toEqual(typesOf(ordered));
    expect(typesOf(shuffled)).toEqual([
      RaceEventType.SectorYellow,
      RaceEventType.SectorClear,
      RaceEventType.SectorYellow,
    ]);
  });

  // sector 가 null 이면 어느 섹터인지 모른다. 한 버킷에 합치면 서로를 억제한다.
  it("sector 가 null 인 옐로는 서로를 억제하지 않는다", () => {
    const events = eventsFromRaceControl([
      { date: at(1), category: "Flag", flag: "YELLOW", scope: "Sector", message: "YELLOW", sector: null },
      { date: at(2), category: "Flag", flag: "YELLOW", scope: "Sector", message: "YELLOW", sector: null },
    ]);

    expect(
      events.filter((event) => event.type === RaceEventType.SectorYellow),
    ).toHaveLength(2);
  });

  // 같은 코너에서 한참 뒤 재발생한 리커버리 차량이 영구히 억제되면 안 된다.
  it("트랙 클리어 이후 같은 코너의 위험물을 다시 발행한다", () => {
    const events = eventsFromRaceControl([
      { date: at(10), category: "Other", flag: null, scope: null, message: "RECOVERY VEHICLE ON TRACK AT TURN 6" },
      { date: at(20), category: "Flag", flag: "CLEAR", scope: "Track", message: "TRACK CLEAR" },
      { date: at(1800), category: "Other", flag: null, scope: null, message: "RECOVERY VEHICLE ON TRACK AT TURN 6" },
    ]);

    expect(
      events.filter((event) => event.type === RaceEventType.TrackHazard),
    ).toHaveLength(2);
  });

  it("랩이 바뀌면 같은 코너의 위험물을 다시 발행한다", () => {
    const events = eventsFromRaceControl([
      { date: at(10), category: "Other", flag: null, scope: null, message: "RECOVERY VEHICLE ON TRACK AT TURN 6", lap_number: 12 },
      { date: at(20), category: "Other", flag: null, scope: null, message: "RECOVERY VEHICLE ON TRACK AT TURN 6", lap_number: 12 },
      { date: at(1800), category: "Other", flag: null, scope: null, message: "RECOVERY VEHICLE ON TRACK AT TURN 6", lap_number: 30 },
    ]);

    expect(
      events.filter((event) => event.type === RaceEventType.TrackHazard),
    ).toHaveLength(2);
  });

  it("이벤트 id 와 deduplicationKey 가 서로 다른 이벤트끼리 충돌하지 않는다", () => {
    const events = eventsFromRaceControl([
      { date: at(1), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "SECTOR 7", sector: 7 },
      { date: at(2), category: "Flag", flag: "CLEAR", scope: "Sector", message: "SECTOR 7", sector: 7 },
      { date: at(3), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "SECTOR 7", sector: 7 },
    ]);
    const keys = new Set(events.map((event) => event.deduplicationKey));

    expect(keys.size).toBe(events.length);
  });
});

describe("session_result 기반 리타이어", () => {
  it("dnf/dns/dsq 가 각각 Retirement 를 만든다", () => {
    const data = makeData({
      laps: [
        { driver_number: 44, lap_number: 10, date_start: at(600), lap_duration: 95 },
      ],
      sessionResults: [
        { driver_number: 1, position: 1, number_of_laps: 44, points: 25, duration: 5082, gap_to_leader: 0, dnf: false, dns: false, dsq: false },
        { driver_number: 44, position: 18, number_of_laps: 10, points: 0, duration: null, gap_to_leader: null, dnf: true, dns: false, dsq: false },
        { driver_number: 63, position: 19, number_of_laps: 0, points: 0, duration: null, gap_to_leader: null, dnf: false, dns: true, dsq: false },
        { driver_number: 23, position: 20, number_of_laps: 44, points: 0, duration: null, gap_to_leader: null, dnf: false, dns: false, dsq: true },
      ],
    });
    const events = buildEvents(data, T0, END).map((timed) => timed.event);
    const retirements = events.filter(
      (event) => event.type === RaceEventType.Retirement,
    );

    expect(retirements).toHaveLength(3);
    expect(retirements.every((event) => event.priority === RaceEventPriority.High)).toBe(true);

    const byDriver = new Map(
      retirements.map((event) => [event.driverNumber, event]),
    );

    expect(byDriver.get(44)?.params.reason).toBe(RetirementReason.Dnf);
    expect(byDriver.get(44)?.params.driverCode).toBe("HAM");
    expect(byDriver.get(63)?.params.reason).toBe(RetirementReason.Dns);
    expect(byDriver.get(23)?.params.reason).toBe(RetirementReason.Dsq);
  });

  it("sessionResults 가 없어도 동작한다", () => {
    const run = (): RaceEvent[] =>
      buildEvents(
        makeData({
          raceControl: [
            { date: at(1), category: "Flag", flag: "GREEN", scope: "Track", message: "GREEN" },
          ],
        }),
        T0,
        END,
      ).map((timed) => timed.event);

    expect(run).not.toThrow();
    expect(typesOf(run())).not.toContain(RaceEventType.Retirement);
  });
});

describe("재활용 이벤트", () => {
  it("드라이버별 자기 최속 갱신 시 PersonalBestLap 을 만든다", () => {
    const data = makeData({
      laps: [
        { driver_number: 1, lap_number: 1, date_start: at(0), lap_duration: 95 },
        { driver_number: 1, lap_number: 2, date_start: at(95), lap_duration: 94 },
        { driver_number: 1, lap_number: 3, date_start: at(190), lap_duration: 96 },
        { driver_number: 44, lap_number: 1, date_start: at(0), lap_duration: 93 },
      ],
    });
    const events = buildEvents(data, T0, END).map((timed) => timed.event);
    const personalBests = events.filter(
      (event) => event.type === RaceEventType.PersonalBestLap,
    );

    // 첫 랩은 기준선이므로 이벤트가 아니고, 2랩(94s)만 갱신이다.
    expect(personalBests).toHaveLength(1);
    expect(personalBests[0]?.driverNumber).toBe(1);
    expect(personalBests[0]?.priority).toBe(RaceEventPriority.Low);
    expect(personalBests[0]?.params.lapTimeSeconds).toBe(94);
  });

  it("드라이버당 PersonalBestLap 개수를 상한으로 제한한다", () => {
    // 매 랩 갱신하므로 상한이 없으면 19건이 나온다.
    const laps = Array.from({ length: 20 }, (_, index) => ({
      driver_number: 1,
      lap_number: index + 1,
      date_start: at(index * 100),
      lap_duration: 120 - index,
    }));
    const events = buildEvents(makeData({ laps }), T0, END).map(
      (timed) => timed.event,
    );
    const personalBests = events.filter(
      (event) => event.type === RaceEventType.PersonalBestLap,
    );

    expect(personalBests).toHaveLength(3);
    // 상한을 넘긴 초과분 중 남는 것은 가장 최근 3건이다.
    expect(personalBests.map((event) => event.params.lapTimeSeconds)).toEqual([
      103, 102, 101,
    ]);
  });

  it("팀 라디오가 TeamRadioPosted 를 만든다", () => {
    const data = makeData({
      teamRadio: [
        { date: at(50), driver_number: 1, recording_url: "https://example.com/ver.mp3" },
      ],
    });
    const events = buildEvents(data, T0, END).map((timed) => timed.event);
    const radio = findEvent(events, RaceEventType.TeamRadioPosted);

    expect(radio?.priority).toBe(RaceEventPriority.Low);
    expect(radio?.params.driverCode).toBe("VER");
    expect(radio?.params.recordingUrl).toBe("https://example.com/ver.mp3");
  });

  it("간격이 1.0초 미만으로 진입할 때 GapClosing 을 만든다", () => {
    const data = makeData({
      intervals: [
        { date: at(10), driver_number: 44, gap_to_leader: 2.5, interval: 2.5 },
        { date: at(20), driver_number: 44, gap_to_leader: 0.9, interval: 0.9 },
        { date: at(30), driver_number: 44, gap_to_leader: 0.8, interval: 0.8 },
        { date: at(40), driver_number: 63, gap_to_leader: 5, interval: 3 },
      ],
    });
    const events = buildEvents(data, T0, END).map((timed) => timed.event);
    const gapClosing = events.filter(
      (event) => event.type === RaceEventType.GapClosing,
    );

    expect(gapClosing).toHaveLength(1);
    expect(gapClosing[0]?.priority).toBe(RaceEventPriority.Medium);
    expect(gapClosing[0]?.driverNumber).toBe(44);
    expect(gapClosing[0]?.params.gapSeconds).toBe(0.9);
  });

  it("동일 드라이버의 잦은 진입은 쿨다운으로 억제한다", () => {
    const intervals = Array.from({ length: 40 }, (_, index) => ({
      date: at(index * 10),
      driver_number: 44,
      gap_to_leader: 1,
      // 0.5 초와 1.5 초를 번갈아 오가며 반복 진입시킨다.
      interval: index % 2 === 0 ? 1.5 : 0.5,
    }));
    const events = buildEvents(makeData({ intervals }), T0, END).map(
      (timed) => timed.event,
    );
    const gapClosing = events.filter(
      (event) => event.type === RaceEventType.GapClosing,
    );

    // 쿨다운(60초)으로 7건까지 줄고, 드라이버당 상한 5건으로 다시 잘린다.
    expect(gapClosing).toHaveLength(5);
  });

  it("GapClosing 에 앞차 코드를 담는다", () => {
    const data = makeData({
      positions: [
        { date: at(5), driver_number: 1, position: 1 },
        { date: at(5), driver_number: 44, position: 2 },
      ],
      intervals: [
        { date: at(10), driver_number: 44, gap_to_leader: 2.5, interval: 2.5 },
        { date: at(20), driver_number: 44, gap_to_leader: 0.9, interval: 0.9 },
      ],
    });
    const events = buildEvents(data, T0, END).map((timed) => timed.event);
    const gapClosing = findEvent(events, RaceEventType.GapClosing);

    expect(gapClosing?.params.aheadDriverCode).toBe("VER");
    expect(gapClosing?.params.gapSeconds).toBe(0.9);
  });

  it("앞차를 특정할 수 없으면 aheadDriverCode 를 담지 않는다", () => {
    const data = makeData({
      intervals: [
        { date: at(10), driver_number: 44, gap_to_leader: 2.5, interval: 2.5 },
        { date: at(20), driver_number: 44, gap_to_leader: 0.9, interval: 0.9 },
      ],
    });
    const events = buildEvents(data, T0, END).map((timed) => timed.event);
    const gapClosing = findEvent(events, RaceEventType.GapClosing);

    expect(gapClosing).toBeDefined();
    expect(gapClosing?.params.aheadDriverCode).toBeUndefined();
  });

  // DRS 활성 구간의 1.0초 미만 진입은 DrsRangeEntered 로만 발행한다
  // (GapClosing 과 동시에 발행하면 같은 순간이 피드에 두 번 뜬다).
  it("DRS 활성 구간의 진입은 DrsRangeEntered 로 발행한다", () => {
    const data = makeData({
      raceControl: [
        { date: at(5), category: "Other", flag: null, scope: null, message: "OVERTAKE ENABLED" },
      ],
      positions: [
        { date: at(5), driver_number: 1, position: 1 },
        { date: at(5), driver_number: 44, position: 2 },
      ],
      intervals: [
        { date: at(10), driver_number: 44, gap_to_leader: 2.5, interval: 2.5 },
        { date: at(20), driver_number: 44, gap_to_leader: 0.6, interval: 0.6 },
      ],
    });
    const events = buildEvents(data, T0, END).map((timed) => timed.event);
    const drsRange = findEvent(events, RaceEventType.DrsRangeEntered);

    expect(drsRange?.priority).toBe(RaceEventPriority.Medium);
    expect(drsRange?.driverNumber).toBe(44);
    expect(drsRange?.params.gapSeconds).toBe(0.6);
    expect(drsRange?.params.aheadDriverCode).toBe("VER");
    expect(drsRange?.params.targetDriverCode).toBe("VER");
    expect(drsRange?.targetDriverNumber).toBe(1);
    // 같은 진입이 GapClosing 으로 중복 발행되지 않는다.
    expect(typesOf(events)).not.toContain(RaceEventType.GapClosing);
  });

  it("DRS 비활성 구간의 진입은 GapClosing 으로만 발행한다", () => {
    const data = makeData({
      raceControl: [
        { date: at(5), category: "Other", flag: null, scope: null, message: "OVERTAKE ENABLED" },
        { date: at(15), category: "Other", flag: null, scope: null, message: "OVERTAKE DISABLED" },
      ],
      intervals: [
        { date: at(10), driver_number: 44, gap_to_leader: 2.5, interval: 2.5 },
        { date: at(20), driver_number: 44, gap_to_leader: 0.6, interval: 0.6 },
      ],
    });
    const types = typesOf(buildEvents(data, T0, END).map((timed) => timed.event));

    expect(types).toContain(RaceEventType.GapClosing);
    expect(types).not.toContain(RaceEventType.DrsRangeEntered);
  });

  it("SC 전개 중에는 DrsRangeEntered 를 만들지 않는다", () => {
    const data = makeData({
      raceControl: [
        { date: at(5), category: "Other", flag: null, scope: null, message: "OVERTAKE ENABLED" },
        { date: at(15), category: "SafetyCar", flag: null, scope: "Track", message: "SAFETY CAR DEPLOYED" },
      ],
      intervals: [
        { date: at(10), driver_number: 44, gap_to_leader: 2.5, interval: 2.5 },
        { date: at(20), driver_number: 44, gap_to_leader: 0.6, interval: 0.6 },
      ],
    });
    const types = typesOf(buildEvents(data, T0, END).map((timed) => timed.event));

    expect(types).not.toContain(RaceEventType.DrsRangeEntered);
    expect(types).toContain(RaceEventType.GapClosing);
  });

  // 필드 과반과 다른 컴파운드를 고른 피트 스틴트만 StrategyNote 로 본다.
  it("필드 과반과 다른 컴파운드를 고르면 StrategyNote 를 만든다", () => {
    const data = makeData({
      laps: [{ driver_number: 44, lap_number: 20, date_start: at(1200), lap_duration: 95 }],
      stints: [
        { driver_number: 1, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 63, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 23, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 44, lap_start: 1, lap_end: 19, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 44, lap_start: 20, lap_end: 40, compound: "SOFT", tyre_age_at_start: 0 },
      ],
    });
    const events = buildEvents(data, T0, END).map((timed) => timed.event);
    const note = findEvent(events, RaceEventType.StrategyNote);

    expect(note?.priority).toBe(RaceEventPriority.Medium);
    expect(note?.driverNumber).toBe(44);
    expect(note?.lapNumber).toBe(20);
    expect(note?.params.driverCode).toBe("HAM");
    expect(note?.params.compound).toBe("SOFT");
    expect(note?.params.fieldCompound).toBe("MEDIUM");
  });

  it("필드와 같은 컴파운드를 고르면 StrategyNote 를 만들지 않는다", () => {
    const data = makeData({
      laps: [{ driver_number: 44, lap_number: 20, date_start: at(1200), lap_duration: 95 }],
      stints: [
        { driver_number: 1, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 63, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 23, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 44, lap_start: 20, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
      ],
    });
    const types = typesOf(buildEvents(data, T0, END).map((timed) => timed.event));

    expect(types).not.toContain(RaceEventType.StrategyNote);
  });

  it("출발 스틴트(lap_start=1)는 StrategyNote 로 보지 않는다", () => {
    const data = makeData({
      laps: [{ driver_number: 44, lap_number: 1, date_start: at(0), lap_duration: 95 }],
      stints: [
        { driver_number: 1, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 63, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 23, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 44, lap_start: 1, lap_end: 40, compound: "SOFT", tyre_age_at_start: 0 },
      ],
    });
    const types = typesOf(buildEvents(data, T0, END).map((timed) => timed.event));

    expect(types).not.toContain(RaceEventType.StrategyNote);
  });

  it("드라이버당 StrategyNote 개수를 상한으로 제한한다", () => {
    const pitLaps = [5, 10, 15, 20, 25];
    const data = makeData({
      laps: pitLaps.map((lap) => ({
        driver_number: 44,
        lap_number: lap,
        date_start: at(lap * 60),
        lap_duration: 95,
      })),
      stints: [
        { driver_number: 1, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 63, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        { driver_number: 23, lap_start: 1, lap_end: 40, compound: "MEDIUM", tyre_age_at_start: 0 },
        ...pitLaps.map((lap) => ({
          driver_number: 44,
          lap_start: lap,
          lap_end: lap + 4,
          compound: "SOFT",
          tyre_age_at_start: 0,
        })),
      ],
    });
    const notes = buildEvents(data, T0, END)
      .map((timed) => timed.event)
      .filter((event) => event.type === RaceEventType.StrategyNote);

    expect(notes).toHaveLength(3);
    // 남는 것은 가장 최근 3건이다.
    expect(notes.map((event) => event.lapNumber)).toEqual([15, 20, 25]);
  });

  it("범위 밖 이벤트 타입은 만들지 않는다", () => {
    const data = makeData({
      intervals: [
        { date: at(10), driver_number: 44, gap_to_leader: 2.5, interval: 2.5 },
        { date: at(20), driver_number: 44, gap_to_leader: 0.5, interval: 0.5 },
      ],
      positions: [
        { date: at(10), driver_number: 44, position: 2 },
        { date: at(20), driver_number: 44, position: 1 },
      ],
      stints: [
        { driver_number: 44, lap_start: 1, lap_end: 20, compound: "SOFT", tyre_age_at_start: 0 },
      ],
    });
    const types = typesOf(buildEvents(data, T0, END).map((timed) => timed.event));

    expect(types).not.toContain(RaceEventType.PositionChange);
    expect(types).not.toContain(RaceEventType.GapIncreasing);
  });
});

describe("params 계약", () => {
  it("발행된 모든 이벤트의 params 값이 원시 타입이다", () => {
    const data = makeData({
      raceControl: [
        { date: at(1), category: "SessionStatus", flag: null, scope: null, message: "SESSION STARTED" },
        { date: at(2), category: "Flag", flag: "GREEN", scope: "Track", message: "GREEN LIGHT" },
        { date: at(3), category: "Flag", flag: "BLUE", scope: "Driver", message: "BLUE FLAG FOR CAR 23 (ALB)", driver_number: 23, lap_number: 3 },
        { date: at(4), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", message: "DOUBLE YELLOW IN TRACK SECTOR 7", sector: 7 },
        { date: at(5), category: "Flag", flag: "CLEAR", scope: "Sector", message: "CLEAR IN TRACK SECTOR 7", sector: 7 },
        { date: at(6), category: "SafetyCar", flag: null, scope: "Track", message: "SAFETY CAR DEPLOYED" },
        { date: at(7), category: "Other", flag: null, scope: null, message: "TURN 6 INCIDENT INVOLVING CARS 44 (HAM) AND 63 (RUS) NOTED - CAUSING A COLLISION (15:04:29)" },
        { date: at(8), category: "Other", flag: null, scope: null, message: "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 23 (ALB) - CAUSING A COLLISION" },
        { date: at(9), category: "Other", flag: null, scope: null, message: "RECOVERY VEHICLE ON TRACK AT TURN 6" },
        { date: at(10), category: "Other", flag: null, scope: null, message: "RISK OF RAIN FOR THE F1 RACE IS 10%" },
        { date: at(11), category: "Flag", flag: "CHEQUERED", scope: "Track", message: "CHEQUERED FLAG" },
      ],
      pits: [{ date: at(30), driver_number: 44, lap_number: 5, pit_duration: 24 }],
      stints: [
        { driver_number: 44, lap_start: 1, lap_end: 20, compound: "SOFT", tyre_age_at_start: 0 },
      ],
      laps: [
        { driver_number: 1, lap_number: 1, date_start: at(0), lap_duration: 95 },
        { driver_number: 1, lap_number: 2, date_start: at(95), lap_duration: 94 },
      ],
      intervals: [
        { date: at(10), driver_number: 44, gap_to_leader: 2.5, interval: 2.5 },
        { date: at(20), driver_number: 44, gap_to_leader: 0.5, interval: 0.5 },
      ],
      overtakes: [
        { date: at(40), position: 1, overtaking_driver_number: 44, overtaken_driver_number: 1 },
      ],
      teamRadio: [
        { date: at(50), driver_number: 1, recording_url: "https://example.com/ver.mp3" },
      ],
      sessionResults: [
        { driver_number: 63, position: 20, number_of_laps: 3, points: 0, duration: null, gap_to_leader: null, dnf: true, dns: false, dsq: false },
      ],
    });
    const events = buildEvents(data, T0, END).map((timed) => timed.event);

    // 어떤 타입이 나오는지를 통째로 고정한다(단순 개수 하한은 사실상 실패하지 않는다).
    expect([...typesOf(events)].sort()).toEqual([
      RaceEventType.BlueFlag,
      RaceEventType.ChequeredFlag,
      RaceEventType.FastestLap,
      RaceEventType.GapClosing,
      RaceEventType.GreenFlag,
      RaceEventType.Investigation,
      RaceEventType.Overtake,
      RaceEventType.Penalty,
      RaceEventType.PersonalBestLap,
      RaceEventType.PitStop,
      RaceEventType.RainRisk,
      RaceEventType.Retirement,
      RaceEventType.SafetyCar,
      RaceEventType.SectorClear,
      RaceEventType.SectorYellow,
      RaceEventType.SessionFinished,
      RaceEventType.SessionStarted,
      RaceEventType.TeamRadioPosted,
      RaceEventType.TrackHazard,
    ].sort());

    for (const event of events) {
      for (const value of Object.values(event.params)) {
        const kind = value === null ? "null" : typeof value;

        expect(["string", "number", "boolean", "null"]).toContain(kind);
      }
    }
  });

  it("이벤트는 시간 순으로 정렬된다", () => {
    const timed = buildEvents(
      makeData({
        raceControl: [
          { date: at(30), category: "Other", flag: null, scope: null, message: "OVERTAKE ENABLED" },
          { date: at(10), category: "Flag", flag: "GREEN", scope: "Track", message: "GREEN" },
          { date: at(20), category: "Other", flag: null, scope: null, message: "PIT EXIT CLOSED" },
        ],
      }),
      T0,
      END,
    );
    const seconds = timed.map((entry) => entry.atSecond);

    expect(seconds).toEqual([...seconds].sort((a, b) => a - b));
  });

  it("시간 창 밖의 이벤트는 제외한다", () => {
    const events = buildEvents(
      makeData({
        raceControl: [
          { date: at(-100), category: "Flag", flag: "GREEN", scope: "Track", message: "GREEN" },
          { date: at(10), category: "Other", flag: null, scope: null, message: "OVERTAKE ENABLED" },
        ],
      }),
      T0,
      T0 + 20_000,
    ).map((timed) => timed.event);

    expect(typesOf(events)).toEqual([RaceEventType.DrsEnabled]);
  });
});
