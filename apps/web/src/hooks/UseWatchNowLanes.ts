"use client";

import {
  DEFAULT_WATCH_NOW_LANE_CONFIG,
  LiveRaceSnapshot,
  SessionStatus,
  WatchNowFeed,
  WatchNowLaneConfig,
  WatchNowLanes,
} from "@f1/domain";
import { useMemo, useRef } from "react";

// 칸 하나에 올릴 최대 줄 수 — **화면에서 조절하는 값이라 여기에 둔다.**
//
// 값은 2 이며 **도메인 기본값과 일부러 같게 맞춰 뒀다**(WatchNowLaneConfig.ts). 여기에
// 숫자를 따로 적으면 도메인 기본값과 웹 상수가 조용히 어긋나서, 훅을 거치지 않는 경로와
// 화면이 서로 다른 줄 수로 도는 혼란이 생긴다. 그래서 리터럴 대신 기본값을 참조한다 —
// 줄 수를 바꿀 자리는 도메인 상수 한 곳뿐이다.
//
// 왜 2 인가(375×812 실측): 3 줄이면 섹션이 399~421px 로 뷰포트 절반을 먹어 순위표가
// 2~4행만 남고, 2 줄이면 311px 로 순위표 5행이 확보된다. 순위표가 이 앱의 본체이므로
// 그쪽에 자리를 준다. 자세한 근거는 도메인 상수 주석에 있다.
//
// 이 별칭을 남겨 두는 이유는 화면 쪽에서 실험할 때(docs/19 "임계값은 설정으로 뺀다"와
// 같은 이유) 훅 인자로 덮어쓸 수 있는 기본값 자리가 필요하기 때문이다.
export const WATCH_NOW_ENTRIES_PER_LANE =
  DEFAULT_WATCH_NOW_LANE_CONFIG.maxEntriesPerLane;

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
  favoriteDriverNumbers: number[];
  maxEntriesPerLane?: number;
};

// "지금 볼 것" 칸 3개를 만든다. 레이스 중이 아니면 null 을 돌려준다.
//
// **감지기 수명이 이 훅의 전부다.** `WatchNowFeed` 는 프레임 간 상태를 들고 있어서
// 리렌더마다 새로 만들면 감지가 아예 동작하지 않는다(스틴트당 1회 · 연속 3회 유지 ·
// 순위 기준점이 전부 날아간다). 그래서 인스턴스를 ref 에 붙들어 컴포넌트 수명 동안
// 유지한다.
//
// 관측을 useEffect 가 아니라 useMemo 에서 하는 이유: 이펙트로 미루면 첫 프레임의 칸이
// 한 박자 늦게 그려져 렌더가 두 번 돈다. 부수효과를 렌더 중에 두는 것이 위험한 이유는
// 중복 호출인데, `WatchNowFeed.observe` 가 프레임 식별자로 중복을 스스로 막으므로
// (StrictMode 이중 렌더 · useMemo 캐시 폐기 모두) 여기서는 안전하다. 그 보장이
// WatchNowFeed.test.ts 로 고정돼 있다.
export const useWatchNowLanes = ({
  snapshot,
  favoriteDriverNumbers,
  maxEntriesPerLane = WATCH_NOW_ENTRIES_PER_LANE,
}: UseWatchNowLanesOptions): WatchNowLanes | null => {
  const feedRef = useRef<WatchNowFeed | null>(null);
  // 렌더 중에 읽는 최신 즐겨찾기. 배열은 매 렌더 identity 가 바뀌므로 의존성에는
  // 아래의 문자열 키를 쓰고, 실제 값은 여기서 꺼낸다.
  const favoritesRef = useRef(favoriteDriverNumbers);

  favoritesRef.current = favoriteDriverNumbers;

  const laneConfig = useMemo(
    (): WatchNowLaneConfig => ({
      ...DEFAULT_WATCH_NOW_LANE_CONFIG,
      maxEntriesPerLane,
    }),
    [maxEntriesPerLane],
  );

  const configRef = useRef<WatchNowLaneConfig | null>(null);

  // 설정이 바뀌면 인스턴스를 새로 만든다. 조절용 상수라 런타임에 바뀌는 일은 없지만,
  // 바뀌었는데 옛 설정으로 계속 도는 것보다는 감지 상태를 잃는 편이 낫다.
  if (feedRef.current === null || configRef.current !== laneConfig) {
    feedRef.current = new WatchNowFeed({ laneConfig });
    configRef.current = laneConfig;
  }

  const feed = feedRef.current;
  // 배열 identity 대신 내용으로 의존한다 — 그러지 않으면 매 렌더 재계산되어
  // 칸 객체가 새로 만들어지고 아래 컴포넌트가 통째로 재조정된다.
  const favoritesKey = favoriteDriverNumbers.join(",");

  return useMemo(() => {
    feed.observe(snapshot);

    if (!isWatchNowVisibleStatus(snapshot.status)) {
      return null;
    }

    return feed.buildLanes(snapshot, favoritesRef.current);
    // favoritesKey 가 favoritesRef.current 의 내용을 대표한다.
  }, [feed, snapshot, favoritesKey]);
};
