import { describe, expect, it } from "vitest";
import { toSessionId } from "../src/openf1/OpenF1Client";
import { buildRaceControlEvents } from "../src/openf1/OpenF1RaceControlEvents";
import { buildOpenF1LiveFrame } from "../src/openf1/OpenF1Recording";
import { mapCompound } from "../src/openf1/OpenF1Normalizer";
import { buildOverrideWindow } from "../src/openf1/OpenF1OverrideWindow";
import { classifySafetyCarMessage } from "../src/openf1/OpenF1SafetyCarClassification";
import {
  OpenF1RaceControl,
  OpenF1SessionData,
  OpenF1Session,
} from "../src/openf1/OpenF1Types";
import { RaceEventType } from "../src/RaceEventType";
import { scheduledRaceLaps } from "../src/openf1/RaceLapCounts";
import { TireCompound } from "../src/TireCompound";

// 외부 API 경계 null 방어 회귀.
//
// 왜: 헝가리 GP 라이브 중(랩 40, 14:00:52 폴링 성공 직후) OpenF1 stints 응답에
//     compound 가 null 인 행이 섞여 들어왔다.
//       {"driver_number":1,"stint_number":3,"lap_start":40,"lap_end":56,"compound":null}
//     VER 이 랩 40 에 피트인했는데 컴파운드가 아직 확정되지 않은 상태로 온 것이다.
//     mapCompound 가 compound.toUpperCase() 를 부르며
//     "Cannot read properties of null (reading 'toUpperCase')" 로 터졌고,
//     워커가 매 폴링마다 같은 자리에서 죽어 화면이 랩 40 에서 랩 70(레이스 종료)까지
//     약 30 분간 얼어붙었다.
//
//     타입은 `compound: string`(non-null)이었지만 실제 계약은 nullable 이다.
//     같은 "타입은 required 인데 API 는 null 을 준다" 계열 결함을 한 파일에서 막는다.
//
// 경계의 규칙은 "던지지 않는다"가 아니라 **"스냅샷 스키마를 만족하는 값을 만든다"** 다.
// 빈 문자열 폴백은 z.string().min(1) 에서 그대로 실패해 크래시를 워커에서 클라이언트로
// 옮길 뿐이다. 스키마 통과 여부 자체를 거는 단언은 zod 를 쓸 수 있는
// packages/schemas/test/OpenF1SnapshotBoundary.test.ts 에 있다
// (@f1/schemas 가 @f1/domain 에 의존하므로 반대 방향 import 는 순환이 된다).

const T0 = Date.parse("2026-07-22T13:00:00.000Z");
const at = (seconds: number): string =>
  new Date(T0 + seconds * 1000).toISOString();

// 어제 실측 상황을 축소 재현한 세션 데이터.
// VER(1) 의 두 번째 스틴트가 랩 40 에서 시작하는데 compound 가 null 이다.
// 55 번은 drivers 행의 문자열 필드가 통째로 비어 온 경우다.
const hungaryLikeData = (): OpenF1SessionData => ({
  meta: {
    sessionId: "2026-hun-race",
    sessionKey: 9999,
    meetingKey: 8888,
    sessionName: "Hungarian Grand Prix — Race",
    sessionType: "Race",
    circuitName: "Hungaroring",
    countryCode: "HUN",
  },
  drivers: [
    {
      driver_number: 1,
      name_acronym: "VER",
      full_name: "Max Verstappen",
      team_name: "Red Bull Racing",
    },
    {
      driver_number: 44,
      name_acronym: "HAM",
      full_name: "Lewis Hamilton",
      team_name: "Mercedes",
    },
    {
      driver_number: 55,
      name_acronym: null,
      full_name: null,
      team_name: null,
    },
  ],
  positions: [
    { date: at(0), driver_number: 1, position: 1 },
    { date: at(0), driver_number: 44, position: 2 },
    { date: at(0), driver_number: 55, position: 3 },
  ],
  intervals: [
    { date: at(0), driver_number: 1, gap_to_leader: 0, interval: 0 },
    { date: at(0), driver_number: 44, gap_to_leader: 2.4, interval: 2.4 },
    { date: at(0), driver_number: 55, gap_to_leader: 5.2, interval: 2.8 },
  ],
  stints: [
    {
      driver_number: 1,
      lap_start: 1,
      lap_end: 39,
      compound: "MEDIUM",
      tyre_age_at_start: 0,
    },
    // 실측 크래시 행: 피트인 직후 컴파운드 미확정.
    {
      driver_number: 1,
      lap_start: 40,
      lap_end: 56,
      compound: null,
      tyre_age_at_start: 0,
    },
    {
      driver_number: 44,
      lap_start: 1,
      lap_end: 56,
      compound: "HARD",
      tyre_age_at_start: 0,
    },
    {
      driver_number: 55,
      lap_start: 1,
      lap_end: 56,
      compound: "SOFT",
      tyre_age_at_start: 0,
    },
  ],
  laps: [
    { driver_number: 1, lap_number: 39, date_start: at(0), lap_duration: 80 },
    { driver_number: 1, lap_number: 40, date_start: at(80), lap_duration: 95 },
    { driver_number: 44, lap_number: 39, date_start: at(0), lap_duration: 80.5 },
    { driver_number: 44, lap_number: 40, date_start: at(80), lap_duration: 80.2 },
    { driver_number: 55, lap_number: 39, date_start: at(0), lap_duration: 79.8 },
    { driver_number: 55, lap_number: 40, date_start: at(80), lap_duration: 79.9 },
  ],
  pits: [{ date: at(80), driver_number: 1, lap_number: 40, pit_duration: 22 }],
  raceControl: [
    {
      date: at(0),
      category: "Flag",
      flag: "GREEN",
      scope: "Track",
      message: "GREEN LIGHT - PIT EXIT OPEN",
    },
  ],
  teamRadio: [
    // 클립 파일이 아직 없는 행 — 스냅샷 스키마의 z.string().url() 을 만족할 수 없다.
    { date: at(30), driver_number: 44, recording_url: null },
    {
      date: at(40),
      driver_number: 55,
      recording_url: "https://livetiming.example/55.mp3",
    },
  ],
});

// StrategyNote 는 "필드 과반과 다른 컴파운드"일 때만 발행되므로 표본이 3 이상 필요하다.
// 44 / 4 / 16 / 63 을 HARD 로 채워 과반을 만든 뒤, VER(1) 의 랩 40 스틴트만 흔든다.
const strategyFieldData = (
  verLap40Compound: string | null,
): OpenF1SessionData => {
  const data = hungaryLikeData();
  const fieldDrivers = [4, 16, 63];

  data.stints = data.stints.map((stint) =>
    stint.driver_number === 1 && stint.lap_start === 40
      ? { ...stint, compound: verLap40Compound }
      : stint,
  );

  for (const number of fieldDrivers) {
    data.drivers.push({
      driver_number: number,
      name_acronym: `D${number}`,
      full_name: `Driver ${number}`,
      team_name: "Field Team",
    });
    data.stints.push({
      driver_number: number,
      lap_start: 1,
      lap_end: 56,
      compound: "HARD",
      tyre_age_at_start: 0,
    });
    data.laps.push({
      driver_number: number,
      lap_number: 40,
      date_start: at(80),
      lap_duration: 81,
    });
  }

  // 44 도 HARD 라 HARD 4 : SOFT 1 로 과반이 선다.
  return data;
};

const eventsOf = (data: OpenF1SessionData) =>
  buildOpenF1LiveFrame(data, { startMs: T0, nowMs: T0 + 120_000 }).events;

const snapshotOf = (data: OpenF1SessionData) =>
  buildOpenF1LiveFrame(data, { startMs: T0, nowMs: T0 + 120_000 }).snapshot;

describe("mapCompound", () => {
  it("기존 컴파운드 매핑은 그대로다", () => {
    expect(mapCompound("SOFT")).toBe(TireCompound.Soft);
    expect(mapCompound("medium")).toBe(TireCompound.Medium);
    expect(mapCompound("HARD")).toBe(TireCompound.Hard);
    expect(mapCompound("INTERMEDIATE")).toBe(TireCompound.Intermediate);
    expect(mapCompound("wet")).toBe(TireCompound.Wet);
    expect(mapCompound("???")).toBe(TireCompound.Unknown);
  });

  it("null / undefined / 빈 문자열이면 Unknown 을 돌려주고 던지지 않는다", () => {
    // 실측: 헝가리 GP 랩 40 스틴트의 compound 가 null 로 왔다.
    expect(() => mapCompound(null)).not.toThrow();
    expect(mapCompound(null)).toBe(TireCompound.Unknown);
    expect(mapCompound(undefined)).toBe(TireCompound.Unknown);
    expect(mapCompound("")).toBe(TireCompound.Unknown);
    expect(mapCompound("   ")).toBe(TireCompound.Unknown);
  });
});

describe("compound null 스틴트가 섞인 라이브 프레임", () => {
  it("예외 없이 스냅샷을 만든다 (헝가리 GP 랩 40 실측 회귀)", () => {
    const data = hungaryLikeData();

    expect(() =>
      buildOpenF1LiveFrame(data, { startMs: T0, nowMs: T0 + 120_000 }),
    ).not.toThrow();
  });

  it("compound 가 null 인 스틴트를 Unknown 으로 담는다", () => {
    const snapshot = snapshotOf(hungaryLikeData());
    const ver = snapshot.drivers.find((driver) => driver.driverNumber === 1);
    const ham = snapshot.drivers.find((driver) => driver.driverNumber === 44);

    expect(ver?.compound).toBe(TireCompound.Unknown);
    expect(ham?.compound).toBe(TireCompound.Hard);
  });

  it("컨텍스트 요약의 직전 컴파운드도 예외 없이 채운다", () => {
    const snapshot = snapshotOf(hungaryLikeData());
    const stint = snapshot.contextSummary?.stints.find(
      (entry) => entry.driverNumber === 1,
    );

    expect(stint?.stintCount).toBe(2);
    expect(stint?.previousCompound).toBe(TireCompound.Medium);
  });
});

describe("race_control message 가 null 인 행", () => {
  // 캐스팅하지 않는다. `null as unknown as string` 을 쓰면 OpenF1RaceControl.message 를
  // 다시 `string` 으로 좁혀도 컴파일이 통과해, 타입을 넓힌 의미가 사라진다.
  const nullMessageRow: OpenF1RaceControl = {
    date: at(10),
    category: "SafetyCar",
    flag: null,
    scope: null,
    message: null,
  };

  it("classifySafetyCarMessage 가 던지지 않고 null 을 돌려준다", () => {
    expect(() => classifySafetyCarMessage(null)).not.toThrow();
    expect(classifySafetyCarMessage(null)).toBeNull();
    expect(classifySafetyCarMessage(undefined)).toBeNull();
  });

  it("buildRaceControlEvents 가 null 메시지를 건너뛰고 나머지를 만든다", () => {
    const messages = [
      nullMessageRow,
      {
        date: at(20),
        category: "SafetyCar",
        flag: null,
        scope: "Track",
        message: "SAFETY CAR DEPLOYED",
      },
    ];

    expect(() =>
      buildRaceControlEvents("2026-hun-race", messages, new Map()),
    ).not.toThrow();

    const events = buildRaceControlEvents(
      "2026-hun-race",
      messages,
      new Map(),
    );

    expect(events.length).toBeGreaterThan(0);
  });

  it("buildOverrideWindow 가 null 메시지에도 죽지 않는다", () => {
    expect(() => buildOverrideWindow([nullMessageRow])).not.toThrow();
  });

  it("null 메시지가 섞여도 라이브 프레임 생성이 죽지 않는다", () => {
    const data = hungaryLikeData();

    data.raceControl.push(nullMessageRow);

    expect(() =>
      buildOpenF1LiveFrame(data, { startMs: T0, nowMs: T0 + 120_000 }),
    ).not.toThrow();
  });
});

describe("세션 메타 문자열이 null 인 행", () => {
  const session = (overrides: Record<string, unknown>): OpenF1Session =>
    ({
      session_key: 1,
      meeting_key: 2,
      session_name: "Race",
      session_type: "Race",
      circuit_short_name: "Hungaroring",
      country_code: "HUN",
      year: 2026,
      ...overrides,
      // OpenF1Session 은 아직 이 필드들을 non-null 로 선언한다. 타입을 넓히면
      // toOpenF1SessionMeta / ArchiveSessionSelector 의 sessionName·circuitName·
      // countryCode 폴백까지 함께 정해야 해서 이번 수정 범위 밖이다.
      // 여기서는 "런타임에 null 이 온다"는 사실만 재현한다.
    }) as unknown as OpenF1Session;

  it("scheduledRaceLaps 가 null 서킷·세션 타입에도 죽지 않는다", () => {
    expect(() => scheduledRaceLaps(null, null)).not.toThrow();
    expect(scheduledRaceLaps(null, null)).toBeNull();
    expect(scheduledRaceLaps("Hungaroring", null)).toBeNull();
    expect(scheduledRaceLaps(null, "Race")).toBeNull();
    // 정상 입력은 그대로 동작한다.
    expect(scheduledRaceLaps("Hungaroring", "Race")).toBe(70);
  });

  it("toSessionId 가 country_code / session_type null 에도 죽지 않는다", () => {
    const broken = session({ session_type: null, country_code: null });

    expect(() => toSessionId(broken)).not.toThrow();
    // 정상 세션의 id 형태는 바뀌지 않는다.
    expect(toSessionId(session({}))).toBe("2026-hun-race");
  });

  it("country_code 가 비어도 같은 해 두 세션이 같은 id 를 갖지 않는다", () => {
    // 이 문자열은 Firestore 문서 경로(sessions/{sessionId})이자 아카이브 id 다.
    // 예전 구현은 둘 다 "2026--race" 를 만들어 나중 세션이 앞 세션을 덮어썼다.
    const first = session({ session_key: 101, country_code: null });
    const second = session({ session_key: 202, country_code: null });

    expect(toSessionId(first)).not.toBe(toSessionId(second));
    expect(toSessionId(first)).toContain("101");
    expect(toSessionId(second)).toContain("202");
  });
});

describe("drivers 행 문자열이 null 인 경우", () => {
  it("buildOpenF1LiveFrame 이 예외 없이 스냅샷을 만든다", () => {
    const data = hungaryLikeData();

    expect(() =>
      buildOpenF1LiveFrame(data, { startMs: T0, nowMs: T0 + 120_000 }),
    ).not.toThrow();
  });

  it("code 폴백이 빈 문자열이 아니라 드라이버 번호다", () => {
    // 빈 문자열은 스냅샷 스키마의 z.string().min(1) 에서 그대로 터진다.
    // 즉 "빈 문자열이 크래시보다 낫다"가 아니라, 빈 문자열도 크래시다.
    const snapshot = snapshotOf(hungaryLikeData());
    const unknown = snapshot.drivers.find(
      (driver) => driver.driverNumber === 55,
    );

    expect(unknown?.code).toBe("55");
    expect(unknown?.code).not.toBe("");
  });

  it("full_name / team_name 이 null 이어도 빈 문자열을 내보내지 않는다", () => {
    const snapshot = snapshotOf(hungaryLikeData());
    const unknown = snapshot.drivers.find(
      (driver) => driver.driverNumber === 55,
    );

    expect(unknown?.fullName).toBe("55");
    expect(unknown?.teamName).toBe("Unknown");
  });

  it("정상 드라이버 code 는 그대로다 (회귀)", () => {
    const snapshot = snapshotOf(hungaryLikeData());
    const ver = snapshot.drivers.find((driver) => driver.driverNumber === 1);
    const ham = snapshot.drivers.find((driver) => driver.driverNumber === 44);

    expect(ver?.code).toBe("VER");
    expect(ham?.code).toBe("HAM");
  });

  it("팀 라디오 driverCode 도 번호로 떨어진다 (기존 폴백 복구)", () => {
    // 코드 맵에 ""(빈 문자열)를 담아 두면 `?? String(driver_number)` 이 nullish 가
    // 아니라서 도달하지 못한다. 수정 전 실측: "55" → "".
    const snapshot = snapshotOf(hungaryLikeData());
    const clip = snapshot.teamRadios?.find(
      (radio) => radio.driverNumber === 55,
    );

    expect(clip?.driverCode).toBe("55");
  });

  it("recording_url 이 없는 클립은 스냅샷에서 뺀다", () => {
    // 스키마가 z.string().url() 이라 대체할 값이 없다. 가짜 URL 을 넣으면 UI 가
    // 없는 파일을 재생하려 든다.
    const snapshot = snapshotOf(hungaryLikeData());

    expect(snapshot.teamRadios).toHaveLength(1);
    expect(
      snapshot.teamRadios?.some((radio) => radio.driverNumber === 44),
    ).toBe(false);
  });

  it("재생 불가 클립은 팀 라디오 이벤트로도 만들지 않는다", () => {
    const radioEvents = eventsOf(hungaryLikeData()).filter(
      (event) => event.type === RaceEventType.TeamRadioPosted,
    );

    expect(radioEvents).toHaveLength(1);
    expect(radioEvents[0]?.driverNumber).toBe(55);
  });
});

describe("컴파운드 미확정 이벤트는 발행을 미룬다", () => {
  // EventWriteCursor 는 deduplicationKey 기준 write-once 다. 미확정 상태로 한 번 쓰면
  // 다음 폴링에 값이 채워져도 다시 쓰이지 않아 "UNKNOWN 타이어로 피트인" 이 영구히 남는다.
  const pitEventsOf = (data: OpenF1SessionData) =>
    eventsOf(data).filter((event) => event.type === RaceEventType.PitStop);

  const strategyEventsOf = (data: OpenF1SessionData) =>
    eventsOf(data).filter((event) => event.type === RaceEventType.StrategyNote);

  it("compound 가 null 이면 PitStop 을 발행하지 않는다", () => {
    expect(pitEventsOf(hungaryLikeData())).toHaveLength(0);
  });

  it("다음 프레임에서 compound 가 채워지면 PitStop 을 발행한다", () => {
    const data = hungaryLikeData();

    data.stints = data.stints.map((stint) =>
      stint.driver_number === 1 && stint.lap_start === 40
        ? { ...stint, compound: "SOFT" }
        : stint,
    );

    const pits = pitEventsOf(data);

    expect(pits).toHaveLength(1);
    expect(pits[0]?.params.compound).toBe("SOFT");
    expect(pits[0]?.params.compound).not.toBe("UNKNOWN");
  });

  it("어떤 PitStop 이벤트도 UNKNOWN 컴파운드로 나가지 않는다", () => {
    const withNull = pitEventsOf(hungaryLikeData());
    const withValue = pitEventsOf(strategyFieldData("SOFT"));

    for (const event of [...withNull, ...withValue]) {
      expect(event.params.compound).not.toBe("UNKNOWN");
    }
  });

  it("compound 가 null 이면 StrategyNote 를 발행하지 않는다", () => {
    // 가드를 지우면 fieldCompound("HARD") !== null 이라 compound: null 인 노트가 나간다.
    const notes = strategyEventsOf(strategyFieldData(null));

    expect(notes).toHaveLength(0);
  });

  it("compound 가 채워지면 StrategyNote 를 발행한다 (가드가 과하지 않다)", () => {
    const notes = strategyEventsOf(strategyFieldData("SOFT"));

    expect(notes).toHaveLength(1);
    expect(notes[0]?.params.compound).toBe("SOFT");
    expect(notes[0]?.params.fieldCompound).toBe("HARD");
  });
});
