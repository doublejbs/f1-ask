import { describe, expect, it } from "vitest";
import { TireCompound } from "../src/TireCompound";
import { WeekendFormat } from "../src/tire/TireAllocation";
import {
  buildWeekendTireUsage,
  distinctCompounds,
  WeekendSessionKind,
} from "../src/tire/WeekendTires";
import {
  OpenF1Driver,
  OpenF1Session,
  OpenF1Stint,
} from "../src/openf1/OpenF1Types";

const session = (
  sessionKey: number,
  name: string,
  type: string,
  startIso: string,
): OpenF1Session => ({
  session_key: sessionKey,
  meeting_key: 100,
  session_name: name,
  session_type: type,
  circuit_short_name: "test",
  country_code: "TST",
  year: 2026,
  date_start: startIso,
});

const stint = (
  sessionKey: number,
  driverNumber: number,
  lapStart: number,
  compound: string | null,
  ageAtStart = 0,
): OpenF1Stint => ({
  session_key: sessionKey,
  driver_number: driverNumber,
  lap_start: lapStart,
  lap_end: lapStart + 5,
  compound,
  tyre_age_at_start: ageAtStart,
});

const driver = (driverNumber: number, code: string | null): OpenF1Driver => ({
  driver_number: driverNumber,
  name_acronym: code,
  full_name: code ? `${code} Driver` : null,
  team_name: "Team",
});

describe("buildWeekendTireUsage", () => {
  it("세션을 시간순으로 정렬하고 종류를 분류한다 (일반 주말)", () => {
    const usage = buildWeekendTireUsage(
      [
        session(3, "Qualifying", "Qualifying", "2026-08-22T14:00:00Z"),
        session(1, "Practice 1", "Practice", "2026-08-21T10:00:00Z"),
        session(4, "Race", "Race", "2026-08-23T13:00:00Z"),
        session(2, "Practice 2", "Practice", "2026-08-21T14:00:00Z"),
      ],
      [stint(1, 44, 1, "SOFT")],
      [driver(44, "HAM")],
    );

    expect(usage.format).toBe(WeekendFormat.Conventional);
    expect(usage.sessions.map((s) => s.sessionKey)).toEqual([1, 2, 3, 4]);
    expect(usage.sessions.map((s) => s.kind)).toEqual([
      WeekendSessionKind.Practice,
      WeekendSessionKind.Practice,
      WeekendSessionKind.Qualifying,
      WeekendSessionKind.Race,
    ]);
  });

  it("스프린트 세션이 있으면 스프린트 주말로 판정하고 SQ 를 구분한다", () => {
    const usage = buildWeekendTireUsage(
      [
        session(1, "Practice 1", "Practice", "2026-08-21T10:00:00Z"),
        session(2, "Sprint Qualifying", "Qualifying", "2026-08-21T14:00:00Z"),
        session(3, "Sprint", "Race", "2026-08-22T10:00:00Z"),
        session(4, "Qualifying", "Qualifying", "2026-08-22T14:00:00Z"),
        session(5, "Race", "Race", "2026-08-23T13:00:00Z"),
      ],
      [stint(2, 1, 1, "MEDIUM")],
      [driver(1, "VER")],
    );

    expect(usage.format).toBe(WeekendFormat.Sprint);
    expect(usage.sessions.find((s) => s.sessionKey === 2)?.kind).toBe(
      WeekendSessionKind.SprintQualifying,
    );
    expect(usage.sessions.find((s) => s.sessionKey === 3)?.kind).toBe(
      WeekendSessionKind.Sprint,
    );
  });

  it("드라이버×세션으로 compound 를 랩 순서대로 담고 신품/중고를 표기한다", () => {
    const usage = buildWeekendTireUsage(
      [
        session(1, "Practice 1", "Practice", "2026-08-21T10:00:00Z"),
        session(2, "Qualifying", "Qualifying", "2026-08-22T14:00:00Z"),
      ],
      [
        // 랩 순서가 섞여 들어와도 정렬한다.
        stint(1, 44, 6, "HARD", 3),
        stint(1, 44, 1, "MEDIUM", 0),
        stint(2, 44, 1, "SOFT", 0),
      ],
      [driver(44, "HAM")],
    );

    const ham = usage.drivers.find((d) => d.driverNumber === 44);

    expect(ham?.code).toBe("HAM");
    // 세션 1: MEDIUM(신품) → HARD(중고)
    const fp1 = ham?.sessions.find((s) => s.sessionKey === 1);
    expect(fp1?.compounds).toEqual([
      { compound: TireCompound.Medium, startedNew: true },
      { compound: TireCompound.Hard, startedNew: false },
    ]);
    // 세션 2: SOFT(신품)
    const quali = ham?.sessions.find((s) => s.sessionKey === 2);
    expect(quali?.compounds).toEqual([
      { compound: TireCompound.Soft, startedNew: true },
    ]);
  });

  it("compound 가 null 인 스틴트(확정 전 임시 행)는 제외한다", () => {
    const usage = buildWeekendTireUsage(
      [session(1, "Practice 1", "Practice", "2026-08-21T10:00:00Z")],
      [stint(1, 44, 1, null), stint(1, 44, 2, "SOFT")],
      [driver(44, "HAM")],
    );

    expect(usage.drivers[0]?.sessions[0]?.compounds).toEqual([
      { compound: TireCompound.Soft, startedNew: true },
    ]);
  });

  it("취소된 세션은 제외한다", () => {
    const cancelled: OpenF1Session = {
      ...session(9, "Practice 1", "Practice", "2026-08-21T10:00:00Z"),
      is_cancelled: true,
    };

    const usage = buildWeekendTireUsage(
      [cancelled, session(1, "Race", "Race", "2026-08-23T13:00:00Z")],
      [stint(1, 44, 1, "SOFT")],
      [driver(44, "HAM")],
    );

    expect(usage.sessions.map((s) => s.sessionKey)).toEqual([1]);
  });

  it("로스터에 코드가 없으면 번호로 대체하고, 주행 없는 드라이버는 뺀다", () => {
    const usage = buildWeekendTireUsage(
      [session(1, "Race", "Race", "2026-08-23T13:00:00Z")],
      [stint(1, 77, 1, "SOFT")],
      // 로스터에 77 없음, 99 는 있지만 주행 안 함.
      [driver(99, "ABC")],
    );

    expect(usage.drivers).toHaveLength(1);
    expect(usage.drivers[0]?.driverNumber).toBe(77);
    expect(usage.drivers[0]?.code).toBe("#77");
  });

  it("distinctCompounds 는 중복 스틴트를 접는다", () => {
    expect(
      distinctCompounds([
        { compound: TireCompound.Soft, startedNew: true },
        { compound: TireCompound.Soft, startedNew: false },
        { compound: TireCompound.Medium, startedNew: true },
      ]),
    ).toEqual([TireCompound.Soft, TireCompound.Medium]);
  });
});
