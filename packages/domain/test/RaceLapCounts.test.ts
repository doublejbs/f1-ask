import { describe, expect, it } from "vitest";
import { scheduledRaceLaps } from "../src/openf1/RaceLapCounts";

describe("scheduledRaceLaps", () => {
  it("알려진 서킷의 예정 랩 수를 반환한다", () => {
    expect(scheduledRaceLaps("Spa-Francorchamps", "Race")).toBe(44);
    expect(scheduledRaceLaps("Monza", "Race")).toBe(53);
    expect(scheduledRaceLaps("Marina Bay", "Race")).toBe(62);
  });

  it("대소문자·공백에 관대하다", () => {
    expect(scheduledRaceLaps("  spa-francorchamps  ", "Race")).toBe(44);
    expect(scheduledRaceLaps("MONACO", "race")).toBe(78);
  });

  it("Race 가 아닌 세션은 null (퀄리파잉 등은 랩 제한이 없음)", () => {
    expect(scheduledRaceLaps("Spa-Francorchamps", "Qualifying")).toBeNull();
    expect(scheduledRaceLaps("Spa-Francorchamps", "Sprint")).toBeNull();
  });

  it("알 수 없는 서킷은 null", () => {
    expect(scheduledRaceLaps("Unknown Circuit", "Race")).toBeNull();
  });
});
