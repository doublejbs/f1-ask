import { RaceEvent } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventScope } from "../RaceEventScope";
import { getRaceEventScope } from "../RaceEventScopeMap";
import { RaceEventType } from "../RaceEventType";
import { CommentaryContext } from "./CommentaryContext";
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
  // 해설이 생성 시 본 시점 맥락(순위 슬라이스·세션 상태). 저장 문서(pointInTimeContext)에서
  // 실려 온다. 사용자가 이 해설을 탭해 질문할 때 focus.context 로 그대로 보내, "현재" 가
  // 아니라 그 이벤트 시점의 순위로 답하게 한다 (docs/21-commentary-ask.md §질문 경로 확장).
  // optional 인 이유: 워커가 채우기 전 문서 · mock · replay 경로에는 없을 수 있다.
  pointInTimeContext?: CommentaryContext;
};

// 자동 해설 대상 여부. 두 관문을 모두 통과해야 한다.
//
// **관문 1 — 타입 allowlist.** 우선순위(high/critical)가 아니라 이벤트 타입으로 판정한다.
// 추월·피트스톱은 high/critical 의 88% 를 차지하면서도 도메인 결정론 문장이 사실을
// 이미 다 전달해 해설이 동어반복이었다. 타입별 이유는 CommentaryEventAllowlist.ts 참고.
//
// **관문 2 — Driver 범위만.** Session 범위(SC · VSC · 재개 · 플래그)는 방송이 가장 잘하는
// 영역이라 해설을 폐기했다(docs/19-watch-now.md §폐기한다, 수용 기준 6). 실측에서 나온
// 무가치한 문장 — "41랩에 세이프티 카가 발동되며 트랙 상황이 급변합니다" — 이 전부
// 여기였다. 방송은 같은 것을 화면과 함께, 더 빠르게, 더 감정적으로 말한다.
//
// **왜 allowlist 의 SafetyCar 등 4개를 false 로 내리지 않고 범위로 걸렀는가:**
// 두 관문이 서로 다른 질문에 답하기 때문이다. allowlist 는 "이 타입은 해석할 여지가
// 있는가", 범위 게이트는 "그 해석을 방송이 이미 더 잘하는가" 를 묻는다. allowlist 안에서
// 4개만 false 로 내리면 "왜 이 넷만" 이 그 파일만 봐서는 보이지 않고, RaceEventType 에
// Session 범위 타입이 새로 추가될 때마다 사람이 기억해서 false 로 내려야 한다.
// 범위로 거르면 RACE_EVENT_SCOPES 매핑이 그 일을 자동으로 한다.
export const isCommentaryEligible = (event: RaceEvent): boolean =>
  isCommentaryEligibleType(event.type) &&
  getRaceEventScope(event.type) === RaceEventScope.Driver;

export const DEFAULT_COMMENTARY_LIMIT = 8;

// 이벤트 목록에서 해설 대상만 최근순 한도 내로 선별한다.
export const selectCommentaryEvents = (
  events: readonly RaceEvent[],
  limit: number = DEFAULT_COMMENTARY_LIMIT,
): RaceEvent[] => events.filter(isCommentaryEligible).slice(-limit);

// 경기 요약의 "주요 순간" 선별 — 해설 대상 선별과 **의도적으로 다른 함수**다.
//
// 요약은 방송과 경쟁하지 않는다. 경기가 끝난 뒤 무슨 일이 있었는지 돌아보는 목록이므로
// 세이프티카와 재개는 오히려 빠지면 안 되는 사건이다. 해설에 건 Driver 범위 제한을
// 여기까지 끌고 오면 "주요 순간" 에서 SC 가 사라진다.
//
// 그래서 타입 allowlist(해석할 여지가 있는 사건)만 공유하고 범위 게이트는 쓰지 않는다.
export const selectKeyMomentEvents = (
  events: readonly RaceEvent[],
  limit: number,
): RaceEvent[] =>
  events.filter((event) => isCommentaryEligibleType(event.type)).slice(-limit);

// 해설 id 접두사. 저장 문서에서 복원할 때도 같은 규칙을 써야 하므로 상수로 둔다
// (firestore/CommentaryDocument.ts).
export const AI_COMMENTARY_ID_PREFIX = "commentary:";

// 이벤트 + 생성된 텍스트 → 해설 아이템. id 는 원본 이벤트 기준으로 결정론적.
// pointInTimeContext 는 라이브 생성 경로(/api/commentary)가 provider 가 본 맥락을 실어
// 나를 때 넘긴다. 넘기지 않으면 필드 자체를 담지 않는다 — 옛 문서 형태와 왕복이 깨지지 않게.
export const toAiCommentary = (
  event: RaceEvent,
  text: string,
  isMock: boolean = false,
  pointInTimeContext?: CommentaryContext,
): AiCommentary => {
  const commentary: AiCommentary = {
    id: `${AI_COMMENTARY_ID_PREFIX}${event.id}`,
    sourceEventId: event.id,
    sourceEventType: event.type,
    priority: event.priority,
    text,
    timestamp: event.timestamp,
    isMock,
  };

  if (pointInTimeContext !== undefined) {
    commentary.pointInTimeContext = pointInTimeContext;
  }

  return commentary;
};

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
