import { RaceEvent } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventType } from "../RaceEventType";
import { isCommentaryEligibleType } from "./CommentaryEventAllowlist";

// AI 자동 해설 아이템 (docs/02-architecture.md §44, PRD §8.2).
// RaceEvent 와 달리 LLM 이 생성한 자유 문장(text)을 담는다.
export type AiCommentary = {
  id: string;
  sourceEventId: string;
  sourceEventType: RaceEventType;
  priority: RaceEventPriority;
  text: string;
  timestamp: string;
  // 결정론적 Mock provider 가 만든 간이 해설인지 여부.
  // 실제 LLM 해설과 폴백 해설을 화면에서 구분하기 위한 정직성 신호다.
  isMock: boolean;
};

// 자동 해설 대상 여부.
//
// 우선순위(high/critical)가 아니라 이벤트 타입 allowlist 로 판정한다.
// 추월·피트스톱은 high/critical 의 88% 를 차지하면서도 도메인 결정론 문장이 사실을
// 이미 다 전달해 해설이 동어반복이었다. 판정 근거와 타입별 이유는
// CommentaryEventAllowlist.ts 주석 참고.
export const isCommentaryEligible = (event: RaceEvent): boolean =>
  isCommentaryEligibleType(event.type);

export const DEFAULT_COMMENTARY_LIMIT = 8;

// 이벤트 목록에서 해설 대상만 최근순 한도 내로 선별한다.
export const selectCommentaryEvents = (
  events: readonly RaceEvent[],
  limit: number = DEFAULT_COMMENTARY_LIMIT,
): RaceEvent[] => events.filter(isCommentaryEligible).slice(-limit);

// 해설 id 접두사. 저장 문서에서 복원할 때도 같은 규칙을 써야 하므로 상수로 둔다
// (firestore/CommentaryDocument.ts).
export const AI_COMMENTARY_ID_PREFIX = "commentary:";

// 이벤트 + 생성된 텍스트 → 해설 아이템. id 는 원본 이벤트 기준으로 결정론적.
export const toAiCommentary = (
  event: RaceEvent,
  text: string,
  isMock: boolean = false,
): AiCommentary => ({
  id: `${AI_COMMENTARY_ID_PREFIX}${event.id}`,
  sourceEventId: event.id,
  sourceEventType: event.type,
  priority: event.priority,
  text,
  timestamp: event.timestamp,
  isMock,
});

// 이벤트 + (있으면) 그 이벤트의 해설. 해설은 이벤트에 1:1 종속된 파생 데이터이므로
// 별도 목록이 아니라 이벤트 항목의 한 겹으로 다룬다 (docs/13-race-console.md 원칙 1).
export type CommentedRaceEvent = {
  event: RaceEvent;
  commentary: AiCommentary | null;
};

// 이벤트 목록에 해설을 sourceEventId 기준으로 결합한다.
// - 해설이 없는 이벤트도 그대로 포함한다(해설은 optional 한 겹).
// - 대응하는 이벤트가 없는 해설은 버린다.
// Map 인덱스를 써 O(n + m) 으로 처리한다.
export const attachCommentary = (
  events: readonly RaceEvent[],
  commentary: readonly AiCommentary[],
): CommentedRaceEvent[] => {
  const commentaryByEventId = new Map<string, AiCommentary>();

  for (const item of commentary) {
    commentaryByEventId.set(item.sourceEventId, item);
  }

  return events.map((event) => ({
    event,
    commentary: commentaryByEventId.get(event.id) ?? null,
  }));
};
