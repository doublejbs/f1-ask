// 인시던트 사유 (Penalty / Investigation 이벤트의 reason params).
//
// race_control 메시지의 ` - ` 뒤 구간은 영어 원문이다. 원문을 그대로 params 에 담으면
// UI 에 번역되지 않은 영어가 노출되므로(docs/10-race-events.md 수용 기준 6·7),
// 알려진 문구만 이 enum 키로 정규화하고 그 외에는 reason 을 담지 않는다.
export enum RaceIncidentReason {
  CausingACollision = "causing_a_collision",
  CarSafetyLights = "car_safety_lights",
  TrackLimits = "track_limits",
  LapTimeDeleted = "lap_time_deleted",
  UnsafeRelease = "unsafe_release",
  SpeedingInThePitLane = "speeding_in_the_pit_lane",
  ForcingAnotherDriverOffTheTrack = "forcing_another_driver_off_the_track",
  Impeding = "impeding",
  FalseStart = "false_start",
  CrossingThePitExitLine = "crossing_the_pit_exit_line",
  OvertakingUnderSafetyCar = "overtaking_under_safety_car",
  LeavingTheTrackAndGainingAnAdvantage = "leaving_the_track_and_gaining_an_advantage",
  IgnoringBlueFlags = "ignoring_blue_flags",
  DrivingErratically = "driving_erratically",
  FailingToFollowRaceDirectorInstructions = "failing_to_follow_race_director_instructions",
}
