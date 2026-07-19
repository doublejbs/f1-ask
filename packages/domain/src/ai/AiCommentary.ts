import { RaceEvent } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventType } from "../RaceEventType";

// AI 자동 해설 아이템 (docs/02-architecture.md §44, PRD §8.2).
// RaceEvent 와 달리 LLM 이 생성한 자유 문장(text)을 담는다.
export type AiCommentary = {
  id: string;
  sourceEventId: string;
  sourceEventType: RaceEventType;
  priority: RaceEventPriority;
  text: string;
  timestamp: string;
};

// 자동 해설 대상 여부. 모든 이벤트가 아니라 중요 이벤트(high/critical)만 해설한다.
export const isCommentaryEligible = (event: RaceEvent): boolean =>
  event.priority === RaceEventPriority.High ||
  event.priority === RaceEventPriority.Critical;

export const DEFAULT_COMMENTARY_LIMIT = 8;

// 이벤트 목록에서 해설 대상만 최근순 한도 내로 선별한다.
export const selectCommentaryEvents = (
  events: readonly RaceEvent[],
  limit: number = DEFAULT_COMMENTARY_LIMIT,
): RaceEvent[] => events.filter(isCommentaryEligible).slice(-limit);

// 이벤트 + 생성된 텍스트 → 해설 아이템. id 는 원본 이벤트 기준으로 결정론적.
export const toAiCommentary = (event: RaceEvent, text: string): AiCommentary => ({
  id: `commentary:${event.id}`,
  sourceEventId: event.id,
  sourceEventType: event.type,
  priority: event.priority,
  text,
  timestamp: event.timestamp,
});
