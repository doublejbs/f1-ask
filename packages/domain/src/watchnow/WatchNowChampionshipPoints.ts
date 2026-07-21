// F1 규정이 정한 레이스 완주 챔피언십 포인트 (docs/19-watch-now.md §칸 안에서 무엇을
// 고를 것인가).
//
// **이 파일의 값만은 지어낸 것이 아니다.** P1 부터 P10 까지 25/18/15/12/10/8/6/4/2/1 이고
// P11 이하는 0 이다. 규칙이지 취향이 아니므로 칸 안 정렬의 유일한 정량 기준으로 쓴다.
//
// 초기 구현은 이 자리에 "포디움 경계 18 · 포인트권 경계 15 · 점수권 8" 같은 등급 상수를
// 두었다. 전부 추정이었고, 그래서 P16 언더컷이 선두 탈환보다 위에 오는 결과가 나왔다.
// 등급을 버리고 실제 포인트 차로 대체한 이유가 이것이다.
export const F1_RACE_POINTS_BY_POSITION: readonly number[] = [
  25, 18, 15, 12, 10, 8, 6, 4, 2, 1,
];

// 한 자리가 가진 포인트. 포인트권 밖 · 순위 불명은 0 이다(배제가 아니라 가산 0).
export const resolveChampionshipPoints = (position: number | null): number => {
  if (position === null || position < 1) {
    return 0;
  }

  return F1_RACE_POINTS_BY_POSITION[position - 1] ?? 0;
};

// 두 자리가 맞바뀔 때 오가는 포인트 — 이것이 "걸린 포인트" 다.
//
// P1↔P2 는 7점, P10↔P11 은 1점, P16↔P17 은 0점이다. 방향은 보지 않는다. 뺏는 쪽과
// 뺏기는 쪽은 같은 배틀이고 같은 만큼이 걸려 있다.
export const resolvePointsBetweenPositions = (
  from: number | null,
  to: number | null,
): number => {
  if (from === null || to === null) {
    return 0;
  }

  return Math.abs(resolveChampionshipPoints(from) - resolveChampionshipPoints(to));
};
