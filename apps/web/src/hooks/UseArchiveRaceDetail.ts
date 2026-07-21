"use client";

import { ArchiveRaceDetail } from "@f1/domain";
import { parseArchiveRaceDetail } from "@f1/schemas";
import { useCallback, useEffect, useState } from "react";

export type ArchiveRaceDetailState = {
  detail: ArchiveRaceDetail | null;
  isLoading: boolean;
  // 상세도 목록과 독립된 오류 상태를 갖는다.
  hasError: boolean;
  retry: () => void;
};

// 완료 레이스 상세. sessionKey 가 null 이면(목록 화면) 아무것도 조회하지 않는다.
export const useArchiveRaceDetail = (
  sessionKey: number | null,
): ArchiveRaceDetailState => {
  const [detail, setDetail] = useState<ArchiveRaceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  useEffect(() => {
    if (sessionKey === null) {
      setDetail(null);
      setHasError(false);

      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setHasError(false);
    setDetail(null);

    void (async () => {
      try {
        const response = await fetch(`/api/archive/races/${sessionKey}`);

        if (!response.ok) {
          throw new Error(`archive detail failed: ${response.status}`);
        }

        const parsed = parseArchiveRaceDetail(await response.json());

        if (!cancelled) {
          setDetail(parsed);
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
  }, [sessionKey, attempt]);

  return { detail, isLoading, hasError, retry };
};
