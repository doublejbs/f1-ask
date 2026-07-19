// 경기 세션 상태 (docs/02-architecture.md §8.1)
export enum SessionStatus {
  Scheduled = "scheduled",
  Green = "green",
  Yellow = "yellow",
  SafetyCar = "safety_car",
  VirtualSafetyCar = "virtual_safety_car",
  Red = "red",
  Suspended = "suspended",
  Finished = "finished",
  Unknown = "unknown",
}
