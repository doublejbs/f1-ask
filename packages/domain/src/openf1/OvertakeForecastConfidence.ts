// 추월 예측의 신뢰도 (docs/23-overtake-forecast.md §신뢰도).
//
// closingRate 는 최근 유효 랩의 "간격 좁힘" **평균**이다. 평균만 보면 한 랩만 크게 좁히고
// 나머지 랩은 오히려 벌어진 흔들리는 접근도 양수 평균을 내 예측으로 발화한다. 예측 랩 수는
// 그 평균으로 나눈 선형 외삽이라, 개별 랩의 방향이 얼마나 일관됐는지가 곧 그 외삽을 얼마나
// 믿을 수 있는지다. AiConfidence 와 같은 3단계로 맞춘다 — 화면·이벤트에서 같은 어휘를 쓴다.
export enum OvertakeForecastConfidence {
  High = "high",
  Medium = "medium",
  Low = "low",
}

// 최근 유효 랩의 "간격 좁힘" 델타(앞차 랩타임 − 뒷차 랩타임, 초/랩)들로 신뢰도를 정한다.
// 양수 = 그 랩에 뒷차가 붙었다. buildOvertakeForecasts 가 closingRate 를 낼 때 쓴 바로 그
// 델타들을 그대로 넘긴다 — 신뢰도가 예측과 다른 랩을 보지 않게 하기 위해서다.
//
//   High   — 모든 최근 랩에서 좁혔다(전부 양수). 선형 외삽이 가장 믿을 만하다.
//   Medium — 과반(절반 초과)이 좁혔다. 3랩 중 2랩이면 여기다.
//   Low    — 과반 미만. 평균만 양수인 노이즈성 접근이라 "N랩 후"를 곧이곧대로 믿기 어렵다.
export const deriveOvertakeForecastConfidence = (
  closingDeltasSecondsPerLap: number[],
): OvertakeForecastConfidence => {
  if (closingDeltasSecondsPerLap.length === 0) {
    return OvertakeForecastConfidence.Low;
  }

  const closingLapCount = closingDeltasSecondsPerLap.filter(
    (delta) => delta > 0,
  ).length;

  if (closingLapCount === closingDeltasSecondsPerLap.length) {
    return OvertakeForecastConfidence.High;
  }

  // 과반 = 절반 초과. 정수 비교로 두어 부동소수 나눗셈을 피한다(3랩 중 2랩 → 4 > 3 → Medium).
  if (closingLapCount * 2 > closingDeltasSecondsPerLap.length) {
    return OvertakeForecastConfidence.Medium;
  }

  return OvertakeForecastConfidence.Low;
};
