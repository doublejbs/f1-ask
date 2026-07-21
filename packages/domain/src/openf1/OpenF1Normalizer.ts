import { LiveDriverState } from "../LiveDriverState";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { SessionStatus } from "../SessionStatus";
import { TeamRadioClip } from "../TeamRadioClip";
import { TireCompound } from "../TireCompound";
import { WeatherState } from "../WeatherState";
import { OpenF1RaceControlCategory } from "./OpenF1RaceControlCategory";
import { parseRaceControlCategory } from "./OpenF1RaceControlParsing";
import { classifySafetyCarMessage } from "./OpenF1SafetyCarClassification";
import { scheduledRaceLaps } from "./RaceLapCounts";
import {
  OpenF1Interval,
  OpenF1Lap,
  OpenF1Pit,
  OpenF1Position,
  OpenF1RaceControl,
  OpenF1SessionData,
  OpenF1Stint,
  OpenF1TeamRadio,
  OpenF1Weather,
} from "./OpenF1Types";

const SNAPSHOT_SCHEMA_VERSION = 1;
const PIT_WINDOW_MS = 30_000;
// 스냅샷에 담을 최근 팀 라디오 클립 최대 개수.
const TEAM_RADIO_LIMIT = 12;

const numberOrNull = (value: number | string | null): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const mapCompound = (compound: string): TireCompound => {
  switch (compound.toUpperCase()) {
    case "SOFT":
      return TireCompound.Soft;
    case "MEDIUM":
      return TireCompound.Medium;
    case "HARD":
      return TireCompound.Hard;
    case "INTERMEDIATE":
      return TireCompound.Intermediate;
    case "WET":
      return TireCompound.Wet;
    default:
      return TireCompound.Unknown;
  }
};

const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

// 드라이버별로 시각 오름차순 정렬된 레코드를 미리 묶어 프레임 계산을 빠르게 한다.
const groupByDriver = <T extends { driver_number: number }>(
  rows: readonly T[],
  dateOf: (row: T) => number,
): Map<number, T[]> => {
  const grouped = new Map<number, T[]>();

  for (const row of rows) {
    const list = grouped.get(row.driver_number) ?? [];
    list.push(row);
    grouped.set(row.driver_number, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => dateOf(a) - dateOf(b));
  }

  return grouped;
};

const latestBefore = <T>(
  rows: readonly T[] | undefined,
  atMs: number,
  dateOf: (row: T) => number,
): T | null => {
  if (rows === undefined) {
    return null;
  }

  let found: T | null = null;

  for (const row of rows) {
    const ms = dateOf(row);

    if (!Number.isNaN(ms) && ms <= atMs) {
      found = row;
    } else if (!Number.isNaN(ms) && ms > atMs) {
      break;
    }
  }

  return found;
};

// 정규화에 필요한 인덱스를 한 번만 만들어 재사용한다.
export type OpenF1Index = {
  data: OpenF1SessionData;
  totalLaps: number;
  positionsByDriver: Map<number, OpenF1Position[]>;
  intervalsByDriver: Map<number, OpenF1Interval[]>;
  lapsByDriver: Map<number, OpenF1Lap[]>;
  pitsByDriver: Map<number, OpenF1Pit[]>;
  stintsByDriver: Map<number, OpenF1Stint[]>;
  raceControlSorted: OpenF1RaceControl[];
  weatherSorted: OpenF1Weather[];
  teamRadioSorted: OpenF1TeamRadio[];
};

export const buildOpenF1Index = (data: OpenF1SessionData): OpenF1Index => {
  const totalLaps = data.stints.reduce(
    (max, stint) => Math.max(max, stint.lap_end),
    0,
  );

  return {
    data,
    totalLaps,
    positionsByDriver: groupByDriver(data.positions, (p) => parseMs(p.date)),
    intervalsByDriver: groupByDriver(data.intervals, (i) => parseMs(i.date)),
    lapsByDriver: groupByDriver(data.laps, (l) => l.lap_number),
    pitsByDriver: groupByDriver(data.pits, (p) => parseMs(p.date)),
    stintsByDriver: groupByDriver(data.stints, (s) => s.lap_start),
    raceControlSorted: data.raceControl
      .slice()
      .sort((a, b) => parseMs(a.date) - parseMs(b.date)),
    weatherSorted: (data.weather ?? [])
      .slice()
      .sort((a, b) => parseMs(a.date) - parseMs(b.date)),
    teamRadioSorted: (data.teamRadio ?? [])
      .slice()
      .sort((a, b) => parseMs(a.date) - parseMs(b.date)),
  };
};

// 특정 시각의 세션 상태를 race_control 로부터 유도한다.
export const deriveOpenF1Status = (
  raceControlSorted: readonly OpenF1RaceControl[],
  atMs: number,
): SessionStatus => {
  let status = SessionStatus.Scheduled;

  for (const message of raceControlSorted) {
    const ms = parseMs(message.date);

    if (Number.isNaN(ms) || ms > atMs) {
      break;
    }

    if (
      parseRaceControlCategory(message.category) ===
      OpenF1RaceControlCategory.SafetyCar
    ) {
      // 문구 해석은 공용 판정에만 둔다(OpenF1SafetyCarClassification 주석 참고).
      // 예전에는 여기서 "VIRTUAL" 만 봐서 실데이터의 'VSC DEPLOYED' 를 풀 SC 로 오분류했다.
      const neutralization = classifySafetyCarMessage(message.message);

      if (neutralization !== null) {
        status = neutralization;
      }

      continue;
    }

    if (message.flag === "CHEQUERED") {
      status = SessionStatus.Finished;
      continue;
    }

    if (message.flag === "RED") {
      status = SessionStatus.Red;
      continue;
    }

    // 트랙 전체 스코프 플래그만 세션 상태에 반영한다 (섹터 옐로 제외).
    if (message.scope === "Track") {
      if (message.flag === "GREEN" || message.flag === "CLEAR") {
        status = SessionStatus.Green;
      } else if (message.flag === "YELLOW" || message.flag === "DOUBLE YELLOW") {
        status = SessionStatus.Yellow;
      }
    }
  }

  return status;
};

const driverLapNumber = (laps: OpenF1Lap[] | undefined, atMs: number): number => {
  if (laps === undefined) {
    return 1;
  }

  let lap = 1;

  for (const entry of laps) {
    const started = parseMs(entry.date_start);

    if (!Number.isNaN(started) && started <= atMs) {
      lap = Math.max(lap, entry.lap_number);
    }
  }

  return lap;
};

const completedLaps = (
  laps: OpenF1Lap[] | undefined,
  currentLap: number,
): number[] =>
  (laps ?? [])
    .filter(
      (entry) =>
        entry.lap_duration !== null && entry.lap_number <= currentLap,
    )
    .sort((a, b) => a.lap_number - b.lap_number)
    .map((entry) => entry.lap_duration as number);

const stintAtLap = (
  stints: OpenF1Stint[] | undefined,
  lap: number,
): OpenF1Stint | null => {
  if (stints === undefined) {
    return null;
  }

  let current: OpenF1Stint | null = null;

  for (const stint of stints) {
    if (stint.lap_start <= lap) {
      current = stint;
    }
  }

  return current;
};

// 특정 시각의 LiveRaceSnapshot 을 구성한다 (docs §8.1, §3.2).
export const normalizeOpenF1SnapshotAt = (
  index: OpenF1Index,
  atMs: number,
  version: number,
): LiveRaceSnapshot => {
  const { data } = index;
  const iso = new Date(atMs).toISOString();

  const drivers: LiveDriverState[] = data.drivers.map((driver) => {
    const number = driver.driver_number;
    const positions = index.positionsByDriver.get(number);
    const positionRow = latestBefore(positions, atMs, (p) => parseMs(p.date));
    const intervalRow = latestBefore(
      index.intervalsByDriver.get(number),
      atMs,
      (i) => parseMs(i.date),
    );

    const currentLap = driverLapNumber(index.lapsByDriver.get(number), atMs);
    const laps = completedLaps(index.lapsByDriver.get(number), currentLap);
    const stint = stintAtLap(index.stintsByDriver.get(number), currentLap);
    const pits = index.pitsByDriver.get(number) ?? [];
    const pitsSoFar = pits.filter((pit) => parseMs(pit.date) <= atMs);
    const inPit = pitsSoFar.some((pit) => {
      const start = parseMs(pit.date);

      return start <= atMs && atMs <= start + PIT_WINDOW_MS;
    });

    const startingPosition = positions?.[0]?.position ?? null;
    const position = positionRow?.position ?? null;

    const lapObjs = index.lapsByDriver.get(number) ?? [];
    const completedLapObjs = lapObjs.filter(
      (lap) => lap.lap_number <= currentLap && lap.lap_duration !== null,
    );
    const lastLapObj = completedLapObjs.at(-1);
    const lastSectorsSeconds = lastLapObj
      ? [
          lastLapObj.duration_sector_1 ?? null,
          lastLapObj.duration_sector_2 ?? null,
          lastLapObj.duration_sector_3 ?? null,
        ]
      : undefined;
    const topSpeedKph = completedLapObjs.reduce<number | null>((max, lap) => {
      const speed = lap.st_speed ?? null;

      if (speed === null) {
        return max;
      }

      return max === null ? speed : Math.max(max, speed);
    }, null);

    return {
      driverNumber: number,
      code: driver.name_acronym,
      fullName: driver.full_name,
      teamName: driver.team_name,
      teamColour: driver.team_colour ?? null,
      headshotUrl: driver.headshot_url ?? null,
      lastSectorsSeconds,
      topSpeedKph,
      position,
      startingPosition,
      positionChange:
        startingPosition !== null && position !== null
          ? startingPosition - position
          : null,
      gapToLeaderSeconds: numberOrNull(intervalRow?.gap_to_leader ?? null),
      // 선두에게는 앞차가 없다. OpenF1 은 선두의 `interval` 을 0 으로 채워 보내지만
      // 그 0 은 "간격이 0 초"가 아니라 "해당 없음"이며, 그대로 흘리면 하류가 0 을
      // 실제 간격으로 읽는다(간격 수렴 감지가 `0 < 1.0` 으로 발화해 "P1 앞차와 0.0초"
      // 같은 문장을 만들어 냈다).
      //
      // `null` 이 이 필드의 "앞차 없음" 표현이며, MockRaceEngine 은 이미 선두에
      // `null` 을 넣는다(MockRaceEngine.test.ts). 데이터 소스마다 선두 표현이 갈리지
      // 않도록 사실을 아는 이 층에서 맞춘다.
      intervalToAheadSeconds:
        position === 1 ? null : numberOrNull(intervalRow?.interval ?? null),
      intervalToBehindSeconds: null,
      lastLapSeconds: laps.length > 0 ? (laps.at(-1) as number) : null,
      personalBestLapSeconds: laps.length > 0 ? Math.min(...laps) : null,
      compound: stint ? mapCompound(stint.compound) : TireCompound.Unknown,
      tireAgeLaps: stint
        ? Math.max(0, currentLap - stint.lap_start + stint.tyre_age_at_start)
        : null,
      pitStopCount: pitsSoFar.length,
      inPit,
      retired: false,
      recentLapTimesSeconds: laps.slice(-3),
    };
  });

  // 순위 오름차순 정렬 후 뒤차 간격을 리더 대비 간격 차이로 채운다.
  const ordered = drivers
    .slice()
    .sort(
      (a, b) =>
        (a.position ?? Number.POSITIVE_INFINITY) -
        (b.position ?? Number.POSITIVE_INFINITY),
    );

  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i];
    const behind = ordered[i + 1];

    if (
      current !== undefined &&
      behind !== undefined &&
      current.gapToLeaderSeconds !== null &&
      behind.gapToLeaderSeconds !== null
    ) {
      current.intervalToBehindSeconds = Math.max(
        0,
        behind.gapToLeaderSeconds - current.gapToLeaderSeconds,
      );
    }
  }

  const currentLap = ordered.reduce((max, driver) => {
    const lap = index.lapsByDriver.get(driver.driverNumber);
    return Math.max(max, driverLapNumber(lap, atMs));
  }, 1);

  const status = deriveOpenF1Status(index.raceControlSorted, atMs);

  // 1순위: 서킷별 예정 랩 수(고정값). OpenF1 은 라이브 중 총 랩을 제공하지 않으므로
  //        Race 세션은 서킷 참조 테이블로 예정 랩 수를 알아낸다 (스파 44 등).
  // 2순위(알 수 없는 서킷): 스틴트 lap_end 최댓값으로 추정하되, 라이브 중에는 이 값이
  //        현재 랩 근처로만 채워져 신뢰할 수 없다("LAP 17 of 17"처럼 종료로 오해).
  //        스틴트가 현재 랩보다 앞을 내다보거나(완주 후 캡처된 데이터) 세션이 종료된
  //        경우에만 신뢰하고, 그 외에는 null(모름) 로 둔다.
  const weatherRow = latestBefore(
    index.weatherSorted,
    atMs,
    (w) => parseMs(w.date),
  );
  const weather: WeatherState | undefined =
    weatherRow == null
      ? undefined
      : {
          airTemperatureCelsius: weatherRow.air_temperature,
          trackTemperatureCelsius: weatherRow.track_temperature,
          humidityPercent: weatherRow.humidity,
          rainfall: (weatherRow.rainfall ?? 0) > 0,
          windSpeedMps: weatherRow.wind_speed,
        };

  // 팀 라디오: atMs 이전 클립을 최신순으로 최대 TEAM_RADIO_LIMIT 개 담는다.
  const codeByNumber = new Map(
    data.drivers.map((driver) => [driver.driver_number, driver.name_acronym]),
  );
  const teamRadios: TeamRadioClip[] = index.teamRadioSorted
    .filter((radio) => parseMs(radio.date) <= atMs)
    .slice(-TEAM_RADIO_LIMIT)
    .reverse()
    .map((radio) => ({
      driverNumber: radio.driver_number,
      driverCode: codeByNumber.get(radio.driver_number) ?? String(radio.driver_number),
      recordingUrl: radio.recording_url,
      timestamp: radio.date,
    }));

  const scheduled = scheduledRaceLaps(data.meta.circuitName, data.meta.sessionType);
  const totalLaps =
    scheduled !== null
      ? scheduled
      : index.totalLaps > 0 &&
          (index.totalLaps > currentLap || status === SessionStatus.Finished)
        ? index.totalLaps
        : null;

  // 완주 데이터는 최종 랩 크로싱 때문에 currentLap 이 예정 랩 수를 1 초과할 수 있다.
  // 총 랩을 아는 경우 그 값을 넘지 않도록 클램프해 "45 of 44" 표시를 막는다.
  const displayLap =
    totalLaps !== null ? Math.min(currentLap, totalLaps) : currentLap;

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sessionId: data.meta.sessionId,
    sessionKey: data.meta.sessionKey,
    meetingKey: data.meta.meetingKey,
    sessionName: data.meta.sessionName,
    sessionType: data.meta.sessionType,
    circuitName: data.meta.circuitName,
    countryCode: data.meta.countryCode,
    status,
    currentLap: displayLap,
    totalLaps,
    drivers: ordered,
    weather,
    teamRadios,
    generatedAt: iso,
    sourceUpdatedAt: iso,
    version,
  };
};
