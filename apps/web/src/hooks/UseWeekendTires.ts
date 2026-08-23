"use client";

import { WeekendTireUsage } from "@f1/domain";
import { parseWeekendTireUsage } from "@f1/schemas";
import { useEffect, useState } from "react";

export type WeekendTiresState = {
  usage: WeekendTireUsage | null;
  isLoading: boolean;
  hasError: boolean;
};

// 주말 타이어 사용 (docs/29). meetingKey 가 null 이면(상세 미선택) 조회하지 않는다.
// 상세가 열릴 때만 지연 로드해 목록 렌더에 부담을 주지 않는다.
export const useWeekendTires = (
  meetingKey: number | null,
): WeekendTiresState => {
  const [usage, setUsage] = useState<WeekendTireUsage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (meetingKey === null) {
      setUsage(null);
      setHasError(false);

      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setHasError(false);
    setUsage(null);

    void (async () => {
      try {
        const response = await fetch(`/api/archive/weekend/${meetingKey}`);

        if (!response.ok) {
          throw new Error(`weekend tires failed: ${response.status}`);
        }

        const parsed = parseWeekendTireUsage(await response.json());

        if (!cancelled) {
          setUsage(parsed);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingKey]);

  return { usage, isLoading, hasError };
};
