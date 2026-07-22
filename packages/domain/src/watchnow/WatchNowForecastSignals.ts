import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { WatchNowSignal } from "./WatchNowSignal";
import { WatchNowSignalType } from "./WatchNowSignalType";

// 스냅샷의 overtakeForecasts 를 "지금 볼 것" 신호로 **변환**한다 (docs/23 §UI).
//
// **감지가 아니라 변환이다.** 예측은 원본 랩타임을 쥔 워커가 이미 계산해 스냅샷에 실었으므로
// (docs/23 §계산 위치: 워커), 클라이언트 감지기(WatchNowDetector)에 넣지 않는다. 감지기는
// 프레임 간 상태로 엣지를 잡지만, 예측은 스냅샷에 담긴 현재 상태라 매 프레임 그대로 옮기면
// 된다. WatchNowFeed 의 후보 창·중복 접기가 나머지를 처리한다.
//
// chaser 가 신호의 주체(driverNumber)다 — 알림을 받아야 할 쪽은 따라잡는 뒷차다. target 은
// 상대역(rivalDriverNumber)으로 싣는다. 언더컷 신호가 상대 드라이버를 다루는 방식과 같게 해
// 즐겨찾기·상대역 판정이 target 도 보게 만든다(WatchNowLaneBuilder).
export const buildOvertakeForecastSignals = (
  snapshot: LiveRaceSnapshot,
): WatchNowSignal[] => {
  const forecasts = snapshot.overtakeForecasts;

  // optional 필드다 — mock·옛 스냅샷·예측 없는 프레임에서는 신호가 없다.
  if (forecasts === undefined || forecasts.length === 0) {
    return [];
  }

  const codeByNumber = new Map<number, string>();

  for (const driver of snapshot.drivers) {
    codeByNumber.set(driver.driverNumber, driver.code);
  }

  const signals: WatchNowSignal[] = [];

  for (const forecast of forecasts) {
    const chaserCode = codeByNumber.get(forecast.chaserNumber);

    // 주체(chaser) 코드를 못 찾으면 화면에 그릴 수 없다 — 방어적으로 건너뛴다.
    if (chaserCode === undefined) {
      continue;
    }

    signals.push({
      type: WatchNowSignalType.OvertakeForecast,
      driverNumber: forecast.chaserNumber,
      driverCode: chaserCode,
      lapNumber: snapshot.currentLap,
      detectedAt: snapshot.generatedAt,
      tireAgeLaps: null,
      gapSeconds: null,
      rivalDriverNumber: forecast.targetNumber,
      rivalDriverCode: codeByNumber.get(forecast.targetNumber) ?? null,
      positionFrom: null,
      positionTo: null,
      predictedLapsToBattle: forecast.predictedLapsToBattle,
    });
  }

  return signals;
};
