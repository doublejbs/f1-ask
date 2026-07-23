import { OvertakeForecast } from "./openf1/OvertakeForecast";

// 순위표 위 전용 예측 패널용 셀렉터 (docs/24 §개정: 전용 예측 패널).
//
// 임박한 순(predictedLapsToBattle 오름차순)으로 최대 limit 건을 고른다. 랩 수가
// 같으면 intervalSeconds 가 작은(이미 더 가까운) 쪽을 앞에 둔다 — 같은 랩 예측이라면
// 실제로 먼저 화면에 잡힐 가능성이 높은 쪽이 위에 와야 한다.
export const selectImminentOvertakeForecasts = (
  forecasts: OvertakeForecast[] | undefined,
  limit: number,
): OvertakeForecast[] => {
  if (forecasts === undefined || forecasts.length === 0) {
    return [];
  }

  if (limit <= 0) {
    return [];
  }

  // 스냅샷의 배열을 그대로 sort 하면 호출부의 상태를 변형한다. 복사본을 정렬한다.
  return [...forecasts]
    .sort((left, right) => {
      if (left.predictedLapsToBattle !== right.predictedLapsToBattle) {
        return left.predictedLapsToBattle - right.predictedLapsToBattle;
      }

      if (left.intervalSeconds !== right.intervalSeconds) {
        return left.intervalSeconds - right.intervalSeconds;
      }

      // 폴링마다 순서가 흔들리면 패널 행이 이유 없이 자리를 바꾸므로, 결정론을 위해 chaserNumber로 정렬한다.
      return left.chaserNumber - right.chaserNumber;
    })
    .slice(0, limit);
};
