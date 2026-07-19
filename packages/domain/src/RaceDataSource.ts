import { LiveRaceSnapshot } from "./LiveRaceSnapshot";
import { RaceEvent } from "./RaceEvent";

// 한 시점의 경기 상태 프레임. snapshot + 누적 이벤트.
export type RaceFrame = {
  snapshot: LiveRaceSnapshot;
  events: RaceEvent[];
};

// 경기 데이터 소스 추상화 (docs/02-architecture.md §46.1).
// Mock / Replay / Live 모드가 동일한 domain 모델(RaceFrame)을 산출하고,
// UI 와 tick 루프는 소스 종류를 몰라도 동일하게 동작한다.
export interface RaceDataSource {
  // 전체 재생 길이(초).
  readonly durationSeconds: number;
  // 경과 시간(초) 기준 현재 프레임.
  frameAt(elapsedSeconds: number): RaceFrame;
}
