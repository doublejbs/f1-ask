import { describe, expect, it } from "vitest";
import { OvertakeForecast } from "../src/openf1/OvertakeForecast";
import { selectImminentOvertakeForecasts } from "../src/OvertakeForecastPanelSelector";

const makeForecast = (
  chaserNumber: number,
  targetNumber: number,
  predictedLapsToBattle: number,
  intervalSeconds = 2.4,
): OvertakeForecast => ({
  chaserNumber,
  targetNumber,
  intervalSeconds,
  closingRateSecondsPerLap: 0.42,
  predictedLapsToBattle,
  predictedLap: 30 + predictedLapsToBattle,
});

describe("selectImminentOvertakeForecasts", () => {
  it("undefined 면 빈 배열을 돌려준다", () => {
    expect(selectImminentOvertakeForecasts(undefined, 3)).toEqual([]);
  });

  it("빈 배열이면 빈 배열을 돌려준다", () => {
    expect(selectImminentOvertakeForecasts([], 3)).toEqual([]);
  });

  it("predictedLapsToBattle 오름차순으로 정렬한다", () => {
    const selected = selectImminentOvertakeForecasts(
      [
        makeForecast(30, 10, 5),
        makeForecast(55, 4, 2),
        makeForecast(81, 1, 4),
      ],
      3,
    );

    expect(selected.map((forecast) => forecast.chaserNumber)).toEqual([
      55, 81, 30,
    ]);
  });

  it("랩 수 동률이면 intervalSeconds 가 작은(더 가까운) 쪽을 앞에 둔다", () => {
    const selected = selectImminentOvertakeForecasts(
      [
        makeForecast(30, 10, 3, 2.8),
        makeForecast(55, 4, 3, 1.6),
        makeForecast(81, 1, 3, 2.1),
      ],
      3,
    );

    expect(selected.map((forecast) => forecast.chaserNumber)).toEqual([
      55, 81, 30,
    ]);
  });

  it("limit 을 넘는 예측은 잘라낸다 — 임박한 쪽이 남는다", () => {
    const selected = selectImminentOvertakeForecasts(
      [
        makeForecast(30, 10, 5),
        makeForecast(55, 4, 2),
        makeForecast(81, 1, 4),
        makeForecast(63, 44, 1),
      ],
      3,
    );

    expect(selected.map((forecast) => forecast.chaserNumber)).toEqual([
      63, 55, 81,
    ]);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const forecasts = [
      makeForecast(30, 10, 5),
      makeForecast(55, 4, 2),
    ];

    selectImminentOvertakeForecasts(forecasts, 3);

    expect(forecasts.map((forecast) => forecast.chaserNumber)).toEqual([
      30, 55,
    ]);
  });

  it("predictedLapsToBattle와 intervalSeconds가 모두 같으면 chaserNumber 오름차순으로 정렬한다", () => {
    const selected = selectImminentOvertakeForecasts(
      [
        makeForecast(81, 1, 3, 2.0),
        makeForecast(30, 10, 3, 2.0),
        makeForecast(55, 4, 3, 2.0),
      ],
      3,
    );

    expect(selected.map((forecast) => forecast.chaserNumber)).toEqual([
      30, 55, 81,
    ]);
  });

  it("limit이 0 이하이면 빈 배열을 돌려준다", () => {
    const forecasts = [
      makeForecast(30, 10, 5),
      makeForecast(55, 4, 2),
      makeForecast(81, 1, 4),
    ];

    expect(selectImminentOvertakeForecasts(forecasts, 0)).toEqual([]);
    expect(selectImminentOvertakeForecasts(forecasts, -1)).toEqual([]);
  });
});
