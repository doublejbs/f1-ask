import { RaceDataSource, RaceFrame } from "./RaceDataSource";
import { LiveRaceSnapshot } from "./LiveRaceSnapshot";
import { RaceEvent } from "./RaceEvent";

// 녹화된 한 프레임. 특정 시점의 경기 상태를 담는다.
export type RecordedRaceFrame = {
  atSecond: number;
  snapshot: LiveRaceSnapshot;
  events: RaceEvent[];
};

// 경기 녹화본. Replay Mode 의 입력 데이터다.
export type RaceRecording = {
  durationSeconds: number;
  intervalSeconds: number;
  frames: RecordedRaceFrame[];
};

export const DEFAULT_RECORD_INTERVAL_SECONDS = 1;

// 임의의 RaceDataSource 를 일정 간격으로 녹화한다.
// (Live Worker 가 OpenF1 데이터를 프레임으로 저장하는 것과 동일한 파이프라인을
//  결정론적으로 재현한다 — docs/02-architecture.md §46.)
export const recordRace = (
  source: RaceDataSource,
  intervalSeconds: number = DEFAULT_RECORD_INTERVAL_SECONDS,
): RaceRecording => {
  if (intervalSeconds <= 0) {
    throw new Error("intervalSeconds must be positive");
  }

  const frames: RecordedRaceFrame[] = [];

  for (
    let atSecond = 0;
    atSecond <= source.durationSeconds;
    atSecond += intervalSeconds
  ) {
    const { snapshot, events } = source.frameAt(atSecond);

    frames.push({ atSecond, snapshot, events });
  }

  return {
    durationSeconds: source.durationSeconds,
    intervalSeconds,
    frames,
  };
};

// 녹화본을 재생하는 데이터 소스.
// Mock 과 달리 상태를 시뮬레이션하지 않고 저장된 프레임을 재생한다.
// 동일한 RaceFrame 모델을 산출하므로 UI 는 차이를 알 필요가 없다.
export class ReplayRaceSource implements RaceDataSource {
  private readonly recording: RaceRecording;

  constructor(recording: RaceRecording) {
    if (recording.frames.length === 0) {
      throw new Error("recording must contain at least one frame");
    }

    this.recording = recording;
  }

  get durationSeconds(): number {
    return this.recording.durationSeconds;
  }

  // 경과 시간 이하의 가장 최근 프레임을 반환한다.
  frameAt(elapsedSeconds: number): RaceFrame {
    const { frames } = this.recording;
    const first = frames[0];

    if (first === undefined) {
      throw new Error("recording must contain at least one frame");
    }

    let selected: RecordedRaceFrame = first;

    for (const frame of frames) {
      if (frame.atSecond <= elapsedSeconds) {
        selected = frame;
      } else {
        break;
      }
    }

    return { snapshot: selected.snapshot, events: selected.events };
  }
}
