import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventType } from "../RaceEventType";
import { makeEvent } from "./OpenF1EventFactory";
import { OvertakeForecast } from "./OvertakeForecast";

// 추월 예측 하나를 이벤트로 만든다 (docs/23-overtake-forecast.md §이벤트).
//
// buildOvertakeForecasts 는 매 폴링 "지금 성립하는" 예측을 전부 내고, OvertakeForecastTracker 가
// 그중 "새로 성립한" 것만 골라 이 함수로 이벤트화한다. 예측값은 스냅샷 필드와 같은 값을 그대로
// params 에 싣는다 — AI 해설이 지어낸 수치가 아니라 결정론이 낸 수치만 쓰게 하기 위해서다.
//
// key 는 chaser·target·predictedLap 으로 결정론적이다. 같은 성립(같은 예측 랩)은 재폴링에서
// 같은 deduplicationKey 를 내므로 EventWriteCursor 가 중복 쓰기를 막는다. driverCode 는 다른
// 이벤트들처럼 스냅샷에서 조회해 채운다(없으면 빈 문자열).
export const buildOvertakeForecastEvent = (
  forecast: OvertakeForecast,
  snapshot: LiveRaceSnapshot,
  nowMs: number,
): RaceEvent => {
  // 드라이버 코드와 타이어 데이터를 스냅샷에서 조회한다.
  const driverOf = (driverNumber: number) =>
    snapshot.drivers.find((driver) => driver.driverNumber === driverNumber);

  const codeOf = (driverNumber: number): string =>
    driverOf(driverNumber)?.code ?? "";

  const compoundOf = (driverNumber: number): string | null =>
    driverOf(driverNumber)?.compound ?? null;

  const tireAgeOf = (driverNumber: number): number | null =>
    driverOf(driverNumber)?.tireAgeLaps ?? null;

  return makeEvent(
    snapshot.sessionId,
    RaceEventType.OvertakeForecast,
    RaceEventPriority.Medium,
    nowMs,
    {
      driverNumber: forecast.chaserNumber,
      targetDriverNumber: forecast.targetNumber,
      lapNumber: forecast.predictedLap,
      key: `${forecast.chaserNumber}:${forecast.targetNumber}:${forecast.predictedLap}`,
      params: {
        driverCode: codeOf(forecast.chaserNumber),
        targetDriverCode: codeOf(forecast.targetNumber),
        chaserNumber: forecast.chaserNumber,
        targetNumber: forecast.targetNumber,
        chaserCompound: compoundOf(forecast.chaserNumber),
        chaserTireAgeLaps: tireAgeOf(forecast.chaserNumber),
        targetCompound: compoundOf(forecast.targetNumber),
        targetTireAgeLaps: tireAgeOf(forecast.targetNumber),
        intervalSeconds: forecast.intervalSeconds,
        closingRateSecondsPerLap: forecast.closingRateSecondsPerLap,
        predictedLapsToBattle: forecast.predictedLapsToBattle,
        predictedLap: forecast.predictedLap,
      },
    },
  );
};
