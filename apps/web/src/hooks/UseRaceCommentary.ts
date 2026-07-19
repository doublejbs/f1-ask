"use client";

import { LiveRaceState } from "@/hooks/UseLiveRace";
import {
  AiCommentary,
  DEFAULT_COMMENTARY_LIMIT,
  ExplanationLevel,
  selectCommentaryEvents,
  SupportedLocale,
} from "@f1/domain";
import { parseAiCommentaryList } from "@f1/schemas";
import { useEffect, useRef, useState } from "react";

// AI 자동 해설 훅.
// 이벤트 스트림에서 해설 대상(high/critical)을 감지해, 아직 요청하지 않은
// 이벤트만 서버 AI Gateway(/api/commentary)로 보내 해설을 누적한다.
// 중요 이벤트는 드물어 요청 빈도가 낮다.
export const useRaceCommentary = (
  race: LiveRaceState | null,
  locale: SupportedLocale,
  explanationLevel: ExplanationLevel,
): AiCommentary[] => {
  const [items, setItems] = useState<AiCommentary[]>([]);
  const requestedRef = useRef<Set<string>>(new Set());
  const variantRef = useRef<string>(`${locale}:${explanationLevel}`);

  useEffect(() => {
    // locale 또는 설명 수준 변경 시 기존 해설을 비우고 다시 생성한다.
    const variant = `${locale}:${explanationLevel}`;

    if (variantRef.current !== variant) {
      variantRef.current = variant;
      requestedRef.current = new Set();
      setItems([]);
    }
  }, [locale, explanationLevel]);

  useEffect(() => {
    if (race === null) {
      return;
    }

    const eligible = selectCommentaryEvents(race.events, DEFAULT_COMMENTARY_LIMIT);
    const fresh = eligible.filter(
      (event) => !requestedRef.current.has(event.id),
    );

    if (fresh.length === 0) {
      return;
    }

    fresh.forEach((event) => requestedRef.current.add(event.id));

    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetch("/api/commentary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            locale,
            explanationLevel,
            snapshot: race.snapshot,
            events: fresh,
          }),
        });

        if (!response.ok) {
          return;
        }

        const generated = parseAiCommentaryList(await response.json());

        if (cancelled) {
          return;
        }

        setItems((previous) => {
          const byId = new Map(previous.map((item) => [item.id, item]));

          for (const item of generated) {
            byId.set(item.id, item);
          }

          return Array.from(byId.values()).slice(-DEFAULT_COMMENTARY_LIMIT);
        });
      } catch {
        // 해설 실패는 non-fatal — 경기 화면에 영향을 주지 않는다.
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [race, locale, explanationLevel]);

  return items;
};
