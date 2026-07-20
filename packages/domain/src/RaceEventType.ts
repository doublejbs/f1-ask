// 경기 이벤트 종류 (docs/02-architecture.md §8.3)
// 이벤트는 번역된 문장이 아니라 type + params 로 저장한다.
//
// 2026 시즌 DRS 폐지에 따라 기존 `drs_*` 3종을 매뉴얼 오버라이드 명칭으로 교체했다
// (`OverrideRangeEntered` / `OvertakeModeEnabled` / `OvertakeModeDisabled`).
// 판정 로직과 임계값은 그대로이며, 저장된 구값은 폴러가 재생성하므로 마이그레이션은 없다.
export enum RaceEventType {
  SessionStarted = "session_started",
  SessionRestarted = "session_restarted",
  SessionFinished = "session_finished",
  PositionChange = "position_change",
  Overtake = "overtake",
  PitStop = "pit_stop",
  FastestLap = "fastest_lap",
  PersonalBestLap = "personal_best_lap",
  GapClosing = "gap_closing",
  GapIncreasing = "gap_increasing",
  OverrideRangeEntered = "override_range_entered",
  YellowFlag = "yellow_flag",
  GreenFlag = "green_flag",
  SafetyCar = "safety_car",
  VirtualSafetyCar = "virtual_safety_car",
  RedFlag = "red_flag",
  Retirement = "retirement",
  StrategyNote = "strategy_note",
  // docs/10-race-events.md 신규 14종.
  // 기존 멤버의 값은 Firestore 에 저장된 이벤트와 호환을 위해 변경하지 않는다.
  Penalty = "penalty",
  Investigation = "investigation",
  TrackLimits = "track_limits",
  BlueFlag = "blue_flag",
  SectorYellow = "sector_yellow",
  SectorClear = "sector_clear",
  ChequeredFlag = "chequered_flag",
  OvertakeModeEnabled = "overtake_mode_enabled",
  OvertakeModeDisabled = "overtake_mode_disabled",
  TrackHazard = "track_hazard",
  PitLaneClosed = "pit_lane_closed",
  PitLaneOpen = "pit_lane_open",
  RainRisk = "rain_risk",
  TeamRadioPosted = "team_radio_posted",
}
