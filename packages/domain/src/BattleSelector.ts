import { Battle } from "./Battle";
import { LiveDriverState } from "./LiveDriverState";
import { LiveRaceSnapshot } from "./LiveRaceSnapshot";

// position 이 확정된 드라이버. 정렬·인접 판정에서 null 분기를 없앤다.
type RankedDriver = LiveDriverState & { position: number };

// 배틀 후보 판정 임계값(초). 인접 쌍의 간격이 이 값 미만이면 접전으로 본다.
export const BATTLE_GAP_THRESHOLD_SECONDS = 1.5;

// DRS 사정권 임계값(초). 간격이 이 값 미만이면 DRS 범위로 표시한다.
export const DRS_RANGE_THRESHOLD_SECONDS = 1.0;

// 순위 인접 쌍 중 간격이 좁은 접전을 골라 배틀 목록으로 만든다.
// snapshot 에서 계산하지 않고 "선택·투영"만 하는 순수 함수다(예외 없음).
export const selectBattles = (
  snapshot: LiveRaceSnapshot,
  limit: number,
): Battle[] => {
  // position 이 있는 드라이버만 순위 오름차순으로 정렬한다.
  const ranked = snapshot.drivers
    .filter((driver): driver is RankedDriver => driver.position !== null)
    .sort((a, b) => a.position - b.position);

  const battles: Battle[] = [];

  for (let index = 1; index < ranked.length; index += 1) {
    const chasingDriver = ranked[index];
    const aheadDriver = ranked[index - 1];

    if (chasingDriver === undefined || aheadDriver === undefined) {
      continue;
    }

    // 정렬 배열의 이웃이 실제로 포지션상 인접(P_n ↔ P_n+1)일 때만 배틀로 본다.
    // 포지션에 구멍이 있으면(예: P2 결번으로 P1·P3 이 이웃이 되는 경우) 인접 쌍이 아니다.
    if (aheadDriver.position !== chasingDriver.position - 1) {
      continue;
    }

    // 뒤차의 앞차 간격이 곧 두 차 사이의 간격이다. 없으면 판정할 수 없다.
    const gapSeconds = chasingDriver.intervalToAheadSeconds;

    if (gapSeconds === null) {
      continue;
    }

    // 리타이어·피트인 드라이버가 낀 쌍은 배틀로 보지 않는다.
    if (
      chasingDriver.retired ||
      chasingDriver.inPit ||
      aheadDriver.retired ||
      aheadDriver.inPit
    ) {
      continue;
    }

    // 1.5초 이상 벌어졌으면 접전이 아니다.
    if (gapSeconds >= BATTLE_GAP_THRESHOLD_SECONDS) {
      continue;
    }

    battles.push({
      aheadDriver,
      chasingDriver,
      gapSeconds,
      isDrsRange: gapSeconds < DRS_RANGE_THRESHOLD_SECONDS,
    });
  }

  // 간격이 좁은 순으로 상위 limit 쌍만 남긴다.
  return battles
    .sort((a, b) => a.gapSeconds - b.gapSeconds)
    .slice(0, Math.max(0, limit));
};
