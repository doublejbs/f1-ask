import { RaceEvent, RaceEventParams } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventType } from "../RaceEventType";

export const EVENT_SCHEMA_VERSION = 1;

// 절대 시각을 함께 들고 다니는 이벤트. 창(window) 필터링 전 중간 표현이다.
export type TimedRaceEvent = {
  atMs: number;
  event: RaceEvent;
};

export type RaceEventParts = {
  driverNumber?: number;
  targetDriverNumber?: number;
  lapNumber?: number;
  params: RaceEventParams;
  key: string;
};

export const makeEvent = (
  sessionId: string,
  type: RaceEventType,
  priority: RaceEventPriority,
  atMs: number,
  parts: RaceEventParts,
): RaceEvent => {
  const deduplicationKey = `${sessionId}:${type}:${parts.key}`;
  const event: RaceEvent = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    id: deduplicationKey,
    sessionId,
    type,
    priority,
    timestamp: new Date(atMs).toISOString(),
    params: parts.params,
    deduplicationKey,
  };

  if (parts.driverNumber !== undefined) {
    event.driverNumber = parts.driverNumber;
  }

  if (parts.targetDriverNumber !== undefined) {
    event.targetDriverNumber = parts.targetDriverNumber;
  }

  if (parts.lapNumber !== undefined) {
    event.lapNumber = parts.lapNumber;
  }

  return event;
};
