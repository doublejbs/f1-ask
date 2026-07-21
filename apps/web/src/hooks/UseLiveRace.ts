"use client";

import { getDataMode, getLiveSessionId } from "@/lib/Env";
import { LiveRaceStatus } from "@/lib/LiveRaceStatus";
import {
  DataFreshnessStatus,
  DataMode,
  DEFAULT_MOCK_SCENARIO,
  getFreshnessFromTimestamp,
  isPrimaryRaceEvent,
  LiveRaceSnapshot,
  MockRaceEngine,
  OpenF1Recording,
  OpenF1ReplaySource,
  PRIMARY_EVENT_PRIORITIES,
  RaceDataSource,
  RaceEvent,
} from "@f1/domain";
import { useEffect, useState } from "react";

const TICK_INTERVAL_MS = 500;
const LOOP_PAUSE_SECONDS = 5;
// Replay(실제 OpenF1 녹화)는 ~160분 레이스라 시간 압축해 몇 분 안에 재생한다.
const OPENF1_REPLAY_SPEED = 40;
// 주요(Critical + High) 이벤트 전용 구독 한도. 피드는 12 건만 그리므로 20 이면 충분하다.
const LIVE_PRIMARY_EVENT_LIMIT = 20;
// 우선순위 필터 없는 전체 구독 한도. override_range_entered / gap_closing 같은 Low·Medium 이
// 초당 여러 건씩 쌓여 20 건이면 팀 라디오만으로도 창이 차버린다. 60 이면 피드의
// "전체 보기"(12 건)에 여유가 있고, AI 컨텍스트도 최근 흐름을 충분히 담는다.
// 더 키우면 구독 페이로드와 재렌더 비용이 선형으로 늘어 모바일에서 손해다.
const LIVE_ALL_EVENT_LIMIT = 60;
// Firestore 구독이 이 시간 안에 한 번도 응답하지 않으면 연결 실패로 보고
// 「세션 없음」으로 넘어간다. Firestore SDK 자체의 오프라인 판정(10초)보다
// 넉넉히 잡아 느린 회선에서 성급하게 포기하지 않는다.
const LIVE_CONNECT_TIMEOUT_MS = 15_000;

export type LiveRaceState = {
  snapshot: LiveRaceSnapshot;
  // 주요(Critical + High) 이벤트. 피드 기본 모드가 쓴다.
  primaryEvents: RaceEvent[];
  // 우선순위 무관 전체 이벤트. 피드 "전체 보기"와 AI 컨텍스트가 쓴다.
  allEvents: RaceEvent[];
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

export type LiveRaceResult = {
  status: LiveRaceStatus;
  // status 가 Ready 일 때만 채워진다.
  race: LiveRaceState | null;
};

// 라이브 경기 훅. 소스 종류와 무관하게 동일한 tick 루프로 프레임을 렌더링한다.
//
// 상태를 세 갈래로 갈라 돌려준다 — 세션이 없을 때(Firestore 문서 부재)와
// 아직 연결 중일 때를 화면이 구분할 수 있어야 하기 때문이다.
export const useLiveRace = (): LiveRaceResult => {
  const [state, setState] = useState<LiveRaceState | null>(null);
  const [status, setStatus] = useState<LiveRaceStatus>(
    LiveRaceStatus.Connecting,
  );

  useEffect(() => {
    const mode = getDataMode();

    // Live 모드: Firestore 공개 경기 데이터를 실시간 구독한다 (서버가 authoritative).
    if (mode === DataMode.Live) {
      let cancelled = false;
      let dispose = () => {};
      // Firestore 에 아예 닿지 못하면 구독 콜백이 영영 오지 않는다. 그대로 두면
      // 「연결 중」에 갇혀 기록 탭으로 갈 길이 없으므로, 이 시간이 지나면
      // 세션 없음으로 넘겨 사용자가 최소한 지난 레이스는 볼 수 있게 한다.
      const connectTimeoutId = window.setTimeout(() => {
        setStatus((previous) =>
          previous === LiveRaceStatus.Connecting
            ? LiveRaceStatus.NoSession
            : previous,
        );
      }, LIVE_CONNECT_TIMEOUT_MS);

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
        let primaryEvents: RaceEvent[] = [];
        let allEvents: RaceEvent[] = [];
        // 스냅샷 구독이 한 번이라도 응답했는지. 이벤트 구독이 먼저 도착했을 때
        // "세션 없음"으로 잘못 넘어가는 것을 막는다.
        let hasSnapshotResponse = false;

        const emit = () => {
          if (snapshot === null) {
            if (hasSnapshotResponse) {
              setStatus(LiveRaceStatus.NoSession);
              setState(null);
            }

            return;
          }

          setStatus(LiveRaceStatus.Ready);
          setState({
            snapshot,
            primaryEvents,
            allEvents,
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
            hasSnapshotResponse = true;
            emit();
          },
        );
        // 주요 이벤트 구독. Low / Medium 이 아무리 쏟아져도 Critical + High 는
        // 별도 창을 가지므로 피드에서 밀려나지 않는다.
        const unsubscribePrimaryEvents = repository.subscribeEvents(
          sessionId,
          LIVE_PRIMARY_EVENT_LIMIT,
          (next) => {
            primaryEvents = next;
            emit();
          },
          PRIMARY_EVENT_PRIORITIES,
        );
        // 전체 구독. 두 구독을 항상 함께 유지해 모드 전환 시 재조회가 없다.
        const unsubscribeAllEvents = repository.subscribeEvents(
          sessionId,
          LIVE_ALL_EVENT_LIMIT,
          (next) => {
            allEvents = next;
            emit();
          },
        );

        dispose = () => {
          unsubscribeSnapshot();
          unsubscribePrimaryEvents();
          unsubscribeAllEvents();
        };
      })();

      return () => {
        cancelled = true;
        window.clearTimeout(connectTimeoutId);
        dispose();
      };
    }

    let cancelled = false;
    let intervalId: number | undefined;
    let startEpochMs = Date.now();
    let bundle: SourceBundle | null = null;
    // 직전에 방출한 상태. 프레임이 그대로면 스냅샷/이벤트 객체 identity 를 유지해
    // 소비자의 useMemo(예: computeFieldBestSectors)가 무력화되지 않도록 한다.
    let lastState: LiveRaceState | null = null;

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

      const frame = bundle.source.frameAt(elapsedSeconds);
      const nowIso = new Date(nowMs).toISOString();

      // 소스가 실제로 새 프레임(version 변경)을 줄 때만 스냅샷·이벤트 객체를 교체한다.
      // tick 마다 새 객체를 만들면 내용이 같아도 3탭 전체가 재조정되므로 이를 피한다.
      const previous = lastState;
      const isNewFrame =
        previous === null || frame.snapshot.version !== previous.snapshot.version;

      // 새 프레임일 때만 sourceUpdatedAt 을 현재 시각으로 재기록한다(freshness 기준선).
      // Mock / Replay 소스는 프레임마다 전체 이벤트를 주므로, Live 구독과 같은
      // 모양을 만들기 위해 주요 이벤트를 메모리에서 걸러낸다.
      const snapshot = isNewFrame
        ? { ...frame.snapshot, sourceUpdatedAt: nowIso, generatedAt: nowIso }
        : previous.snapshot;
      const primaryEvents = isNewFrame
        ? frame.events.filter(isPrimaryRaceEvent)
        : previous.primaryEvents;
      const allEvents = isNewFrame ? frame.events : previous.allEvents;

      // freshness 는 매 tick 재계산한다. 소스가 새 프레임을 멈추면 age 가 쌓여
      // delayed / stale 로 자연히 넘어간다.
      const freshness = getFreshnessFromTimestamp(
        snapshot.sourceUpdatedAt,
        nowMs,
      );

      // 프레임도 freshness 도 그대로면 재조정을 유발하지 않도록 방출을 건너뛴다.
      if (!isNewFrame && previous !== null && freshness === previous.freshness) {
        return;
      }

      const next: LiveRaceState = {
        snapshot,
        primaryEvents,
        allEvents,
        freshness,
      };

      lastState = next;
      setState(next);
      setStatus(LiveRaceStatus.Ready);
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

  return { status, race: status === LiveRaceStatus.Ready ? state : null };
};
