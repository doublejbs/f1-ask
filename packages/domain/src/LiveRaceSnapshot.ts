import { LiveDriverState } from "./LiveDriverState";
import { SessionStatus } from "./SessionStatus";
import { WeatherState } from "./WeatherState";

// 화면용 경기 스냅샷 (docs/02-architecture.md §8.1)
// Worker(또는 Mock/Replay 엔진)가 계산해 배포한다. 클라이언트는 계산하지 않는다.
export type LiveRaceSnapshot = {
  schemaVersion: number;
  sessionId: string;
  sessionKey: number;
  meetingKey: number;
  sessionName: string;
  sessionType: string;
  circuitName: string;
  countryCode: string;
  status: SessionStatus;
  currentLap: number | null;
  totalLaps: number | null;
  drivers: LiveDriverState[];
  weather?: WeatherState;
  generatedAt: string;
  sourceUpdatedAt: string;
  version: number;
};
