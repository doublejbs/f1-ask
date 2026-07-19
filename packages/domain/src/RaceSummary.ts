import { selectCommentaryEvents } from "./ai/AiCommentary";
import { LiveRaceSnapshot } from "./LiveRaceSnapshot";
import { RaceEvent } from "./RaceEvent";
import { RaceEventType } from "./RaceEventType";

// 경기 요약의 결정론적 사실 (docs/01-project-overview.md §6 After Race).
// AI 가 아니라 도메인이 계산한다 — LLM 은 이 사실을 서술만 한다.
export type RaceSummaryData = {
  sessionId: string;
  sessionName: string;
  winnerDriverNumber: number | null;
  podiumDriverNumbers: number[];
  fastestLapDriverNumber: number | null;
  totalOvertakes: number;
  totalPitStops: number;
  retiredDriverNumbers: number[];
  keyMoments: RaceEvent[];
};

export const DEFAULT_KEY_MOMENT_LIMIT = 5;

const fastestLapDriver = (events: readonly RaceEvent[]): number | null => {
  let bestDriver: number | null = null;
  let bestTime = Number.POSITIVE_INFINITY;

  for (const event of events) {
    if (event.type !== RaceEventType.FastestLap) {
      continue;
    }

    const lapTime = event.params.lapTimeSeconds;

    if (
      typeof lapTime === "number" &&
      event.driverNumber !== undefined &&
      lapTime < bestTime
    ) {
      bestTime = lapTime;
      bestDriver = event.driverNumber;
    }
  }

  return bestDriver;
};

// 최종 snapshot 과 전체 이벤트에서 요약 사실을 추출한다.
export const selectRaceSummaryData = (
  snapshot: LiveRaceSnapshot,
  events: readonly RaceEvent[],
  keyMomentLimit: number = DEFAULT_KEY_MOMENT_LIMIT,
): RaceSummaryData => {
  const podium = snapshot.drivers
    .filter(
      (driver) =>
        driver.position !== null &&
        driver.position >= 1 &&
        driver.position <= 3,
    )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const winner = podium.find((driver) => driver.position === 1) ?? null;

  const countByType = (type: RaceEventType): number =>
    events.filter((event) => event.type === type).length;

  return {
    sessionId: snapshot.sessionId,
    sessionName: snapshot.sessionName,
    winnerDriverNumber: winner?.driverNumber ?? null,
    podiumDriverNumbers: podium.map((driver) => driver.driverNumber),
    fastestLapDriverNumber: fastestLapDriver(events),
    totalOvertakes: countByType(RaceEventType.Overtake),
    totalPitStops: countByType(RaceEventType.PitStop),
    retiredDriverNumbers: snapshot.drivers
      .filter((driver) => driver.retired)
      .map((driver) => driver.driverNumber),
    keyMoments: selectCommentaryEvents(events, keyMomentLimit),
  };
};
