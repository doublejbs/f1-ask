import {
  LiveRaceContextSummary,
  OvertakeContextSummary,
  PitContextSummary,
  StintContextSummary,
} from "../LiveRaceContextSummary";
import { mapCompound } from "./OpenF1Normalizer";
import { OpenF1Lap, OpenF1Pit, OpenF1SessionData, OpenF1Stint } from "./OpenF1Types";

// OpenF1 원본에서 "nowMs 시점까지"의 결정론적 요약을 계산하는 순수 함수 (docs/22 §B).
//
// 워커가 원본을 유일하게 쥐는 지점(PollRunner 의 fetchOpenF1SessionData 직후)에서 호출된다.
// buildOpenF1LiveFrame 이 nowMs 로 스냅샷을 "그 시점"으로 잘라내듯, 여기서도 nowMs 를 받아
// 그 시점까지의 데이터만 집계한다 — 리플레이·라이브 모두 "지금까지"가 맞다.

const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

// 드라이버가 nowMs 시점에 진행 중인 랩 번호. normalizeOpenF1SnapshotAt 의 driverLapNumber 와
// 같은 규칙(date_start <= nowMs 인 랩의 최댓값, 최소 1)이라 스냅샷과 시점이 어긋나지 않는다.
const driverLapAt = (laps: OpenF1Lap[], nowMs: number): number => {
  let lap = 1;

  for (const entry of laps) {
    const started = parseMs(entry.date_start);

    if (!Number.isNaN(started) && started <= nowMs) {
      lap = Math.max(lap, entry.lap_number);
    }
  }

  return lap;
};

// 정렬된 표본의 중앙값. 표본이 없으면 null, 짝수면 가운데 두 값의 평균.
const medianOf = (sortedValues: number[]): number | null => {
  const count = sortedValues.length;

  if (count === 0) {
    return null;
  }

  const mid = Math.floor(count / 2);

  if (count % 2 === 1) {
    return sortedValues[mid] ?? null;
  }

  const lower = sortedValues[mid - 1];
  const upper = sortedValues[mid];

  if (lower === undefined || upper === undefined) {
    return null;
  }

  return (lower + upper) / 2;
};

const buildPitSummary = (pitsSoFar: OpenF1Pit[]): PitContextSummary => {
  const durations = pitsSoFar
    .map((pit) => pit.pit_duration)
    .filter((duration): duration is number => duration !== null && Number.isFinite(duration))
    .sort((left, right) => left - right);

  return {
    totalStops: pitsSoFar.length,
    medianDurationSeconds: medianOf(durations),
  };
};

// 드라이버별 마지막(가장 늦은 date) 피트의 랩 번호.
const buildLastPitLapByDriver = (pitsSoFar: OpenF1Pit[]): Map<number, number> => {
  const lastPitMsByDriver = new Map<number, number>();
  const lastPitLapByDriver = new Map<number, number>();

  for (const pit of pitsSoFar) {
    const atMs = parseMs(pit.date);

    if (Number.isNaN(atMs)) {
      continue;
    }

    const previousMs = lastPitMsByDriver.get(pit.driver_number);

    if (previousMs === undefined || atMs >= previousMs) {
      lastPitMsByDriver.set(pit.driver_number, atMs);
      lastPitLapByDriver.set(pit.driver_number, pit.lap_number);
    }
  }

  return lastPitLapByDriver;
};

const buildStintSummary = (
  driverNumber: number,
  driverStints: OpenF1Stint[],
  currentLap: number,
  lastPitLap: number | null,
): StintContextSummary | null => {
  // nowMs 시점(currentLap)까지 이미 시작된 스틴트만 센다. 아직 시작 안 한 스틴트는 미래다.
  const startedStints = driverStints
    .filter((stint) => stint.lap_start <= currentLap)
    .sort((left, right) => left.lap_start - right.lap_start);

  if (startedStints.length === 0) {
    return null;
  }

  const currentStint = startedStints[startedStints.length - 1];
  const previousStint = startedStints[startedStints.length - 2];

  return {
    driverNumber,
    stintCount: startedStints.length,
    currentStintStartLap: currentStint?.lap_start ?? null,
    previousCompound:
      previousStint === undefined ? null : mapCompound(previousStint.compound),
    lastPitLap,
  };
};

const buildOvertakeSummary = (
  data: OpenF1SessionData,
  nowMs: number,
): OvertakeContextSummary => {
  const overtakesSoFar = (data.overtakes ?? []).filter((overtake) => {
    const atMs = parseMs(overtake.date);

    return !Number.isNaN(atMs) && atMs <= nowMs;
  });

  const countByDriver = new Map<number, number>();

  for (const overtake of overtakesSoFar) {
    const driverNumber = overtake.overtaking_driver_number;

    countByDriver.set(driverNumber, (countByDriver.get(driverNumber) ?? 0) + 1);
  }

  let mostActiveDriverNumber: number | null = null;
  let mostActiveCount = 0;

  for (const [driverNumber, count] of countByDriver) {
    if (count > mostActiveCount) {
      mostActiveDriverNumber = driverNumber;
      mostActiveCount = count;
    }
  }

  return {
    total: overtakesSoFar.length,
    mostActiveDriverNumber,
    mostActiveCount,
  };
};

export const buildLiveContextSummary = (
  data: OpenF1SessionData,
  nowMs: number,
): LiveRaceContextSummary => {
  const pitsSoFar = data.pits.filter((pit) => {
    const atMs = parseMs(pit.date);

    return !Number.isNaN(atMs) && atMs <= nowMs;
  });

  const lastPitLapByDriver = buildLastPitLapByDriver(pitsSoFar);

  const lapsByDriver = new Map<number, OpenF1Lap[]>();

  for (const lap of data.laps) {
    const list = lapsByDriver.get(lap.driver_number) ?? [];

    list.push(lap);
    lapsByDriver.set(lap.driver_number, list);
  }

  const stintsByDriver = new Map<number, OpenF1Stint[]>();

  for (const stint of data.stints) {
    const list = stintsByDriver.get(stint.driver_number) ?? [];

    list.push(stint);
    stintsByDriver.set(stint.driver_number, list);
  }

  // 스냅샷 driver 순서와 어긋나지 않도록 data.drivers 순서로 훑는다.
  const stints: StintContextSummary[] = [];

  for (const driver of data.drivers) {
    const driverStints = stintsByDriver.get(driver.driver_number) ?? [];

    if (driverStints.length === 0) {
      continue;
    }

    const currentLap = driverLapAt(
      lapsByDriver.get(driver.driver_number) ?? [],
      nowMs,
    );
    const summary = buildStintSummary(
      driver.driver_number,
      driverStints,
      currentLap,
      lastPitLapByDriver.get(driver.driver_number) ?? null,
    );

    if (summary !== null) {
      stints.push(summary);
    }
  }

  return {
    pits: buildPitSummary(pitsSoFar),
    stints,
    overtakes: buildOvertakeSummary(data, nowMs),
  };
};
