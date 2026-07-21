"use client";

import { getWatchNowDetectorConfig } from "@/lib/Env";
import { LiveRaceSnapshot, SessionStatus, WatchNowFeed, WatchNowLanes } from "@f1/domain";
import { useMemo, useRef } from "react";

// 레이스가 진행 중일 때만 "지금 볼 것"이 의미를 갖는다.
//
// 예정 · 종료 · 알 수 없음에서는 감지기 자체가 아무것도 내지 않으므로 칸이 전부 비는데,
// 끝난 경기에 "지금은 조용함"을 띄우는 것은 거짓말이다. 적색기 · 중단은 전 차량이
// 피트레인에 서 있어 간격 · 순위가 레이스 상황을 뜻하지 않는다.
const isWatchNowVisibleStatus = (status: SessionStatus): boolean =>
  status === SessionStatus.Green ||
  status === SessionStatus.Yellow ||
  status === SessionStatus.SafetyCar ||
  status === SessionStatus.VirtualSafetyCar;

export type UseWatchNowLanesOptions = {
  snapshot: LiveRaceSnapshot;
  // **호출자가 identity 를 고정해서 넘겨야 한다.** 이 배열은 아래 useMemo 의 의존성이라
  // 매 렌더 새 배열을 만들면 프레임과 무관하게 칸이 재계산되고 아래 컴포넌트가 통째로
  // 재조정된다. `LiveDashboardView` 가 useMemo 로 고정해 넘긴다.
  favoriteDriverNumbers: number[];
};

// "지금 볼 것" 칸 3개를 만든다. 레이스 중이 아니면 null 을 돌려준다.
//
// **감지기 수명이 이 훅의 전부다.** `WatchNowFeed` 는 프레임 간 상태를 들고 있어서
// 리렌더마다 새로 만들면 감지가 아예 동작하지 않는다(스틴트당 1회 · 연속 3회 유지 ·
// 순위 기준점이 전부 날아간다). 그래서 인스턴스를 ref 에 붙들어 컴포넌트 수명 동안
// 유지한다. 설정은 환경변수라 번들에 인라인된 상수이므로 런타임에 바뀌지 않는다 —
// 인스턴스를 다시 만드는 경로가 아예 없다.
//
// 관측을 useEffect 가 아니라 useMemo 에서 하는 이유: 이펙트로 미루면 첫 프레임의 칸이
// 한 박자 늦게 그려져 렌더가 두 번 돈다. 부수효과를 렌더 중에 두는 것이 위험한 이유는
// 중복 호출인데, `WatchNowFeed.observe` 가 프레임 식별자로 중복을 스스로 막으므로
// (StrictMode 이중 렌더 · useMemo 캐시 폐기 모두) 여기서는 안전하다. 그 보장이
// WatchNowFeed.test.ts 로 고정돼 있다.
export const useWatchNowLanes = ({
  snapshot,
  favoriteDriverNumbers,
}: UseWatchNowLanesOptions): WatchNowLanes | null => {
  const feedRef = useRef<WatchNowFeed | null>(null);

  if (feedRef.current === null) {
    feedRef.current = new WatchNowFeed({
      detectorConfig: getWatchNowDetectorConfig(),
    });
  }

  const feed = feedRef.current;

  return useMemo(() => {
    feed.observe(snapshot);

    if (!isWatchNowVisibleStatus(snapshot.status)) {
      return null;
    }

    return feed.buildLanes(snapshot, favoriteDriverNumbers);
  }, [feed, snapshot, favoriteDriverNumbers]);
};
