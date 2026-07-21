import { SessionStatus } from "../SessionStatus";
import { TireCompound } from "../TireCompound";

// Mock 시나리오 스텝. 각 스텝은 atSecond 시점에 상태를 변경하고 이벤트를 생성한다.
// (docs/02-architecture.md §47.1 의 MockScenarioStep 을 확장한 형태)
export type MockScenarioStep =
  | { atSecond: number; kind: "session_status"; status: SessionStatus }
  | { atSecond: number; kind: "overtake"; driverNumber: number; targetDriverNumber: number }
  | { atSecond: number; kind: "pit_stop"; driverNumber: number; newCompound: TireCompound }
  | { atSecond: number; kind: "fastest_lap"; driverNumber: number; lapTimeSeconds: number }
  | { atSecond: number; kind: "personal_best"; driverNumber: number; lapTimeSeconds: number }
  | { atSecond: number; kind: "override_range"; driverNumber: number; targetDriverNumber: number }
  | { atSecond: number; kind: "gap_change"; driverNumber: number; deltaSeconds: number }
  | { atSecond: number; kind: "retirement"; driverNumber: number }
  | { atSecond: number; kind: "strategy_note"; driverNumber: number; noteKey: string };

export type MockScenario = {
  sessionId: string;
  sessionKey: number;
  meetingKey: number;
  sessionName: string;
  sessionType: string;
  circuitName: string;
  countryCode: string;
  totalLaps: number;
  secondsPerLap: number;
  pitDurationSeconds: number;
  durationSeconds: number;
  steps: readonly MockScenarioStep[];
};

// 기본 데모 시나리오. 문서에서 요구한 모든 이벤트 종류를 순차적으로 발생시킨다.
// (랩 증가 → 추월/순위 변경 → 간격 변화 → 피트/타이어 → 패스티스트 랩 →
//  옐로/세이프티카 → 재시작 → 리타이어 → 경기 종료)
export const DEFAULT_MOCK_SCENARIO: MockScenario = {
  sessionId: "2026-mock-race",
  sessionKey: 9001,
  meetingKey: 8001,
  sessionName: "Mock Grand Prix — Race",
  sessionType: "Race",
  circuitName: "Suzuka Circuit",
  countryCode: "JP",
  totalLaps: 20,
  secondsPerLap: 6,
  pitDurationSeconds: 4,
  durationSeconds: 122,
  steps: [
    { atSecond: 0, kind: "session_status", status: SessionStatus.Green },
    { atSecond: 8, kind: "overtake", driverNumber: 4, targetDriverNumber: 11 },
    { atSecond: 12, kind: "gap_change", driverNumber: 4, deltaSeconds: -0.6 },
    { atSecond: 16, kind: "personal_best", driverNumber: 16, lapTimeSeconds: 91.842 },
    { atSecond: 20, kind: "fastest_lap", driverNumber: 16, lapTimeSeconds: 91.203 },
    { atSecond: 24, kind: "override_range", driverNumber: 4, targetDriverNumber: 1 },
    { atSecond: 30, kind: "pit_stop", driverNumber: 44, newCompound: TireCompound.Hard },
    { atSecond: 34, kind: "pit_stop", driverNumber: 63, newCompound: TireCompound.Medium },
    { atSecond: 40, kind: "overtake", driverNumber: 16, targetDriverNumber: 4 },
    { atSecond: 48, kind: "gap_change", driverNumber: 4, deltaSeconds: 1.4 },
    { atSecond: 52, kind: "session_status", status: SessionStatus.Yellow },
    { atSecond: 55, kind: "session_status", status: SessionStatus.SafetyCar },
    { atSecond: 60, kind: "strategy_note", driverNumber: 4, noteKey: "undercut_window" },
    { atSecond: 68, kind: "pit_stop", driverNumber: 1, newCompound: TireCompound.Soft },
    { atSecond: 70, kind: "pit_stop", driverNumber: 4, newCompound: TireCompound.Soft },
    { atSecond: 80, kind: "session_status", status: SessionStatus.Green },
    { atSecond: 88, kind: "overtake", driverNumber: 81, targetDriverNumber: 14 },
    { atSecond: 95, kind: "retirement", driverNumber: 18 },
    { atSecond: 100, kind: "fastest_lap", driverNumber: 4, lapTimeSeconds: 90.771 },
    { atSecond: 108, kind: "gap_change", driverNumber: 4, deltaSeconds: -0.9 },
    { atSecond: 114, kind: "personal_best", driverNumber: 81, lapTimeSeconds: 91.55 },
    { atSecond: 120, kind: "session_status", status: SessionStatus.Finished },
  ],
};
