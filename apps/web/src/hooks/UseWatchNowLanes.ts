"use client";

import { getWatchNowDetectorConfig } from "@/lib/Env";
import {
  loadWatchNowHistory,
  saveWatchNowHistory,
} from "@/lib/WatchNowHistoryStorage";
import {
  LiveRaceSnapshot,
  SessionStatus,
  WatchNowFeed,
  WatchNowLanes,
  WatchNowSignal,
} from "@f1/domain";
import { useMemo, useRef } from "react";

export type WatchNowView = {
  lanes: WatchNowLanes;
  // 경기 시작부터의 지난 신호(최신 먼저, 중복 제거). 화면이 접힘=5개/펼침=전체로 자른다(B4).
  history: WatchNowSignal[];
};

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
}: UseWatchNowLanesOptions): WatchNowView | null => {
  const feedRef = useRef<WatchNowFeed | null>(null);
  // 마지막으로 저장/복원에 쓴 세션 id. 경기가 바뀌면 그 세션의 저장 기록으로 갈아끼운다.
  const sessionRef = useRef<string | null>(null);
  // 마지막으로 localStorage 에 쓴 이력 길이. 이력이 늘었을 때만 직렬화해 매 프레임 낭비를 막는다.
  const savedLengthRef = useRef(0);

  if (feedRef.current === null) {
    const feed = new WatchNowFeed({
      detectorConfig: getWatchNowDetectorConfig(),
    });
    // 새 인스턴스(첫 렌더·PWA 재시작)면 이 세션의 저장 기록을 먼저 복원한다 — 그래야 껐다
    // 켜도 "그동안 나온 모든 기록"이 더보기에 그대로 남는다. 아직 아무 프레임도 관측하지
    // 않았으므로(lastSessionId=null) 첫 observe 가 이 복원본을 리셋하지 않는다.
    const restored = loadWatchNowHistory(snapshot.sessionId);
    if (restored.length > 0) {
      feed.hydrateHistory(restored);
    }
    feedRef.current = feed;
    sessionRef.current = snapshot.sessionId;
    savedLengthRef.current = feed.exportHistory().length;
  }

  const feed = feedRef.current;

  return useMemo(() => {
    // 세션(경기)이 바뀌면 feed.observe 가 내부에서 reset 하므로, 관측 뒤 새 세션의 저장
    // 기록을 복원해 이번 프레임 신호 앞에 이어 붙인다.
    const sessionChanged =
      sessionRef.current !== null && sessionRef.current !== snapshot.sessionId;

    feed.observe(snapshot);

    if (sessionChanged) {
      const restored = loadWatchNowHistory(snapshot.sessionId);
      if (restored.length > 0) {
        feed.hydrateHistory([...restored, ...feed.exportHistory()]);
      }
      sessionRef.current = snapshot.sessionId;
      savedLengthRef.current = 0;
    }

    // 이력이 실제로 늘었을 때만 저장한다(중복 제거된 새 발화가 생겼을 때). 매 폴링마다
    // 수백 개를 직렬화하지 않게 하는 최적화다.
    const current = feed.exportHistory();
    if (current.length !== savedLengthRef.current) {
      saveWatchNowHistory(snapshot.sessionId, current);
      savedLengthRef.current = current.length;
    }

    if (!isWatchNowVisibleStatus(snapshot.status)) {
      return null;
    }

    return {
      lanes: feed.buildLanes(snapshot, favoriteDriverNumbers),
      history: feed.allHistory(),
    };
  }, [feed, snapshot, favoriteDriverNumbers]);
};
