"use client";

import { getDataMode, getLiveSessionId } from "@/lib/Env";
import {
  DataFreshnessStatus,
  DataMode,
  DEFAULT_MOCK_SCENARIO,
  getFreshness,
  getFreshnessFromTimestamp,
  LiveRaceSnapshot,
  MockRaceEngine,
  OpenF1Recording,
  OpenF1ReplaySource,
  RaceDataSource,
  RaceEvent,
} from "@f1/domain";
import { useEffect, useState } from "react";

const TICK_INTERVAL_MS = 500;
const LOOP_PAUSE_SECONDS = 5;
// Replay(실제 OpenF1 녹화)는 ~160분 레이스라 시간 압축해 몇 분 안에 재생한다.
const OPENF1_REPLAY_SPEED = 40;
const LIVE_EVENT_LIMIT = 20;

export type LiveRaceState = {
  snapshot: LiveRaceSnapshot;
  events: RaceEvent[];
  freshness: DataFreshnessStatus;
};

type SourceBundle = {
  source: RaceDataSource;
  speed: number;
};

// 데이터 모드에 맞는 소스를 만든다.
// - Mock: 실시간 시뮬레이션 (1x)
// - Replay: 실제 OpenF1 과거 세션 녹화 재생 (시간 압축)
// - Live: 미연동 → Mock 폴백
const createSource = async (
  mode: DataMode,
  startEpochMs: number,
): Promise<SourceBundle> => {
  if (mode === DataMode.Replay) {
    // fixture 는 public/ 에서 런타임 fetch (번들·타입 부담 없이 lazy 로드).
    const response = await fetch("/openf1-singapore-2023.json");
    const recording = (await response.json()) as OpenF1Recording;

    return {
      source: new OpenF1ReplaySource(recording, startEpochMs),
      speed: OPENF1_REPLAY_SPEED,
    };
  }

  return {
    source: new MockRaceEngine(DEFAULT_MOCK_SCENARIO, startEpochMs),
    speed: 1,
  };
};

// 라이브 경기 훅. 소스 종류와 무관하게 동일한 tick 루프로 프레임을 렌더링한다.
export const useLiveRace = (): LiveRaceState | null => {
  const [state, setState] = useState<LiveRaceState | null>(null);

  useEffect(() => {
    const mode = getDataMode();

    // Live 모드: Firestore 공개 경기 데이터를 실시간 구독한다 (서버가 authoritative).
    if (mode === DataMode.Live) {
      let cancelled = false;
      let dispose = () => {};

      void (async () => {
        const { FirestoreLiveRaceRepository } = await import(
          "@/firebase/FirestoreLiveRaceRepository"
        );

        if (cancelled) {
          return;
        }

        const repository = new FirestoreLiveRaceRepository();
        const sessionId = getLiveSessionId();
        let snapshot: LiveRaceSnapshot | null = null;
        let events: RaceEvent[] = [];

        const emit = () => {
          if (snapshot === null) {
            return;
          }

          setState({
            snapshot,
            events,
            freshness: getFreshnessFromTimestamp(
              snapshot.sourceUpdatedAt,
              Date.now(),
            ),
          });
        };

        const unsubscribeSnapshot = repository.subscribeSnapshot(
          sessionId,
          (next) => {
            snapshot = next;
            emit();
          },
        );
        const unsubscribeEvents = repository.subscribeEvents(
          sessionId,
          LIVE_EVENT_LIMIT,
          (next) => {
            events = next;
            emit();
          },
        );

        dispose = () => {
          unsubscribeSnapshot();
          unsubscribeEvents();
        };
      })();

      return () => {
        cancelled = true;
        dispose();
      };
    }

    let cancelled = false;
    let intervalId: number | undefined;
    let startEpochMs = Date.now();
    let bundle: SourceBundle | null = null;

    const update = () => {
      if (bundle === null) {
        return;
      }

      const nowMs = Date.now();
      let elapsedSeconds = ((nowMs - startEpochMs) / 1000) * bundle.speed;

      // 재생 종료 후 잠시 뒤 처음부터 반복한다.
      if (
        elapsedSeconds >
        bundle.source.durationSeconds + LOOP_PAUSE_SECONDS * bundle.speed
      ) {
        startEpochMs = nowMs;
        elapsedSeconds = 0;
      }

      const { snapshot, events } = bundle.source.frameAt(elapsedSeconds);
      const nowIso = new Date(nowMs).toISOString();

      // 재생 시각을 현재 시각으로 재기록해 freshness 를 live 로 유지한다.
      setState({
        snapshot: { ...snapshot, sourceUpdatedAt: nowIso, generatedAt: nowIso },
        events,
        freshness: getFreshness(0),
      });
    };

    void createSource(mode, startEpochMs).then((created) => {
      if (cancelled) {
        return;
      }

      bundle = created;
      update();
      intervalId = window.setInterval(update, TICK_INTERVAL_MS);
    });

    return () => {
      cancelled = true;

      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return state;
};
