import { describe, expect, it } from "vitest";
import {
  OpenF1Driver,
  OpenF1Session,
  OpenF1SessionResult,
} from "../src/openf1/OpenF1Types";
import { buildWeekendResults } from "../src/tire/WeekendResults";
import { WeekendSessionKind } from "../src/tire/WeekendTires";

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

const driver = (driverNumber: number, code: string): OpenF1Driver => ({
  driver_number: driverNumber,
  name_acronym: code,
  full_name: code,
  team_name: "Team",
});

const result = (
  sessionKey: number,
  driverNumber: number,
  position: number | null,
  duration: OpenF1SessionResult["duration"],
  gap: OpenF1SessionResult["gap_to_leader"] = null,
): OpenF1SessionResult => ({
  session_key: sessionKey,
  driver_number: driverNumber,
  position,
  number_of_laps: null,
  duration,
  gap_to_leader: gap,
  dnf: false,
  dns: false,
  dsq: false,
});

describe("buildWeekendResults", () => {
  it("퀄리 세그먼트 랭크를 기록자끼리 계산한다 — 최종 순위와 다르다 (docs/27 회귀)", () => {
    // HUL: Q1 랩 78.796 인데 최종 P10. 다른 둘이 Q1 더 빠름 → HUL Q1 3위(여기선 3명 픽스처).
    // 핵심: 세그먼트 랭크(기록 순)와 finalPosition 이 별개임을 고정한다.
    const results = [
      result(1, 27, 10, [78.796, null, null]), // HUL: Q1만 기록, 최종 10위
      result(1, 1, 1, [78.5, 78.0, 77.5]), // VER: 전 세그먼트 최속
      result(1, 44, 2, [78.6, 78.1, null]), // HAM
    ];

    const usage = buildWeekendResults(
      [session(1, "Qualifying", "Qualifying", "2026-08-22T14:00:00Z")],
      results,
      [driver(27, "HUL"), driver(1, "VER"), driver(44, "HAM")],
    );

    const quali = usage.sessions[0];
    expect(quali?.type).toBe("qualifying");
    expect(quali?.kind).toBe(WeekendSessionKind.Qualifying);

    if (quali?.type !== "qualifying") throw new Error("expected qualifying");

    const hul = quali.qualifying.find((row) => row.driverNumber === 27);
    // Q1 기록자 3명 중 78.5·78.6·78.796 → HUL 은 3위. 최종 분류는 10위(별개).
    expect(hul?.segments[0]?.rank).toBe(3);
    expect(hul?.finalPosition).toBe(10);
    // Q2·Q3 무기록 → lap null, rank null.
    expect(hul?.segments[1]?.lapSeconds).toBeNull();
    expect(hul?.segments[1]?.rank).toBeNull();

    const ver = quali.qualifying.find((row) => row.driverNumber === 1);
    expect(ver?.segments[0]?.rank).toBe(1);
    expect(ver?.segments[2]?.rank).toBe(1);
  });

  it("프랙티스는 베스트랩·갭·최종 순위로 담는다", () => {
    const usage = buildWeekendResults(
      [session(1, "Practice 1", "Practice", "2026-08-21T10:00:00Z")],
      [result(1, 1, 1, 89.26, 0), result(1, 44, 2, 89.4, 0.14)],
      [driver(1, "VER"), driver(44, "HAM")],
    );

    const fp = usage.sessions[0];
    expect(fp?.type).toBe("practice");
    if (fp?.type !== "practice") throw new Error("expected practice");

    expect(fp.practice[0]?.code).toBe("VER");
    expect(fp.practice[0]?.bestLapSeconds).toBe(89.26);
    expect(fp.practice[1]?.gapToLeaderSeconds).toBe(0.14);
  });

  it("레이스 세션은 결과 표에서 제외한다(아카이브 상세가 담당)", () => {
    const usage = buildWeekendResults(
      [session(1, "Race", "Race", "2026-08-23T13:00:00Z")],
      [result(1, 1, 1, 5231.3)],
      [driver(1, "VER")],
    );

    expect(usage.sessions).toHaveLength(0);
  });

  it("결과가 없는 세션은 건너뛴다", () => {
    const usage = buildWeekendResults(
      [session(1, "Practice 1", "Practice", "2026-08-21T10:00:00Z")],
      [],
      [driver(1, "VER")],
    );

    expect(usage.sessions).toHaveLength(0);
  });
});
