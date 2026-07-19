import { LiveRaceSnapshot } from "./LiveRaceSnapshot";
import { RaceEvent } from "./RaceEvent";
import { TireCompound } from "./TireCompound";

// 관심 드라이버 상세 뷰 모델 (docs/01-project-overview.md §7.2).
// snapshot/events 에서 계산하지 않고 "선택·투영"만 한 결과다.
// (경기 상태 계산은 엔진/Worker 책임 — 클라이언트는 이 모델을 렌더링만 한다.)
export type FavoriteDriverDetail = {
  driverNumber: number;
  code: string;
  fullName: string;
  teamName: string;
  currentPosition: number | null;
  startingPosition: number | null;
  positionChange: number | null;
  gapToLeaderSeconds: number | null;
  gapAheadSeconds: number | null;
  gapBehindSeconds: number | null;
  compound: TireCompound;
  tireAgeLaps: number | null;
  pitStopCount: number;
  inPit: boolean;
  retired: boolean;
  recentLapTimesSeconds: number[];
  recentEvents: RaceEvent[];
};

export const DEFAULT_FAVORITE_EVENT_LIMIT = 5;

// 해당 드라이버가 주체이거나 대상인 이벤트만 최신순으로 추린다.
export const selectFavoriteDriverEvents = (
  events: readonly RaceEvent[],
  driverNumber: number,
  limit: number = DEFAULT_FAVORITE_EVENT_LIMIT,
): RaceEvent[] => {
  const related = events.filter(
    (event) =>
      event.driverNumber === driverNumber ||
      event.targetDriverNumber === driverNumber,
  );

  return related.slice(-limit).reverse();
};

// 관심 드라이버 상세 모델을 만든다. snapshot 에 없는 드라이버면 null.
export const selectFavoriteDriverDetail = (
  snapshot: LiveRaceSnapshot,
  events: readonly RaceEvent[],
  driverNumber: number,
  recentEventLimit: number = DEFAULT_FAVORITE_EVENT_LIMIT,
): FavoriteDriverDetail | null => {
  const driver = snapshot.drivers.find(
    (candidate) => candidate.driverNumber === driverNumber,
  );

  if (driver === undefined) {
    return null;
  }

  return {
    driverNumber: driver.driverNumber,
    code: driver.code,
    fullName: driver.fullName,
    teamName: driver.teamName,
    currentPosition: driver.position,
    startingPosition: driver.startingPosition,
    positionChange: driver.positionChange,
    gapToLeaderSeconds: driver.gapToLeaderSeconds,
    gapAheadSeconds: driver.intervalToAheadSeconds,
    gapBehindSeconds: driver.intervalToBehindSeconds,
    compound: driver.compound,
    tireAgeLaps: driver.tireAgeLaps,
    pitStopCount: driver.pitStopCount,
    inPit: driver.inPit,
    retired: driver.retired,
    recentLapTimesSeconds: driver.recentLapTimesSeconds,
    recentEvents: selectFavoriteDriverEvents(events, driverNumber, recentEventLimit),
  };
};
