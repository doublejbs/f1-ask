import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { resolvePointsBetweenPositions } from "./WatchNowChampionshipPoints";
import { WatchNowLane } from "./WatchNowLane";
import {
  DEFAULT_WATCH_NOW_LANE_CONFIG,
  WatchNowLaneConfig,
} from "./WatchNowLaneConfig";
import { WatchNowSignal } from "./WatchNowSignal";
import { WatchNowSignalType } from "./WatchNowSignalType";

// 칸에 올라간(또는 밀려난) 신호 한 건.
//
// **점수 내역이 없다는 것이 요점이다.** 예전에는 base · positionStake · rarity ·
// favorite · leaderPenalty 를 더한 score 를 들고 다녔다. 그 항목들이 전부 추정이어서
// 폐기했다(WatchNowLaneConfig.ts 머리말). 지금 남은 정량값은 F1 규정이 정한
// `pointsAtStake` 하나뿐이고, 그것도 칸 사이가 아니라 **칸 안에서만** 쓰인다.
export type LaneWatchNowSignal = {
  signal: WatchNowSignal;
  // 실제로 올라간 칸. overflow 항목은 구조상 속했을 칸(선두권 · 필드)을 그대로 들고 있다.
  lane: WatchNowLane;
  // 랭킹 시점 스냅샷 기준 주체 드라이버의 순위. 스냅샷에 없으면 null.
  position: number | null;
  // 상대역의 순위 — 언더컷은 피트인한 뒤차, 간격 수렴은 앞차. 없으면 null.
  rivalPosition: number | null;
  // 이 신호가 걸고 있는 챔피언십 포인트. 칸 안 정렬의 1순위 기준이다.
  pointsAtStake: number;
};

export type WatchNowLaneGroup = {
  lane: WatchNowLane;
  entries: LaneWatchNowSignal[];
  // 칸을 통째로 접는가.
  //
  // **"비었다" 와 다르다.** 즐겨찾기를 설정하지 않았으면 접고(collapsed), 설정했는데
  // 마침 조용하면 비어 있을 뿐 접지 않는다. 화면이 "내 드라이버가 없다" 와 "내 드라이버가
  // 지금 조용하다" 를 다르게 말할 수 있어야 한다.
  collapsed: boolean;
};

export type WatchNowLanes = {
  // 화면 표시 순서 — 선두권 · 필드 · 내 드라이버.
  lanes: WatchNowLaneGroup[];
  // 칸에 올라가지 못한 나머지. 버려지지 않고 순위표 행 표시로 간다(docs/19 수용 기준 7).
  overflow: LaneWatchNowSignal[];
};

export type BuildWatchNowLanesOptions = {
  // 후보 신호들. 보통 selectWatchNowCandidates 의 결과다.
  signals: WatchNowSignal[];
  // 순위와 상대역을 해석할 기준 스냅샷.
  snapshot: LiveRaceSnapshot;
  // **비어 있어도 정상 동작한다.** 비면 내 드라이버 칸이 접힐 뿐 나머지 두 칸은 채워진다
  // (docs/19 수용 기준 1 · 2).
  favoriteDriverNumbers?: number[];
  config?: WatchNowLaneConfig;
};

// 한 드라이버의 한 종류는 후보 창 안에서 한 건이다. 같은 신호가 재발화해도 최신 것만 남긴다.
const toCandidateKey = (signal: WatchNowSignal): string =>
  `${signal.driverNumber}:${signal.type}`;

// 지금 시점에서 "지금 볼 것" 후보로 살아 있는 신호를 고른다.
//
// 감지 신호는 한 프레임의 사건이라 그대로 쓰면 화면이 매 프레임 비워졌다 채워진다.
// 최근 창 안의 신호를 모아 후보로 삼고, 같은 드라이버 · 같은 종류는 최신 1건으로 접는다.
export const selectWatchNowCandidates = (
  signals: WatchNowSignal[],
  atMs: number,
  config: WatchNowLaneConfig = DEFAULT_WATCH_NOW_LANE_CONFIG,
): WatchNowSignal[] => {
  const windowStartMs = atMs - config.candidateWindowMs;
  const latestByKey = new Map<string, WatchNowSignal>();

  for (const signal of signals) {
    const detectedMs = Date.parse(signal.detectedAt);

    if (Number.isNaN(detectedMs) || detectedMs <= windowStartMs || detectedMs > atMs) {
      continue;
    }

    // 입력이 시간순이 아닐 수도 있으므로 더 최신인 것만 덮어쓴다.
    const existing = latestByKey.get(toCandidateKey(signal));

    if (existing !== undefined && Date.parse(existing.detectedAt) >= detectedMs) {
      continue;
    }

    latestByKey.set(toCandidateKey(signal), signal);
  }

  return [...latestByKey.values()];
};

// 신호의 상대역 드라이버 번호를 정한다.
//
// C(언더컷)는 신호 자체가 피트인한 뒤차를 들고 있다. B(간격 수렴)는 들고 있지 않지만
// 상대가 없는 것이 아니라 **바로 앞차**로 정해져 있으므로 스냅샷에서 찾아낸다. 이 해석이
// 없으면 "P10 vs P11" 배틀이 P10 줄 · P11 줄로 두 번 올라가는 것을 막을 수 없다.
// A(타이어) · D(순위 급변)는 단일 드라이버 사건이라 상대역이 없다.
const resolveRivalDriverNumber = (
  signal: WatchNowSignal,
  position: number | null,
  driverNumberByPosition: Map<number, number>,
): number | null => {
  if (signal.type === WatchNowSignalType.UndercutThreat) {
    return signal.rivalDriverNumber;
  }

  if (signal.type === WatchNowSignalType.GapConvergence && position !== null) {
    return driverNumberByPosition.get(position - 1) ?? null;
  }

  return null;
};

// 이 신호에 걸린 챔피언십 포인트를 계산한다 (docs/19 §칸 안에서 무엇을 고를 것인가).
//
// **모든 종류를 같은 단위로 옮긴다** — "자리 하나가 바뀌면 오가는 포인트". 종류마다
// 다른 축을 쓰면 결국 종류 사이 환산율을 지어내야 하고, 그것이 폐기한 기본 점수(50/30)가
// 하던 일이다.
//
//   B 간격 수렴  — 앞차와의 배틀이다. 내 자리와 앞자리가 맞바뀌면 오가는 포인트.
//   C 언더컷 위협 — 피트인한 뒤차와의 배틀이다. 두 실제 순위 사이의 포인트.
//   D 순위 급변  — 이미 일어났다. 실제로 오간 포인트(기준 순위 ↔ 현재 순위).
//   A 타이어 노후 — 상대가 없다. 당장 위태로운 것은 **바로 아래 자리 하나**이므로
//                   내 자리와 아랫자리 사이의 포인트로 잰다. 몇 자리를 잃을지는
//                   데이터에 없으므로 지어내지 않는다.
const resolvePointsAtStake = (
  signal: WatchNowSignal,
  position: number | null,
  rivalPosition: number | null,
): number => {
  if (signal.type === WatchNowSignalType.PositionSwing) {
    return resolvePointsBetweenPositions(signal.positionFrom, signal.positionTo);
  }

  if (signal.type === WatchNowSignalType.UndercutThreat) {
    return resolvePointsBetweenPositions(position, rivalPosition);
  }

  if (position === null) {
    return 0;
  }

  if (signal.type === WatchNowSignalType.GapConvergence) {
    // 선두는 앞차가 없다. 실제 차단은 정규화 층에서 한다 — 선두의
    // `intervalToAheadSeconds` 가 `null` 이므로 감지기가 애초에 발화하지 않는다
    // (OpenF1Normalizer). 여기는 마지막 방어선일 뿐이며, 혹시 신호가 들어오더라도
    // P0 을 포인트로 환산해 25점짜리 배틀을 만들어 내지 않도록 막는다.
    if (position <= 1) {
      return 0;
    }

    return resolvePointsBetweenPositions(position, position - 1);
  }

  return resolvePointsBetweenPositions(position, position + 1);
};

// 구조상 어느 칸에 속하는가 — **주체 드라이버의 현재 순위만으로** 정한다.
//
// 상대역이 다른 칸이어도 옮기지 않는다. 예를 들어 P4 가 P3 를 따라붙는 신호는 주체가
// P4 이므로 필드 칸이다. 근거는 두 가지다.
//   1. 옮기기 시작하면 칸 경계가 경계가 아니게 된다. P1~P3 칸에 P4 · P5 가 섞여 들어오고,
//      같은 배틀이 두 칸을 동시에 주장할 수 있게 된다.
//   2. 옮기지 않아도 정보가 사라지지 않는다. 포디움이 걸린 배틀은 걸린 포인트가 크므로
//      (P3↔P4 는 3점, 대부분의 필드 배틀보다 크다) 필드 칸 **안에서** 위로 올라온다.
//      칸 배정이 아니라 정렬이 그 사실을 표현한다.
//
// 칸 배정이 순위 하나의 함수라는 점이 중요하다. 테스트로 고정할 수 있고 화면에서 예측
// 가능하다.
const resolveStructuralLane = (
  position: number | null,
  config: WatchNowLaneConfig,
): WatchNowLane => {
  if (position !== null && position <= config.leaderLaneMaxPosition) {
    return WatchNowLane.Leader;
  }

  // 순위를 모르는 드라이버도 필드다. 포디움에 있다고 볼 근거가 없으므로 "나머지" 쪽에 둔다.
  return WatchNowLane.Field;
};

// 칸 안 정렬 — 규칙은 둘뿐이다 (docs/19 §칸 안에서 무엇을 고를 것인가).
//
//   1. 걸린 챔피언십 포인트가 큰 것이 먼저다. F1 규정이 정한 값이다.
//   2. 포인트가 같으면 방금 일어난 것이 먼저다.
//
// 세 번째 항목(드라이버 번호)은 순전히 결정론을 위한 것이다. 입력 순서에 따라 결과가
// 흔들리면 회귀 테스트가 성립하지 않는다. 중요도 판단이 아니다.
const compareInLane = (a: LaneWatchNowSignal, b: LaneWatchNowSignal): number => {
  if (a.pointsAtStake !== b.pointsAtStake) {
    return b.pointsAtStake - a.pointsAtStake;
  }

  const timeDelta =
    Date.parse(b.signal.detectedAt) - Date.parse(a.signal.detectedAt);

  if (timeDelta !== 0) {
    return timeDelta;
  }

  return a.signal.driverNumber - b.signal.driverNumber;
};

// 내부 계산용 항목. 칸 배정 전 단계라 즐겨찾기 여부와 상대역 번호를 함께 들고 있다.
type LaneEntry = LaneWatchNowSignal & {
  rivalDriverNumber: number | null;
  isFavorite: boolean;
};

const toPublicEntry = (entry: LaneEntry): LaneWatchNowSignal => ({
  signal: entry.signal,
  lane: entry.lane,
  position: entry.position,
  rivalPosition: entry.rivalPosition,
  pointsAtStake: entry.pointsAtStake,
});

// 한 신호가 화면에서 차지하는 드라이버들 — 주체와 상대역 둘 다.
//
// **상대역까지 세는 것이 핵심이다.** 주체만 세면 한 드라이버가 선두권 칸에서 상대역으로,
// 필드 칸에서 주체로 두 번 뜬다. 실데이터에서 확인됐다(HAD 가 언더컷의 상대역이면서
// 동시에 순위 급변의 주체로 두 줄을 차지했다).
const toOccupiedDrivers = (entry: LaneEntry): number[] => {
  const occupied = [entry.signal.driverNumber];

  if (entry.rivalDriverNumber !== null) {
    occupied.push(entry.rivalDriverNumber);
  }

  return occupied;
};

// 후보 신호를 역할이 고정된 칸 3개로 나눈다.
//
// **LLM 을 쓰지 않는다.** 그리고 **칸 사이 점수 비교도 하지 않는다.** 칸 배정은 순위,
// 칸 안 정렬은 F1 포인트와 시각이 전부다(docs/19-watch-now.md §화면).
export const buildWatchNowLanes = ({
  signals,
  snapshot,
  favoriteDriverNumbers = [],
  config = DEFAULT_WATCH_NOW_LANE_CONFIG,
}: BuildWatchNowLanesOptions): WatchNowLanes => {
  const positionByDriver = new Map<number, number | null>();
  const driverNumberByPosition = new Map<number, number>();

  for (const driver of snapshot.drivers) {
    positionByDriver.set(driver.driverNumber, driver.position);

    if (driver.position !== null) {
      driverNumberByPosition.set(driver.position, driver.driverNumber);
    }
  }

  const favorites = new Set(favoriteDriverNumbers);
  const entries = signals.map((signal): LaneEntry => {
    const position = positionByDriver.get(signal.driverNumber) ?? null;
    const rivalDriverNumber = resolveRivalDriverNumber(
      signal,
      position,
      driverNumberByPosition,
    );
    const rivalPosition =
      rivalDriverNumber === null
        ? null
        : (positionByDriver.get(rivalDriverNumber) ?? null);

    return {
      signal,
      lane: resolveStructuralLane(position, config),
      position,
      rivalPosition,
      rivalDriverNumber,
      pointsAtStake: resolvePointsAtStake(signal, position, rivalPosition),
      isFavorite: favorites.has(signal.driverNumber),
    };
  });

  // **채우는 순서와 보여주는 순서가 다르다.**
  //
  // 보여주는 순서는 선두권 · 필드 · 내 드라이버지만, 채우는 순서는 내 드라이버 · 선두권 ·
  // 필드다. 다양성 캡이 한 드라이버를 한 칸에만 허용하므로 먼저 채우는 칸이 우선권을
  // 갖고, 우선권은 **후보 풀이 좁은 칸**에 준다.
  //
  //   내 드라이버 — 즐겨찾기 1~2명뿐이다. 다른 칸에 뺏기면 칸이 통째로 비고, 사용자가
  //                 직접 고른 드라이버에 대해 빈 칸을 보여주는 것은 이 칸의 존재 이유를
  //                 무너뜨린다.
  //   선두권      — P1~P3 세 명뿐이다.
  //   필드        — P4 이하 열일곱 명. 한 건을 뺏겨도 대체할 후보가 가장 많다.
  //
  // 즉 우선권은 중요도 판단이 아니라 **대체 가능성**으로 정했다. 뺏겨도 채울 수 있는 칸이
  // 양보한다.
  const usedDrivers = new Set<number>();
  const placed = new Set<LaneEntry>();
  const takeLane = (pool: LaneEntry[], lane: WatchNowLane): LaneWatchNowSignal[] => {
    const selected: LaneWatchNowSignal[] = [];

    for (const entry of [...pool].sort(compareInLane)) {
      if (selected.length >= config.maxEntriesPerLane) {
        break;
      }

      const occupied = toOccupiedDrivers(entry);

      if (occupied.some((driverNumber) => usedDrivers.has(driverNumber))) {
        continue;
      }

      for (const driverNumber of occupied) {
        usedDrivers.add(driverNumber);
      }

      placed.add(entry);
      selected.push({ ...toPublicEntry(entry), lane });
    }

    return selected;
  };

  const favoriteEntries = takeLane(
    entries.filter((entry) => entry.isFavorite),
    WatchNowLane.Favorite,
  );
  const leaderEntries = takeLane(
    entries.filter((entry) => entry.lane === WatchNowLane.Leader),
    WatchNowLane.Leader,
  );
  const fieldEntries = takeLane(
    entries.filter((entry) => entry.lane === WatchNowLane.Field),
    WatchNowLane.Field,
  );
  const overflow = entries
    .filter((entry) => !placed.has(entry))
    .sort(compareInLane)
    .map(toPublicEntry);

  return {
    lanes: [
      { lane: WatchNowLane.Leader, entries: leaderEntries, collapsed: false },
      { lane: WatchNowLane.Field, entries: fieldEntries, collapsed: false },
      {
        lane: WatchNowLane.Favorite,
        entries: favoriteEntries,
        // 즐겨찾기가 없으면 접는다. 억지로 채우면 "내 드라이버" 라는 칸의 의미가 무너진다
        // (docs/19 수용 기준 2).
        collapsed: favorites.size === 0,
      },
    ],
    overflow,
  };
};
