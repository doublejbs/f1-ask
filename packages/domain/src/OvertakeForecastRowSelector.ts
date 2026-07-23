import { OvertakeForecast } from "./openf1/OvertakeForecast";

// 순위표 행 인라인 예측 배지용 셀렉터 (docs/24-standings-forecast-inline.md).
//
// 스냅샷의 overtakeForecasts 를 chaser 번호로 인덱싱해 행 렌더가 O(1) 로 자기 예측을
// 찾게 한다(markersByDriver 패턴). chaser 로만 인덱싱하는 이유: 한 예측이 chaser·target
// 두 행에 붙으면 중복 소음이라 배지는 chaser 행에만 붙는다(docs/24 §행 인라인 배지).
export const selectOvertakeForecastsByChaser = (
  forecasts: OvertakeForecast[] | undefined,
): Map<number, OvertakeForecast> => {
  const byChaser = new Map<number, OvertakeForecast>();

  if (forecasts === undefined) {
    return byChaser;
  }

  for (const forecast of forecasts) {
    // 인접 페어당 예측은 1건이라 같은 chaser 가 두 번 올 수 없지만, 데이터를 믿지 않고
    // 방어한다 — 먼저 온 것(순위 앞쪽 페어)을 유지한다.
    if (byChaser.has(forecast.chaserNumber)) {
      continue;
    }

    byChaser.set(forecast.chaserNumber, forecast);
  }

  return byChaser;
};
