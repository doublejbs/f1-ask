import { OpenF1SessionResult } from "../openf1/OpenF1Types";

// 팀메이트 시즌 실적 비교 집계 (docs 계획 §Phase 3). 순수 함수 — 레이스 session_result 행만
// 받아 지표를 낸다. 지표: 포인트(Σ)·우승(P1)·포디움(P≤3)·헤드투헤드(공통 레이스 앞선 횟수).

export type TeammateSeasonStats = {
  points: number;
  wins: number;
  podiums: number;
  // 두 선수가 모두 분류된 레이스에서 상대보다 앞선 횟수.
  headToHead: number;
};

// 완주 순위 랭크 — 낮을수록 앞. position 이 없으면(미분류) 맨 뒤로 둔다.
const finishRank = (result: OpenF1SessionResult): number =>
  result.position ?? Number.POSITIVE_INFINITY;

// 결승 결과만으로 우승·포디움을 센다(스프린트 제외 — "우승/포디움"은 그랑프리 결승 기준).
const aggregateRace = (
  raceResults: OpenF1SessionResult[],
): { wins: number; podiums: number } => {
  let wins = 0;
  let podiums = 0;

  for (const result of raceResults) {
    // 실격은 우승·포디움에서 제외한다.
    if (result.dsq) {
      continue;
    }

    if (result.position === 1) {
      wins += 1;
    }

    if (result.position !== null && result.position <= 3) {
      podiums += 1;
    }
  }

  return { wins, podiums };
};

// **포인트는 챔피언십 기준**이라 결승 + 스프린트를 모두 합산한다(스프린트도 포인트를 준다).
const sumPoints = (results: OpenF1SessionResult[]): number =>
  results.reduce((total, result) => total + (result.points ?? 0), 0);

// 두 드라이버의 시즌 결과 → 지표 + 헤드투헤드.
//  raceResults: 결승만(우승·포디움·헤드투헤드).
//  pointsResults: 포인트를 주는 세션 전부(결승 + 스프린트) — 챔피언십 포인트 합산용.
export const computeTeammateComparison = (
  a: { raceResults: OpenF1SessionResult[]; pointsResults: OpenF1SessionResult[] },
  b: { raceResults: OpenF1SessionResult[]; pointsResults: OpenF1SessionResult[] },
): { a: TeammateSeasonStats; b: TeammateSeasonStats } => {
  const aAgg = aggregateRace(a.raceResults);
  const bAgg = aggregateRace(b.raceResults);

  const bBySession = new Map<number, OpenF1SessionResult>();
  for (const result of b.raceResults) {
    if (result.session_key !== undefined) {
      bBySession.set(result.session_key, result);
    }
  }

  let aAhead = 0;
  let bAhead = 0;

  for (const result of a.raceResults) {
    if (result.session_key === undefined) {
      continue;
    }

    const counterpart = bBySession.get(result.session_key);
    if (counterpart === undefined) {
      continue;
    }

    const aRank = finishRank(result);
    const bRank = finishRank(counterpart);

    if (aRank < bRank) {
      aAhead += 1;
    } else if (bRank < aRank) {
      bAhead += 1;
    }
  }

  return {
    a: { points: sumPoints(a.pointsResults), ...aAgg, headToHead: aAhead },
    b: { points: sumPoints(b.pointsResults), ...bAgg, headToHead: bAhead },
  };
};
