import { describe, expect, it } from "vitest";
import { predictLapsToBattle } from "../src/openf1/OvertakeForecast";
import { DEFAULT_OVERTAKE_FORECAST_CONFIG } from "../src/openf1/OvertakeForecastConfig";

const config = DEFAULT_OVERTAKE_FORECAST_CONFIG;

describe("predictLapsToBattle — 타이어 열화 반영 (B1)", () => {
  it("타이어 나이가 같거나 앞차가 더 낡으면 기존 선형(ceil)과 같다", () => {
    // interval 3.0, rate 0.5, battle 1.0 → distance 2.0 → 4랩.
    expect(predictLapsToBattle(3.0, 0.5, 20, 20, config)).toBe(4);
    expect(predictLapsToBattle(3.0, 0.5, 10, 25, config)).toBe(4); // 쫓는 차가 더 새 타이어
    expect(predictLapsToBattle(3.0, 0.5, null, null, config)).toBe(4); // 나이 미상
  });

  it("나이 미상·동일과 선형 예측이 일치한다(회귀: 3.0/0.33 → 7랩)", () => {
    expect(predictLapsToBattle(3.0, 0.33, null, null, config)).toBe(7);
  });

  it("쫓는 차가 약간 더 낡으면 열화로 예측이 같거나 길어진다", () => {
    const linear = predictLapsToBattle(3.0, 0.4, 20, 20, config);
    const degraded = predictLapsToBattle(3.0, 0.4, 28, 20, config);

    expect(linear).not.toBeNull();
    // 열화가 있으면 더 늦게 잡거나(랩 수 ≥) 아예 못 잡는다(null).
    if (degraded !== null && linear !== null) {
      expect(degraded).toBeGreaterThanOrEqual(linear);
    }
  });

  it("쫓는 차 타이어가 크게 낡으면 잡는 속도가 열화로 멈춰 예측하지 않는다(null)", () => {
    // 열세 25랩 → 감쇠 상한(0.6×rate)에 걸려 몇 랩 만에 rate 가 노이즈 아래로 떨어진다.
    expect(predictLapsToBattle(3.0, 0.5, 30, 5, config)).toBeNull();
  });
});
