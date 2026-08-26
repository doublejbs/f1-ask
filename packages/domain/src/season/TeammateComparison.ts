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

const aggregate = (
  results: OpenF1SessionResult[],
): Omit<TeammateSeasonStats, "headToHead"> => {
  let points = 0;
  let wins = 0;
  let podiums = 0;

  for (const result of results) {
    points += result.points ?? 0;

    // 실격은 우승·포디움 집계에서 제외한다(포인트는 응답값을 그대로 합산).
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

  return { points, wins, podiums };
};

// 두 드라이버의 레이스 결과 배열(이미 결승만으로 필터됨) → 각자의 시즌 지표 + 헤드투헤드.
export const computeTeammateComparison = (
  aResults: OpenF1SessionResult[],
  bResults: OpenF1SessionResult[],
): { a: TeammateSeasonStats; b: TeammateSeasonStats } => {
  const aAgg = aggregate(aResults);
  const bAgg = aggregate(bResults);

  const bBySession = new Map<number, OpenF1SessionResult>();
  for (const result of bResults) {
    if (result.session_key !== undefined) {
      bBySession.set(result.session_key, result);
    }
  }

  let aAhead = 0;
  let bAhead = 0;

  for (const result of aResults) {
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
    a: { ...aAgg, headToHead: aAhead },
    b: { ...bAgg, headToHead: bAhead },
  };
};
