import { LaneWatchNowSignal, WatchNowLanes } from "@f1/domain";

// 칸에서 밀려난 신호를 순위표 행에 붙이기 위해 드라이버별로 묶는다
// (docs/19-watch-now.md 수용 기준 7).
//
// **주체 드라이버에만 붙인다. 상대역에는 붙이지 않는다.** 근거는 셋이다.
//
//   1. 신호의 주인이 주체다. 도메인이 `driverNumber` 를 "알림을 받아야 할 드라이버" 로
//      정의하고 있고, 칸도 같은 기준으로 한 줄만 그린다. 행에서만 둘로 늘리면 행 표시가
//      칸보다 무거워져 "조용히 표시한다" 는 전제가 뒤집힌다.
//   2. 상대역은 이미 문장 안에 있다. "VER — HAM 피트인" 처럼 요약이 상대 코드를 담고
//      있어 주체 행 하나로 양쪽을 다 읽을 수 있다.
//   3. 배틀 한 건이 점 두 개가 된다. 실측에서 프레임의 44.6% 가 overflow 를 내므로
//      양쪽에 붙이면 순위표에 점이 깔려, 훑을 때 안 보이고 찾으면 보이는 밀도가 깨진다.
//
// 한 드라이버에 여러 건이면 도메인이 이미 정렬해 준 순서(걸린 포인트 → 최신)를 그대로
// 유지한다. 여기서 다시 정렬하지 않는다 — 정렬 기준이 두 곳에 생기면 갈라진다.
export const groupWatchNowOverflowByDriver = (
  lanes: WatchNowLanes | null,
): Map<number, LaneWatchNowSignal[]> => {
  const grouped = new Map<number, LaneWatchNowSignal[]>();

  if (lanes === null) {
    return grouped;
  }

  for (const entry of lanes.overflow) {
    const existing = grouped.get(entry.signal.driverNumber);

    if (existing === undefined) {
      grouped.set(entry.signal.driverNumber, [entry]);

      continue;
    }

    existing.push(entry);
  }

  return grouped;
};
