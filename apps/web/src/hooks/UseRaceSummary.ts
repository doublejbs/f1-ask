"use client";

import { LiveRaceState } from "@/hooks/UseLiveRace";
import { SessionStatus, SupportedLocale } from "@f1/domain";
import { parseRaceSummaryResponse, type RaceSummaryResponse } from "@f1/schemas";
import { useEffect, useRef, useState } from "react";

// 경기 종료 요약 훅.
// 세션이 finished 상태가 되면 서버에 요약을 1회 요청한다.
// (세션 + locale 조합당 1회. 진행 중 상태로 돌아가면 초기화한다.)
export const useRaceSummary = (
  race: LiveRaceState | null,
  locale: SupportedLocale,
): RaceSummaryResponse | null => {
  const [summary, setSummary] = useState<RaceSummaryResponse | null>(null);
  const fetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (race === null) {
      return;
    }

    if (race.snapshot.status !== SessionStatus.Finished) {
      if (fetchedKeyRef.current !== null) {
        fetchedKeyRef.current = null;
        setSummary(null);
      }

      return;
    }

    const key = `${race.snapshot.sessionId}:${locale}`;

    if (fetchedKeyRef.current === key) {
      return;
    }

    fetchedKeyRef.current = key;

    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetch("/api/summary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            locale,
            snapshot: race.snapshot,
            events: race.events,
          }),
        });

        if (!response.ok) {
          return;
        }

        const parsed = parseRaceSummaryResponse(await response.json());

        if (!cancelled) {
          setSummary(parsed);
        }
      } catch {
        // 요약 실패는 non-fatal.
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [race, locale]);

  return summary;
};
