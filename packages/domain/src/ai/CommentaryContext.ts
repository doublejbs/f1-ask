import { LiveDriverState } from "../LiveDriverState";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceEvent, RaceEventParams } from "../RaceEvent";
import { RaceEventScope } from "../RaceEventScope";
import { getRaceEventScope } from "../RaceEventScopeMap";

// 프롬프트에 넣을 직전 해설 건수. 연속 이벤트가 같은 말을 되풀이하는 것을 막는 용도라
// 길 필요가 없다 — 늘리면 토큰만 든다.
export const RECENT_COMMENTARY_LIMIT = 4;

// 순위 슬라이스의 선두 구간 크기. 전체 20명을 넣으면 토큰만 늘고 모델이 초점을 잃는다
// (docs/18-ai-commentary-worker.md §맥락 번들).
const LEADING_SLICE_SIZE = 3;

// 대상 드라이버 기준 앞뒤로 몇 명까지 포함할지.
const NEIGHBOR_RADIUS = 1;

// 프롬프트에 넣는 순위 한 줄. 필요한 열만 남긴다.
export type CommentaryStandingsRow = {
  position: number;
  code: string;
  team: string;
  gapToLeaderSeconds: number | null;
};

// 프롬프트에 직렬화해 넣는 맥락 묶음.
export type CommentaryContext = {
  scope: RaceEventScope;
  event: {
    type: string;
    driverNumber: number | null;
    driverCode: string | null;
    lapNumber: number | null;
    params: RaceEventParams;
  };
  session: {
    status: string;
    currentLap: number | null;
    totalLaps: number | null;
    lapsRemaining: number | null;
    retiredCount: number;
  };
  // Session 범위 이벤트에는 넣지 않는다 (실측: 연속 이벤트가 같은 갭을 반복한다).
  standings?: CommentaryStandingsRow[];
  recentCommentary: string[];
};

const toStandingsRow = (
  driver: LiveDriverState,
): CommentaryStandingsRow | null => {
  if (driver.position === null) {
    return null;
  }

  return {
    position: driver.position,
    code: driver.code,
    team: driver.teamName,
    gapToLeaderSeconds: driver.gapToLeaderSeconds,
  };
};

// 상위 3명 + 대상 드라이버 앞뒤 1명. 중복을 제거하고 position 오름차순으로 돌려준다.
const selectStandingsSlice = (
  snapshot: LiveRaceSnapshot,
  driverNumber: number | undefined,
): CommentaryStandingsRow[] => {
  const ranked = snapshot.drivers
    .filter((driver) => driver.position !== null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const picked = new Map<number, CommentaryStandingsRow>();

  const add = (driver: LiveDriverState): void => {
    const row = toStandingsRow(driver);

    if (row === null) {
      return;
    }

    picked.set(driver.driverNumber, row);
  };

  for (const driver of ranked.slice(0, LEADING_SLICE_SIZE)) {
    add(driver);
  }

  if (driverNumber !== undefined) {
    const targetIndex = ranked.findIndex(
      (driver) => driver.driverNumber === driverNumber,
    );

    if (targetIndex >= 0) {
      const from = Math.max(0, targetIndex - NEIGHBOR_RADIUS);
      const to = targetIndex + NEIGHBOR_RADIUS + 1;

      for (const driver of ranked.slice(from, to)) {
        add(driver);
      }
    }
  }

  return [...picked.values()].sort((a, b) => a.position - b.position);
};

const findDriverCode = (
  snapshot: LiveRaceSnapshot,
  driverNumber: number | undefined,
): string | null => {
  if (driverNumber === undefined) {
    return null;
  }

  return (
    snapshot.drivers.find((driver) => driver.driverNumber === driverNumber)
      ?.code ?? null
  );
};

const countRemainingLaps = (snapshot: LiveRaceSnapshot): number | null => {
  if (snapshot.currentLap === null || snapshot.totalLaps === null) {
    return null;
  }

  return Math.max(0, snapshot.totalLaps - snapshot.currentLap);
};

// 해설 프롬프트에 넣을 맥락을 조립하는 순수 함수.
// 범위(RaceEventScope)로 순위 슬라이스 포함 여부가 갈린다 — 새 분류를 만들지 않는다.
export const buildCommentaryContext = (
  event: RaceEvent,
  snapshot: LiveRaceSnapshot,
  recentCommentary: string[] = [],
): CommentaryContext => {
  const scope = getRaceEventScope(event.type);

  const context: CommentaryContext = {
    scope,
    event: {
      type: event.type,
      driverNumber: event.driverNumber ?? null,
      driverCode: findDriverCode(snapshot, event.driverNumber),
      lapNumber: event.lapNumber ?? null,
      params: event.params,
    },
    session: {
      status: snapshot.status,
      currentLap: snapshot.currentLap,
      totalLaps: snapshot.totalLaps,
      lapsRemaining: countRemainingLaps(snapshot),
      retiredCount: snapshot.drivers.filter((driver) => driver.retired).length,
    },
    recentCommentary: recentCommentary.slice(-RECENT_COMMENTARY_LIMIT),
  };

  if (scope === RaceEventScope.Driver) {
    context.standings = selectStandingsSlice(snapshot, event.driverNumber);
  }

  return context;
};
