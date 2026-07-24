import {
  LiveRaceContextSummary,
  OvertakeContextSummary,
  PitContextSummary,
  PitWave,
  RaceFastestLap,
  RaceMover,
  RaceNarrative,
  RaceProgress,
  RaceRetirement,
  SafetyCarPeriod,
  StintContextSummary,
  WeatherShift,
} from "../LiveRaceContextSummary";
import { SafetyCarKind } from "../SafetyCarKind";
import { SessionStatus } from "../SessionStatus";
import { classifySafetyCarMessage } from "./OpenF1SafetyCarClassification";
import { deriveOpenF1Status, mapCompound } from "./OpenF1Normalizer";
import { OpenF1RaceControlCategory } from "./OpenF1RaceControlCategory";
import { scheduledRaceLaps } from "./RaceLapCounts";
import {
  OpenF1Lap,
  OpenF1Pit,
  OpenF1Position,
  OpenF1RaceControl,
  OpenF1SessionData,
  OpenF1Stint,
} from "./OpenF1Types";
import { medianOf, parseMs } from "./OpenF1LapMath";

// OpenF1 원본에서 "nowMs 시점까지"의 결정론적 요약을 계산하는 순수 함수 (docs/22 §B).
//
// 워커가 원본을 유일하게 쥐는 지점(PollRunner 의 fetchOpenF1SessionData 직후)에서 호출된다.
// buildOpenF1LiveFrame 이 nowMs 로 스냅샷을 "그 시점"으로 잘라내듯, 여기서도 nowMs 를 받아
// 그 시점까지의 데이터만 집계한다 — 리플레이·라이브 모두 "지금까지"가 맞다.

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

// ── narrative(경기 전체 서사) 조립 (docs/25) ─────────────────────────────
//
// 여기부터는 "지금 상태의 압축"(집계)이 아니라 "여기까지 어떻게 왔나"(아크)를 조립한다.
// 전부 parseMs(row.date) <= nowMs 게이팅이라 미래가 새지 않는다(docs/25 수용 기준 §9).

// 리타이어 판정: 리더 랩이 어떤 드라이버의 마지막 완주 랩보다 이만큼(랩) 이상 앞서면 정지로 본다.
// 근거(벨기에 GP 픽스처로 확정): 리더 랩은 우승자의 체커 후 인랩(#12 L45)까지 세므로 실제 리더보다
// 1랩 높게 잡힌다. 그 결과 정상 주행 중인 최후미(#14 L42·#77 L43)가 리더 대비 2~3랩 뒤처져 보인다.
// K=3(스펙 기본값)이면 이들을 오검하므로, 정상 주행 최대 격차(3랩)를 넘는 K=4 로 확정한다 —
// 진짜 정지 3명(STR·PER·RUS)은 19랩 이상 뒤처져 여유롭게 분리된다(docs/25 §리타이어 "구현 시 확정").
const RETIREMENT_LAP_GAP = 4;
// 합류 즉시 오검을 막으려 최소 이만큼(랩) 달린 드라이버만 리타이어 후보다(docs/25 §리타이어).
const RETIREMENT_MIN_LAPS = 1;
// 이 랩 수 이전(세션 초반)에는 movers 를 빈 배열로 둬 포메이션 셔플 소음을 차단한다(docs/25 §세션 초반).
const MOVERS_MIN_LAP = 3;
// 상승·하락 각각 상위 이 개수까지만 담는다(docs/25 §담을 서사).
const MOVERS_LIMIT = 3;
// 피트 웨이브는 대수 많은 상위 이 개수 구간까지만 담는다.
const PIT_WAVE_LIMIT = 5;
// 피트 웨이브 클러스터링: 랩 번호 차가 이 값 이하면 같은 구간으로 묶는다(1 = 연속 랩만 인접).
const PIT_WAVE_MAX_GAP = 1;

// 드라이버별 마지막 완주 랩(date_start <= nowMs 인 lap_number 최댓값). 랩이 없으면 0.
// driverLapAt 은 최소 1로 바닥을 깔지만, 여기서는 "달린 적 없음"(0)을 구분해야 리타이어 후보
// (1랩 이상 달림)를 걸러낼 수 있어 별도로 센다.
const buildLastLapByDriver = (
  laps: OpenF1Lap[],
  nowMs: number,
): Map<number, number> => {
  const lastLapByDriver = new Map<number, number>();

  for (const lap of laps) {
    const started = parseMs(lap.date_start);

    if (Number.isNaN(started) || started > nowMs) {
      continue;
    }

    const previous = lastLapByDriver.get(lap.driver_number) ?? 0;

    lastLapByDriver.set(lap.driver_number, Math.max(previous, lap.lap_number));
  }

  return lastLapByDriver;
};

// 특정 시각의 리더 랩(전체 드라이버 중 마지막 완주 랩 최댓값). 랩이 하나도 없으면 null.
const leaderLapAtMs = (laps: OpenF1Lap[], atMs: number): number | null => {
  let leader: number | null = null;

  for (const lap of laps) {
    const started = parseMs(lap.date_start);

    if (Number.isNaN(started) || started > atMs) {
      continue;
    }

    leader = leader === null ? lap.lap_number : Math.max(leader, lap.lap_number);
  }

  return leader;
};

const buildProgress = (
  data: OpenF1SessionData,
  raceControlSorted: OpenF1RaceControl[],
  leaderLap: number | null,
  nowMs: number,
): RaceProgress => {
  const status = deriveOpenF1Status(raceControlSorted, nowMs);
  const totalLaps = scheduledRaceLaps(data.meta.circuitName, data.meta.sessionType);

  // progress.currentLap 만 totalLaps 로 클램프. 우승자 체커 후 인랩까지 센 리더 랩이
  // totalLaps 를 초과할 수 있으므로(e.g. 45/44) 표시값만 정정한다.
  // 리타이어 감지는 원본 leaderLap 을 그대로 써야 정체 판정이 정확하다.
  const clampedCurrentLap =
    totalLaps !== null && leaderLap !== null ? Math.min(leaderLap, totalLaps) : leaderLap;

  return {
    currentLap: clampedCurrentLap,
    totalLaps,
    phase: status,
  };
};

// 선두를 잡은 순서: position==1 을 시간순으로 훑어 연속 중복만 제거한다. 트랙 추월이 아니라
// "리드 보유 순서"다(docs/25 §재시작·SC 왜곡 방지).
const buildLeadChanges = (
  positions: OpenF1Position[],
  nowMs: number,
): number[] => {
  const leaders = positions
    .filter((row) => {
      const atMs = parseMs(row.date);

      return !Number.isNaN(atMs) && atMs <= nowMs && row.position === 1;
    })
    .sort((left, right) => parseMs(left.date) - parseMs(right.date))
    .map((row) => row.driver_number);

  const sequence: number[] = [];

  for (const driverNumber of leaders) {
    if (sequence[sequence.length - 1] !== driverNumber) {
      sequence.push(driverNumber);
    }
  }

  return sequence;
};

// 랩 정체로 리타이어를 감지한다(docs/25 §리타이어 — race_control 은 리타이어를 안 알림).
const buildRetirements = (
  data: OpenF1SessionData,
  lastLapByDriver: Map<number, number>,
  lastPitLapByDriver: Map<number, number>,
  leaderLap: number | null,
): RaceRetirement[] => {
  if (leaderLap === null) {
    return [];
  }

  const retirements: RaceRetirement[] = [];

  for (const driver of data.drivers) {
    const lastLap = lastLapByDriver.get(driver.driver_number) ?? 0;

    if (lastLap < RETIREMENT_MIN_LAPS) {
      continue;
    }

    if (leaderLap - lastLap < RETIREMENT_LAP_GAP) {
      continue;
    }

    // 정체 랩에 피트한 차는 정지가 아니라 (긴) 피트로 본다(docs/25 §리타이어 오검 안전성).
    const lastPitLap = lastPitLapByDriver.get(driver.driver_number);

    if (lastPitLap !== undefined && lastPitLap >= lastLap) {
      continue;
    }

    retirements.push({ driverNumber: driver.driver_number, lap: lastLap });
  }

  // 늦게 멈춘 순(lap desc), 동률이면 번호 asc — 표시 순서를 고정한다.
  retirements.sort(
    (left, right) => right.lap - left.lap || left.driverNumber - right.driverNumber,
  );

  return retirements;
};

// 피트가 몰린 랩 구간. 인접(랩 차 <= PIT_WAVE_MAX_GAP) 피트를 한 구간으로 묶고 대수순 상위만.
const buildPitWaves = (pitsSoFar: OpenF1Pit[]): PitWave[] => {
  const countByLap = new Map<number, number>();

  for (const pit of pitsSoFar) {
    countByLap.set(pit.lap_number, (countByLap.get(pit.lap_number) ?? 0) + 1);
  }

  const laps = [...countByLap.keys()].sort((left, right) => left - right);
  const clusters: PitWave[] = [];

  for (const lap of laps) {
    const current = clusters[clusters.length - 1];
    const count = countByLap.get(lap) ?? 0;

    if (current !== undefined && lap - current.endLap <= PIT_WAVE_MAX_GAP) {
      current.endLap = lap;
      current.count += count;

      continue;
    }

    clusters.push({ startLap: lap, endLap: lap, count });
  }

  return clusters
    .sort((left, right) => right.count - left.count || left.startLap - right.startLap)
    .slice(0, PIT_WAVE_LIMIT);
};

// 그리드(positions 첫값) 대비 nowMs 순위 이동. 상승 상위·하락 하위 각 MOVERS_LIMIT.
const buildMovers = (
  positions: OpenF1Position[],
  nowMs: number,
  currentLap: number | null,
): RaceMover[] => {
  // 세션 초반(랩 임계 이전)은 포메이션 셔플 소음이라 빈 배열로 막는다(docs/25 §세션 초반).
  if (currentLap === null || currentLap < MOVERS_MIN_LAP) {
    return [];
  }

  const gridByDriver = new Map<number, number>();
  const gridMsByDriver = new Map<number, number>();
  const currentByDriver = new Map<number, number>();
  const currentMsByDriver = new Map<number, number>();

  for (const row of positions) {
    const atMs = parseMs(row.date);

    if (Number.isNaN(atMs) || atMs > nowMs) {
      continue;
    }

    const gridMs = gridMsByDriver.get(row.driver_number);

    if (gridMs === undefined || atMs < gridMs) {
      gridMsByDriver.set(row.driver_number, atMs);
      gridByDriver.set(row.driver_number, row.position);
    }

    const currentMs = currentMsByDriver.get(row.driver_number);

    if (currentMs === undefined || atMs >= currentMs) {
      currentMsByDriver.set(row.driver_number, atMs);
      currentByDriver.set(row.driver_number, row.position);
    }
  }

  const movers: RaceMover[] = [];

  for (const [driverNumber, from] of gridByDriver) {
    const to = currentByDriver.get(driverNumber);

    if (to === undefined) {
      continue;
    }

    movers.push({ driverNumber, from, to, delta: from - to });
  }

  const risers = movers
    .filter((mover) => mover.delta > 0)
    .sort((left, right) => right.delta - left.delta || left.driverNumber - right.driverNumber)
    .slice(0, MOVERS_LIMIT);
  const fallers = movers
    .filter((mover) => mover.delta < 0)
    .sort((left, right) => left.delta - right.delta || left.driverNumber - right.driverNumber)
    .slice(0, MOVERS_LIMIT);

  return [...risers, ...fallers];
};

// 패스티스트 랩: date_start <= nowMs 인 랩만으로 최소 lap_duration 재계산(docs/25 §기존 유틸 재사용).
const buildFastestLap = (
  laps: OpenF1Lap[],
  nowMs: number,
): RaceFastestLap | null => {
  let best: RaceFastestLap | null = null;

  for (const lap of laps) {
    const started = parseMs(lap.date_start);
    const duration = lap.lap_duration;

    if (Number.isNaN(started) || started > nowMs) {
      continue;
    }

    if (duration === null || !Number.isFinite(duration)) {
      continue;
    }

    if (best === null || duration < best.lapSeconds) {
      best = { driverNumber: lap.driver_number, lapSeconds: duration, lap: lap.lap_number };
    }
  }

  return best;
};

// dry↔wet 전환. rainfall>0(=wet) 여부가 바뀌는 시점만, 근사 랩(그 시각 리더 랩)과 함께 담는다.
const buildWeatherShifts = (
  data: OpenF1SessionData,
  nowMs: number,
): WeatherShift[] => {
  const readings = (data.weather ?? [])
    .filter((row) => {
      const atMs = parseMs(row.date);

      return !Number.isNaN(atMs) && atMs <= nowMs;
    })
    .sort((left, right) => parseMs(left.date) - parseMs(right.date));

  const shifts: WeatherShift[] = [];
  let previousWet: boolean | null = null;

  for (const reading of readings) {
    const isWet = (reading.rainfall ?? 0) > 0;

    if (previousWet !== null && isWet !== previousWet) {
      shifts.push({ lap: leaderLapAtMs(data.laps, parseMs(reading.date)), toWet: isWet });
    }

    previousWet = isWet;
  }

  return shifts;
};

// SC·VSC 개시 구간. 판정은 공용 classifySafetyCarMessage 재사용(두 벌 금지, docs/25 §기존 유틸).
const buildSafetyCars = (
  data: OpenF1SessionData,
  raceControlSorted: OpenF1RaceControl[],
  nowMs: number,
): SafetyCarPeriod[] => {
  const periods: SafetyCarPeriod[] = [];
  let active: SafetyCarKind | null = null;

  for (const message of raceControlSorted) {
    const atMs = parseMs(message.date);

    if (Number.isNaN(atMs) || atMs > nowMs) {
      continue;
    }

    if (message.category !== OpenF1RaceControlCategory.SafetyCar) {
      continue;
    }

    const neutralization = classifySafetyCarMessage(message.message);

    if (neutralization === SessionStatus.Green) {
      active = null;

      continue;
    }

    const kind =
      neutralization === SessionStatus.VirtualSafetyCar
        ? SafetyCarKind.Vsc
        : neutralization === SessionStatus.SafetyCar
          ? SafetyCarKind.Sc
          : null;

    if (kind === null || kind === active) {
      continue;
    }

    const startLap =
      message.lap_number ?? leaderLapAtMs(data.laps, atMs) ?? 1;

    periods.push({ kind, startLap });
    active = kind;
  }

  return periods;
};

const buildNarrative = (
  data: OpenF1SessionData,
  lastPitLapByDriver: Map<number, number>,
  nowMs: number,
): RaceNarrative => {
  const raceControlSorted = data.raceControl
    .slice()
    .sort((left, right) => parseMs(left.date) - parseMs(right.date));
  const lastLapByDriver = buildLastLapByDriver(data.laps, nowMs);
  const leaderLap = leaderLapAtMs(data.laps, nowMs);

  return {
    progress: buildProgress(data, raceControlSorted, leaderLap, nowMs),
    leadChanges: buildLeadChanges(data.positions, nowMs),
    retirements: buildRetirements(data, lastLapByDriver, lastPitLapByDriver, leaderLap),
    pitWaves: buildPitWaves(
      data.pits.filter((pit) => {
        const atMs = parseMs(pit.date);

        return !Number.isNaN(atMs) && atMs <= nowMs;
      }),
    ),
    biggestMovers: buildMovers(data.positions, nowMs, leaderLap),
    fastestLap: buildFastestLap(data.laps, nowMs),
    weatherShifts: buildWeatherShifts(data, nowMs),
    safetyCars: buildSafetyCars(data, raceControlSorted, nowMs),
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
    narrative: buildNarrative(data, lastPitLapByDriver, nowMs),
  };
};
