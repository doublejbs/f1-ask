import { describe, expect, it } from "vitest";
import { OvertakeForecast } from "../src/openf1/OvertakeForecast";
import { selectOvertakeForecastsByChaser } from "../src/OvertakeForecastRowSelector";

const makeForecast = (
  chaserNumber: number,
  targetNumber: number,
  predictedLapsToBattle = 3,
): OvertakeForecast => ({
  chaserNumber,
  targetNumber,
  intervalSeconds: 2.4,
  closingRateSecondsPerLap: 0.42,
  predictedLapsToBattle,
  predictedLap: 30 + predictedLapsToBattle,
});

describe("selectOvertakeForecastsByChaser", () => {
  it("undefined 면 빈 Map 을 돌려준다", () => {
    expect(selectOvertakeForecastsByChaser(undefined).size).toBe(0);
  });

  it("빈 배열이면 빈 Map 을 돌려준다", () => {
    expect(selectOvertakeForecastsByChaser([]).size).toBe(0);
  });

  it("복수 예측을 chaser 번호로 인덱싱한다", () => {
    const byChaser = selectOvertakeForecastsByChaser([
      makeForecast(30, 10, 3),
      makeForecast(55, 4, 5),
    ]);

    expect(byChaser.size).toBe(2);
    expect(byChaser.get(30)?.targetNumber).toBe(10);
    expect(byChaser.get(55)?.targetNumber).toBe(4);
    // target 번호로는 찾을 수 없다 — target 행에는 배지를 붙이지 않는다.
    expect(byChaser.get(10)).toBeUndefined();
  });

  it("같은 chaser 가 중복되면 먼저 온 예측을 유지한다", () => {
    const byChaser = selectOvertakeForecastsByChaser([
      makeForecast(30, 10, 3),
      makeForecast(30, 4, 7),
    ]);

    expect(byChaser.size).toBe(1);
    expect(byChaser.get(30)?.targetNumber).toBe(10);
    expect(byChaser.get(30)?.predictedLapsToBattle).toBe(3);
  });
});
