import { describe, expect, it } from "vitest";
import { OpenF1SessionResult } from "../src/openf1/OpenF1Types";
import { computeTeammateComparison } from "../src/season/TeammateComparison";

const result = (over: Partial<OpenF1SessionResult>): OpenF1SessionResult => ({
  driver_number: 16,
  position: 5,
  number_of_laps: 57,
  points: 10,
  duration: null,
  gap_to_leader: null,
  dnf: false,
  dns: false,
  dsq: false,
  session_key: 1,
  ...over,
});

describe("computeTeammateComparison", () => {
  it("포인트(결승+스프린트)·우승·포디움·헤드투헤드를 집계한다", () => {
    const aRace = [
      result({ session_key: 1, position: 1, points: 25 }),
      result({ session_key: 2, position: 4, points: 12 }),
      result({ session_key: 3, position: 3, points: 15 }),
    ];
    const bRace = [
      result({ session_key: 1, position: 2, points: 18 }),
      result({ session_key: 2, position: 2, points: 18 }),
      result({ session_key: 3, position: 6, points: 8 }),
    ];
    // 포인트는 결승 + 스프린트(세션 9)를 합산한다.
    const aPoints = [...aRace, result({ session_key: 9, position: 1, points: 8 })];
    const bPoints = [...bRace, result({ session_key: 9, position: 3, points: 6 })];

    const cmp = computeTeammateComparison(
      { raceResults: aRace, pointsResults: aPoints },
      { raceResults: bRace, pointsResults: bPoints },
    );

    // 포인트 = 52 + 스프린트 8 = 60. 우승·포디움은 결승만.
    expect(cmp.a).toEqual({ points: 60, wins: 1, podiums: 2, headToHead: 2 });
    expect(cmp.b.points).toBe(50); // 44 + 6
    expect(cmp.b.wins).toBe(0);
    expect(cmp.b.podiums).toBe(2);
    expect(cmp.b.headToHead).toBe(1);
  });

  it("미분류(position null)는 상대에게 헤드투헤드를 내주고, DSQ는 우승·포디움 제외", () => {
    const a = [result({ session_key: 1, position: null, dnf: true, points: 0 })];
    const b = [result({ session_key: 1, position: 1, dsq: true, points: 0 })];

    const cmp = computeTeammateComparison(
      { raceResults: a, pointsResults: a },
      { raceResults: b, pointsResults: b },
    );

    // a 는 미분류, b 는 분류(P1)지만 DSQ → 우승 0. h2h: b 가 앞섬.
    expect(cmp.a.headToHead).toBe(0);
    expect(cmp.b.headToHead).toBe(1);
    expect(cmp.b.wins).toBe(0);
    expect(cmp.b.podiums).toBe(0);
  });

  it("공통 레이스가 없으면 헤드투헤드는 0", () => {
    const a = [result({ session_key: 1, position: 1 })];
    const b = [result({ session_key: 2, position: 1 })];

    const cmp = computeTeammateComparison(
      { raceResults: a, pointsResults: a },
      { raceResults: b, pointsResults: b },
    );

    expect(cmp.a.headToHead).toBe(0);
    expect(cmp.b.headToHead).toBe(0);
  });
});
