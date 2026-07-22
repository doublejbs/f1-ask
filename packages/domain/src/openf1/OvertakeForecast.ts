import { LiveDriverState } from "../LiveDriverState";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { SessionStatus } from "../SessionStatus";
import { OpenF1Lap, OpenF1SessionData } from "./OpenF1Types";
import {
  DEFAULT_OVERTAKE_FORECAST_CONFIG,
  OvertakeForecastConfig,
} from "./OvertakeForecastConfig";
import { medianOf, parseMs } from "./OpenF1LapMath";

// 순위 인접 페어의 "N랩 후 배틀 진입" 예측 (docs/23-overtake-forecast.md).
//
// 예측의 본체는 나눗셈이다(docs/23 §원칙: 예측은 산수다) — LLM 을 쓰지 않는다. 필요한
// 랩타임 이력은 원본 laps 에만 있고 스냅샷엔 lastLapSeconds 한 개뿐이라, 원본을 쥐는
// 워커(buildOpenF1LiveFrame)가 nowMs 를 넘겨 호출한다. OpenF1ContextSummary 와 같은 시점
// 규칙(date_start ≤ nowMs)으로 리플레이에서 미래 랩이 섞이지 않게 한다.

export type OvertakeForecast = {
  chaserNumber: number; // 뒷차 (따라잡는 쪽)
  targetNumber: number; // 앞차
  intervalSeconds: number; // 소수 1자리 반올림
  closingRateSecondsPerLap: number; // 소수 2자리 반올림
  predictedLapsToBattle: number; // 정수, Math.ceil (낙관하지 않는다)
  predictedLap: number; // currentLap + predictedLapsToBattle
};

// position 이 확정된 드라이버. 인접 판정에서 null 분기를 없앤다.
type RankedDriver = LiveDriverState & { position: number };

// 랩다운/무의미로 보고 페어를 버리는 간격 상한(초). 스냅샷에 랩다운 전용 필드가 없으므로
// interval 이 이 값을 넘으면 +1 LAP 이상으로 간주한다.
const LAP_DOWN_INTERVAL_SECONDS = 60;

const roundTo = (value: number, digits: number): number => {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
};

// 예측이 의미를 갖는 세션 상태.
//
// Green · Yellow 만 허용한다. WatchNowDetector 의 isRacingStatus 는 SC · VSC 도 포함하지만,
// SC · VSC 는 전 차량이 인위적으로 밀착돼 랩타임·간격이 모두 예측 재료가 못 된다(docs/23 §대상
// 페어). Red · Suspended · Finished 등은 애초에 레이스 진행 상태가 아니다.
const isForecastableStatus = (status: SessionStatus): boolean =>
  status === SessionStatus.Green || status === SessionStatus.Yellow;

// 한 드라이버의 nowMs 시점 "유효 랩"을 lap_number → lap_duration 으로 만든다.
//
// 순서대로 걸러낸다: (1) date_start ≤ nowMs 인 랩만(미래 랩 배제), (2) lap_duration 존재,
// (3) 피트 오염 랩(인랩 lap_number 와 그 +1 아웃랩) 제외, (4) 남은 랩의 중앙값 × outlierRatio
// 초과 랩 제외. 순서가 중요하다 — 중앙값은 피트 제외 뒤 랩으로 내야 인랩·아웃랩이 기준을
// 부풀리지 않는다(docs/23 §잡는 속도).
const buildValidLapDurations = (
  laps: OpenF1Lap[],
  pitLapNumbers: Set<number>,
  nowMs: number,
  outlierRatio: number,
): Map<number, number> => {
  const durationByLap = new Map<number, number>();

  for (const lap of laps) {
    const started = parseMs(lap.date_start);

    if (Number.isNaN(started) || started > nowMs) {
      continue;
    }

    if (lap.lap_duration === null || !Number.isFinite(lap.lap_duration)) {
      continue;
    }

    // 인랩(피트 lap_number)과 아웃랩(그 +1)은 피트로 오염된 랩이라 뺀다.
    if (pitLapNumbers.has(lap.lap_number) || pitLapNumbers.has(lap.lap_number - 1)) {
      continue;
    }

    durationByLap.set(lap.lap_number, lap.lap_duration);
  }

  const median = medianOf([...durationByLap.values()].sort((left, right) => left - right));

  if (median === null) {
    return durationByLap;
  }

  const limit = median * outlierRatio;

  for (const [lapNumber, duration] of durationByLap) {
    if (duration > limit) {
      durationByLap.delete(lapNumber);
    }
  }

  return durationByLap;
};

// 드라이버별 피트 인랩 lap_number 집합. date 는 거르지 않는다 — 미래 피트의 인랩·아웃랩은
// 이미 date_start > nowMs 로 유효 랩에서 빠지므로 클린 랩을 잘못 지우지 않는다.
const buildPitLapsByDriver = (data: OpenF1SessionData): Map<number, Set<number>> => {
  const pitLapsByDriver = new Map<number, Set<number>>();

  for (const pit of data.pits) {
    const laps = pitLapsByDriver.get(pit.driver_number) ?? new Set<number>();

    laps.add(pit.lap_number);
    pitLapsByDriver.set(pit.driver_number, laps);
  }

  return pitLapsByDriver;
};

const buildLapsByDriver = (data: OpenF1SessionData): Map<number, OpenF1Lap[]> => {
  const lapsByDriver = new Map<number, OpenF1Lap[]>();

  for (const lap of data.laps) {
    const list = lapsByDriver.get(lap.driver_number) ?? [];

    list.push(lap);
    lapsByDriver.set(lap.driver_number, list);
  }

  return lapsByDriver;
};

// 두 드라이버의 공통 유효 랩 중 최근 recentLapCount 개로 잡는 속도(초/랩)를 낸다.
// 공통 유효 랩이 recentLapCount 미만이면 예측을 억지로 만들지 않고 null 을 돌려준다.
const computeClosingRate = (
  targetLaps: Map<number, number>,
  chaserLaps: Map<number, number>,
  recentLapCount: number,
): number | null => {
  const commonLapNumbers = [...targetLaps.keys()]
    .filter((lapNumber) => chaserLaps.has(lapNumber))
    .sort((left, right) => right - left);

  if (commonLapNumbers.length < recentLapCount) {
    return null;
  }

  const recentLapNumbers = commonLapNumbers.slice(0, recentLapCount);

  let deltaSum = 0;
  let validLapCount = 0;

  for (const lapNumber of recentLapNumbers) {
    const targetDuration = targetLaps.get(lapNumber);
    const chaserDuration = chaserLaps.get(lapNumber);

    if (targetDuration === undefined || chaserDuration === undefined) {
      continue;
    }

    // 앞차 랩타임 − 뒷차 랩타임. 양수면 뒷차가 매 랩 그만큼 붙는다.
    deltaSum += targetDuration - chaserDuration;
    validLapCount += 1;
  }

  if (validLapCount === 0) {
    return null;
  }

  return deltaSum / validLapCount;
};

export const buildOvertakeForecasts = (
  snapshot: LiveRaceSnapshot,
  data: OpenF1SessionData,
  nowMs: number,
  config: OvertakeForecastConfig = DEFAULT_OVERTAKE_FORECAST_CONFIG,
): OvertakeForecast[] => {
  if (!isForecastableStatus(snapshot.status)) {
    return [];
  }

  const ranked = snapshot.drivers
    .filter((driver): driver is RankedDriver => driver.position !== null)
    .sort((left, right) => left.position - right.position);

  const pitLapsByDriver = buildPitLapsByDriver(data);
  const lapsByDriver = buildLapsByDriver(data);

  // 유효 랩 계산은 페어마다 반복되므로 드라이버별로 한 번만 만들어 캐시한다.
  const validLapsByDriver = new Map<number, Map<number, number>>();
  const validLapsFor = (driverNumber: number): Map<number, number> => {
    const cached = validLapsByDriver.get(driverNumber);

    if (cached !== undefined) {
      return cached;
    }

    const built = buildValidLapDurations(
      lapsByDriver.get(driverNumber) ?? [],
      pitLapsByDriver.get(driverNumber) ?? new Set<number>(),
      nowMs,
      config.outlierRatio,
    );

    validLapsByDriver.set(driverNumber, built);

    return built;
  };

  const forecasts: OvertakeForecast[] = [];

  for (let index = 1; index < ranked.length; index += 1) {
    const chaser = ranked[index];
    const target = ranked[index - 1];

    if (chaser === undefined || target === undefined) {
      continue;
    }

    // 정렬 이웃이 실제로 포지션상 인접(P_n ↔ P_n+1)일 때만 본다. 구멍(P1·P3)은 인접이 아니다.
    if (target.position !== chaser.position - 1) {
      continue;
    }

    // 리타이어·피트인 차량의 간격·랩타임은 레이스 상황을 뜻하지 않는다.
    if (chaser.retired || chaser.inPit || target.retired || target.inPit) {
      continue;
    }

    const interval = chaser.intervalToAheadSeconds;

    // 간격을 모르거나(선두·랩다운), 랩다운으로 볼 만큼 크면 예측 대상이 아니다.
    if (interval === null || interval > LAP_DOWN_INTERVAL_SECONDS) {
      continue;
    }

    // interval 이 TV 영역(임계 이하)이면 예측하지 않는다.
    if (interval <= config.minIntervalSeconds) {
      continue;
    }

    const closingRate = computeClosingRate(
      validLapsFor(target.driverNumber),
      validLapsFor(chaser.driverNumber),
      config.recentLapCount,
    );

    // 공통 유효 랩 부족(null) 또는 노이즈 수준의 접근이면 발화하지 않는다.
    if (closingRate === null || closingRate < config.minClosingRateSecondsPerLap) {
      continue;
    }

    // 예측 랩 수는 올림한다 — 낙관해서 한 랩 빨리 잡힌다고 말하지 않는다.
    const predictedLapsToBattle = Math.ceil(
      (interval - config.battleThresholdSeconds) / closingRate,
    );

    if (predictedLapsToBattle > config.maxLapsAhead) {
      continue;
    }

    // 남은 랩을 알 때만 그 상한을 건다. totalLaps·currentLap 이 null 이면 통과로 본다.
    if (snapshot.totalLaps !== null && snapshot.currentLap !== null) {
      const lapsRemaining = snapshot.totalLaps - snapshot.currentLap;

      if (predictedLapsToBattle > lapsRemaining) {
        continue;
      }
    }

    // 폴링마다 소수 끝자리가 흔들려 PublishDecision 지문을 바꾸지 않도록 저장 시 반올림한다.
    forecasts.push({
      chaserNumber: chaser.driverNumber,
      targetNumber: target.driverNumber,
      intervalSeconds: roundTo(interval, 1),
      closingRateSecondsPerLap: roundTo(closingRate, 2),
      predictedLapsToBattle,
      predictedLap: (snapshot.currentLap ?? 0) + predictedLapsToBattle,
    });
  }

  // chaser position 오름차순 — ranked 를 순위대로 훑으므로 이미 그 순서다.
  return forecasts;
};
