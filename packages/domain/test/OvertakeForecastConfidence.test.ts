import { describe, expect, it } from "vitest";
import {
  deriveOvertakeForecastConfidence,
  OvertakeForecastConfidence,
} from "../src/openf1/OvertakeForecastConfidence";

describe("deriveOvertakeForecastConfidence", () => {
  it("최근 랩이 전부 좁혔으면(모두 양수) High", () => {
    expect(deriveOvertakeForecastConfidence([0.3, 0.5, 0.2])).toBe(
      OvertakeForecastConfidence.High,
    );
  });

  it("과반이 좁혔으면(3랩 중 2랩 양수) Medium", () => {
    expect(deriveOvertakeForecastConfidence([0.6, -0.1, 0.4])).toBe(
      OvertakeForecastConfidence.Medium,
    );
  });

  it("평균은 양수지만 좁힌 랩이 과반 미만이면(3랩 중 1랩) Low", () => {
    // 평균 +0.5 로 예측은 발화하지만, 실제로 좁힌 랩은 하나뿐인 흔들리는 접근이다.
    expect(deriveOvertakeForecastConfidence([2.0, -0.5, 0.0])).toBe(
      OvertakeForecastConfidence.Low,
    );
  });

  it("정확히 절반은 과반이 아니다 — 4랩 중 2랩이면 Low", () => {
    expect(deriveOvertakeForecastConfidence([0.3, -0.1, 0.2, -0.2])).toBe(
      OvertakeForecastConfidence.Low,
    );
  });

  it("델타가 0인 랩은 좁힌 것으로 세지 않는다(양수만 인정)", () => {
    expect(deriveOvertakeForecastConfidence([0, 0, 0.5])).toBe(
      OvertakeForecastConfidence.Low,
    );
  });

  it("빈 배열은 Low 로 떨어진다(방어값)", () => {
    expect(deriveOvertakeForecastConfidence([])).toBe(
      OvertakeForecastConfidence.Low,
    );
  });
});
