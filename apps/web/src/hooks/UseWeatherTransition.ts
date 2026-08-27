"use client";

import {
  LiveRaceSnapshot,
  WeatherTransition,
  WeatherTransitionTracker,
} from "@f1/domain";
import { useMemo, useRef } from "react";

// 날씨 전환 배너 상태 (B3). 트래커는 프레임 간 상태(이전 rainfall·마지막 전환)를 들고
// 있어야 하므로 ref 에 붙들어 컴포넌트 수명 동안 유지한다(WatchNow 훅과 같은 이유).
// 관측을 useMemo 에서 하는 것도 같은 이유 — 이펙트로 미루면 한 박자 늦는다. 트래커는
// 세션 전환·랩 창을 스스로 처리하므로 여러 번 불려도 안전하다.
export const useWeatherTransition = (
  snapshot: LiveRaceSnapshot | null,
): WeatherTransition | null => {
  const trackerRef = useRef<WeatherTransitionTracker | null>(null);

  if (trackerRef.current === null) {
    trackerRef.current = new WeatherTransitionTracker();
  }

  const tracker = trackerRef.current;

  return useMemo(() => {
    if (snapshot === null) {
      return null;
    }

    return tracker.observe(snapshot);
  }, [tracker, snapshot]);
};
