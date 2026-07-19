// 경기 이벤트 종류 (docs/02-architecture.md §8.3)
// 이벤트는 번역된 문장이 아니라 type + params 로 저장한다.
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
  DrsRangeEntered = "drs_range_entered",
  YellowFlag = "yellow_flag",
  GreenFlag = "green_flag",
  SafetyCar = "safety_car",
  VirtualSafetyCar = "virtual_safety_car",
  RedFlag = "red_flag",
  Retirement = "retirement",
  StrategyNote = "strategy_note",
}
