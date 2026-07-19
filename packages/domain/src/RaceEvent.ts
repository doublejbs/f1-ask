import { RaceEventPriority } from "./RaceEventPriority";
import { RaceEventType } from "./RaceEventType";

// 이벤트 파라미터 값은 원시 타입만 허용한다.
// 번역된 문장이 아니라 type + params 로 저장하고, UI가 locale 에 따라 번역한다.
export type RaceEventParamValue = string | number | boolean | null;

export type RaceEventParams = Record<string, RaceEventParamValue>;

// 경기 이벤트 (docs/02-architecture.md §8.3)
export type RaceEvent = {
  schemaVersion: number;
  id: string;
  sessionId: string;
  type: RaceEventType;
  priority: RaceEventPriority;
  driverNumber?: number;
  targetDriverNumber?: number;
  lapNumber?: number;
  timestamp: string;
  params: RaceEventParams;
  deduplicationKey: string;
};
