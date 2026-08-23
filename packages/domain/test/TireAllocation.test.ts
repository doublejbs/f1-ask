import { describe, expect, it } from "vitest";
import {
  DRY_TIRE_ALLOCATION,
  remainingSetCount,
  remainingTirePossibilities,
  returnedSetsThrough,
  summarizeRemainingRanges,
  totalReturnedSets,
  totalTireSets,
  WeekendFormat,
} from "../src/tire/TireAllocation";

describe("TireAllocation — 할당·반납 규정", () => {
  it("일반 주말 할당은 13세트(H2 M3 S8)다", () => {
    expect(totalTireSets(DRY_TIRE_ALLOCATION[WeekendFormat.Conventional])).toBe(13);
    expect(DRY_TIRE_ALLOCATION[WeekendFormat.Conventional]).toEqual({
      hard: 2,
      medium: 3,
      soft: 8,
    });
  });

  it("스프린트 주말 할당은 12세트(H2 M4 S6)다", () => {
    expect(totalTireSets(DRY_TIRE_ALLOCATION[WeekendFormat.Sprint])).toBe(12);
  });

  it("일반 주말은 FP1·FP2·FP3 후 2세트씩 총 6세트 반납한다", () => {
    expect(returnedSetsThrough(WeekendFormat.Conventional, 0)).toBe(0);
    expect(returnedSetsThrough(WeekendFormat.Conventional, 1)).toBe(2);
    expect(returnedSetsThrough(WeekendFormat.Conventional, 2)).toBe(4);
    expect(returnedSetsThrough(WeekendFormat.Conventional, 3)).toBe(6);
    expect(totalReturnedSets(WeekendFormat.Conventional)).toBe(6);
  });

  it("스프린트 주말은 FP1 후 1·스프린트 후 1·퀄리 후 3 총 5세트 반납한다", () => {
    expect(returnedSetsThrough(WeekendFormat.Sprint, 1)).toBe(1);
    expect(returnedSetsThrough(WeekendFormat.Sprint, 2)).toBe(2);
    expect(returnedSetsThrough(WeekendFormat.Sprint, 3)).toBe(5);
    expect(totalReturnedSets(WeekendFormat.Sprint)).toBe(5);
  });

  it("두 형식 모두 모든 반납 후 7세트가 남는다", () => {
    expect(remainingSetCount(WeekendFormat.Conventional, 6)).toBe(7);
    expect(remainingSetCount(WeekendFormat.Sprint, 5)).toBe(7);
  });

  it("completedStages 가 범위를 벗어나도 잘라서 안전하게 계산한다", () => {
    expect(returnedSetsThrough(WeekendFormat.Conventional, -1)).toBe(0);
    expect(returnedSetsThrough(WeekendFormat.Conventional, 99)).toBe(6);
  });
});

describe("remainingTirePossibilities — 남은 구성 경우의 수", () => {
  it("일반 주말 6세트 반납 후 7세트 잔여의 경우의 수는 12가지다", () => {
    const possibilities = remainingTirePossibilities(WeekendFormat.Conventional, 6);

    // H(0..2) × M(0..3) 중 soft=7-h-m 이 [0,8]인 조합. 손계산: 각 h 마다 m=0..3 모두 유효 → 3×4=12.
    expect(possibilities).toHaveLength(12);
    // 합은 전부 7, 각 컴파운드는 할당량 이하.
    for (const combo of possibilities) {
      expect(combo.hard + combo.medium + combo.soft).toBe(7);
      expect(combo.hard).toBeLessThanOrEqual(2);
      expect(combo.medium).toBeLessThanOrEqual(3);
      expect(combo.soft).toBeLessThanOrEqual(8);
    }
  });

  it("반납 전(0세트 반납)이면 할당 그대로가 유일한 경우다", () => {
    const possibilities = remainingTirePossibilities(WeekendFormat.Conventional, 0);

    expect(possibilities).toEqual([{ hard: 2, medium: 3, soft: 8 }]);
  });

  it("범위 요약은 각 컴파운드의 최소·최대를 낸다", () => {
    const ranges = summarizeRemainingRanges(
      remainingTirePossibilities(WeekendFormat.Conventional, 6),
    );

    // 7세트 잔여: 하드 0~2, 미디엄 0~3, 소프트 2~7(=7-2-3 .. 7-0-0 은 8이지만 잔여7이라 상한7).
    expect(ranges.hard).toEqual({ min: 0, max: 2 });
    expect(ranges.medium).toEqual({ min: 0, max: 3 });
    expect(ranges.soft).toEqual({ min: 2, max: 7 });
  });
});
