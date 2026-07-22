import { LiveDriverState } from "./LiveDriverState";
import { LiveRaceContextSummary } from "./LiveRaceContextSummary";
import { OvertakeForecast } from "./openf1/OvertakeForecast";
import { SessionStatus } from "./SessionStatus";
import { TeamRadioClip } from "./TeamRadioClip";
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
  teamRadios?: TeamRadioClip[];
  // 워커가 원본에서 계산해 싣는 결정론적 요약 (docs/22 §B). AI 질문 컨텍스트에 쓴다.
  // optional — mock·replay·옛 스냅샷에 없어도 안전하다.
  contextSummary?: LiveRaceContextSummary;
  // 워커가 원본 랩타임으로 계산해 싣는 순위 인접 페어의 배틀 진입 예측 (docs/23 §스냅샷 계약).
  // optional — mock·replay·옛 스냅샷에 없어도 안전하다.
  overtakeForecasts?: OvertakeForecast[];
  generatedAt: string;
  sourceUpdatedAt: string;
  version: number;
};
