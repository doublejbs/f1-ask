"use client";

import { LiveRaceState } from "@/hooks/UseLiveRace";
import { getDataMode, getLiveSessionId } from "@/lib/Env";
import {
  AiCommentary,
  DataMode,
  DEFAULT_COMMENTARY_LIMIT,
  ExplanationLevel,
  selectCommentaryEvents,
  SupportedLocale,
} from "@f1/domain";
import { parseAiCommentaryList } from "@f1/schemas";
import { useEffect, useRef, useState } from "react";

// live 모드 해설 구독 한도. 해설은 `allEvents`(60 건)에 결합되고, 그 창을 벗어난
// 해설은 attachCommentary 가 어차피 버린다. 따라서 60 이면 최악의 경우(창 안의
// 모든 이벤트가 해설 대상)까지 덮으면서 그 이상은 받지 않는다.
const LIVE_COMMENTARY_LIMIT = 60;

// AI 자동 해설 훅.
//
// 모드에 따라 출처가 갈린다 (docs/18-ai-commentary-worker.md §클라이언트).
// - live: 폴러 워커가 Firestore 에 써 둔 해설을 구독한다. LLM 을 직접 부르지 않아
//   비용이 시청자 수와 무관하게 레이스당 고정이다.
// - mock · replay: 워커가 없어 Firestore 에 해설이 없다. 기존 /api/commentary
//   POST 경로를 그대로 쓴다 — 로컬 개발이 이 경로에 의존한다.
//
// 어느 쪽이든 해설이 없으면 그냥 비어 있다. 로딩 상태를 두지 않는 것은 의도다 —
// 워커가 아직 안 만들었거나 요청한 변형(locale × 설명수준)이 생성 대상이 아닐 수
// 있고, 그때 이벤트는 정상 노출되어야 하기 때문이다 (docs/18 §폴백).
export const useRaceCommentary = (
  race: LiveRaceState | null,
  locale: SupportedLocale,
  explanationLevel: ExplanationLevel,
): AiCommentary[] => {
  const [items, setItems] = useState<AiCommentary[]>([]);
  const requestedRef = useRef<Set<string>>(new Set());
  const variantRef = useRef<string>(`${locale}:${explanationLevel}`);
  const isLiveMode = getDataMode() === DataMode.Live;

  useEffect(() => {
    // locale 또는 설명 수준 변경 시 기존 해설을 비운다. 변형이 다르면 문서도 다르므로
    // 이전 변형의 문장이 잠시라도 남으면 안 된다.
    const variant = `${locale}:${explanationLevel}`;

    if (variantRef.current !== variant) {
      variantRef.current = variant;
      requestedRef.current = new Set();
      setItems([]);
    }
  }, [locale, explanationLevel]);

  // live 경로 — Firestore 구독.
  useEffect(() => {
    if (!isLiveMode) {
      return;
    }

    let cancelled = false;
    let dispose = () => {};

    void (async () => {
      const { FirestoreCommentaryRepository } = await import(
        "@/firebase/FirestoreCommentaryRepository"
      );

      if (cancelled) {
        return;
      }

      const repository = new FirestoreCommentaryRepository();

      // race 를 의존성에 넣지 않는다. 프레임마다 구독을 다시 붙이면 워커가
      // 뒤늦게 쓴 해설을 받기도 전에 리스너가 끊긴다.
      dispose = repository.subscribeCommentary(
        getLiveSessionId(),
        locale,
        explanationLevel,
        LIVE_COMMENTARY_LIMIT,
        (next) => {
          if (cancelled) {
            return;
          }

          setItems(next);
        },
      );
    })();

    return () => {
      cancelled = true;
      dispose();
    };
  }, [isLiveMode, locale, explanationLevel]);

  // mock · replay 경로 — 새 해설 대상 이벤트만 서버 AI Gateway 로 보내 누적한다.
  useEffect(() => {
    if (isLiveMode || race === null) {
      return;
    }

    // AI 컨텍스트는 우선순위로 거르지 않은 전체 배열을 받는다 (docs/10-race-events.md).
    const eligible = selectCommentaryEvents(
      race.allEvents,
      DEFAULT_COMMENTARY_LIMIT,
    );
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
  }, [isLiveMode, race, locale, explanationLevel]);

  return items;
};
