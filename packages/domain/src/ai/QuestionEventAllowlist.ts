import { RaceEventType } from "../RaceEventType";
import { COMMENTARY_ELIGIBLE_EVENT_TYPES } from "./CommentaryEventAllowlist";

// 이벤트 타입 → AI **질문 컨텍스트**에 실을지 여부.
//
// 왜 해설 allowlist(CommentaryEventAllowlist.ts)와 따로 두면서도 그 위에 얹는가:
// 두 표는 서로 다른 질문에 답한다.
//
//   - 해설 allowlist 는 "이 타입에 LLM 이 해석을 덧붙일 여지가 있는가" 를 묻는다.
//     pit_stop 은 도메인 결정론 문장("BOR가 피트인했습니다")이 사실을 이미 다 전달하므로
//     해설 대상이 아니다(false).
//   - 이 표는 "AI 가 질문에 답하려면 어떤 사실이 맥락에 있어야 하는가" 를 묻는다.
//     사용자가 "타이어 피트인이 왜 없냐" 고 묻는 바로 그 사실이라 pit_stop 은 반드시
//     있어야 한다. red_flag·rain_risk 도 경기 흐름을 이해하는 데 필요한 사실이다
//     ("방송이 이미 잘 다룬다"는 해설 폐기 근거는 질문 맥락과 무관하다).
//
// 그래서 **공통 부분(해석 여지가 있는 사건 9종)은 해설 allowlist 를 그대로 재사용**하고,
// 질문 맥락에만 추가로 필요한 사실 타입 3종을 명시적으로 얹는다. 두 벌을 만들지 않는다 —
// RaceEventType 에 새 멤버가 추가되면 해설 allowlist 가 먼저 컴파일에 실패해 누락을 잡고,
// 이 표는 그 위에서 파생되므로 함께 안전하다.
//
// 질문 컨텍스트에만 추가로 넣는 타입(해설 대상은 아니지만 질문 답변에는 필요한 사실).
export const QUESTION_CONTEXT_EVENT_TYPE_ADDITIONS: readonly RaceEventType[] = [
  // 피트 전략의 핵심 사실. 해설은 동어반복이라 뺐지만 질문 답변엔 반드시 필요하다.
  RaceEventType.PitStop,
  // 레드플래그: 경기 중단은 순위·전략을 통째로 다시 짠다. 답변에 필요한 큰 흐름이다.
  RaceEventType.RedFlag,
  // 강우 리스크: 타이어·피트 판단의 전제. 질문 맥락에 있어야 페이스·전략을 설명할 수 있다.
  RaceEventType.RainRisk,
];

// 해설 allowlist(해석 여지가 있는 9종) + 질문 전용 추가 3종.
// `Record<RaceEventType, boolean>` 로 전수 선언해 tsc 가 누락을 잡게 한다.
export const QUESTION_CONTEXT_ELIGIBLE_EVENT_TYPES: Record<
  RaceEventType,
  boolean
> = {
  ...COMMENTARY_ELIGIBLE_EVENT_TYPES,
  [RaceEventType.PitStop]: true,
  [RaceEventType.RedFlag]: true,
  [RaceEventType.RainRisk]: true,
};

// 타입이 질문 컨텍스트 대상인지 돌려준다. 매핑이 전수라 항상 값이 있다.
export const isQuestionContextEligibleType = (type: RaceEventType): boolean =>
  QUESTION_CONTEXT_ELIGIBLE_EVENT_TYPES[type];
