import { RaceEventType } from "../RaceEventType";

// 이벤트 타입 → AI 자동 해설 대상 여부.
//
// 왜 우선순위(high/critical)가 아니라 타입 allowlist 인가:
// 스파 2026 실측에서 high+critical 은 274건이었고 그중 추월 214 + 피트스톱 28 =
// 242건(88%)이었다. 이 둘은 도메인이 만든 결정론적 문장이 사실을 이미 다 전달한다
// ("BOR가 NOR를 추월했습니다"). 실제로 해설은 "BOR가 NOR를 제쳤습니다 — 트랙 포지션을
// 실력으로 얻었습니다" 처럼 같은 사실을 말만 바꿔 반복했고, 병합 화면에서 정보 없이
// 행 높이만 두 배로 만들었다.
//
// LLM 이 값을 만드는 건 도메인 문장이 말해주지 못하는 곳이다 — 페널티가 순위에 미치는
// 영향, 조사의 향방, SC/VSC 타이밍이 전략에 주는 효과 같은 해석. 그래서 해석 여지가 있는
// 타입만 남긴다. 사용자가 늘면 캐시든 사전 생성이든 결국 모든 변형이 생성되므로,
// 생성 건수 자체를 줄이는 것이 유일한 실질 레버다. (스파 기준 274건 → 47건)
//
// `Partial` 이나 `Set` 이 아니라 `Record<RaceEventType, boolean>` 로 선언한 것이 핵심이다.
// RaceEventType 에 멤버가 추가되면 이 객체가 컴파일되지 않아 tsc 가 누락을 잡는다
// (RaceEventScopeMap.ts 와 같은 패턴).
export const COMMENTARY_ELIGIBLE_EVENT_TYPES: Record<RaceEventType, boolean> = {
  // ── 해설 대상: 도메인 문장만으로는 "그래서 어떻게 되는가"가 안 나오는 타입 ──
  // 페널티/조사: 순위와 향후 판정에 미치는 영향이 사실 문장 밖에 있다.
  [RaceEventType.Penalty]: true,
  [RaceEventType.Investigation]: true,
  // SC/VSC: 타이밍에 따라 피트 전략의 이득/손해가 갈린다.
  [RaceEventType.SafetyCar]: true,
  [RaceEventType.VirtualSafetyCar]: true,
  // 리타이어: 순위 승계와 팀 전략 변화가 따라온다.
  [RaceEventType.Retirement]: true,
  // 트랙 위험: 레이스 컨트롤의 다음 수를 예상하게 한다.
  [RaceEventType.TrackHazard]: true,
  // 전략 노트: 해석이 본질인 이벤트.
  [RaceEventType.StrategyNote]: true,
  // 패스티스트랩: 랩타임 숫자만으로는 페이스의 의미가 드러나지 않는다.
  [RaceEventType.FastestLap]: true,
  // 재시작: 재개 시점의 순위/타이어 상황이 판을 다시 짠다.
  [RaceEventType.SessionRestarted]: true,

  // ── 제외: 도메인 결정론 문장이 사실을 이미 다 전달하는 타입 ──
  // 추월·피트스톱은 실측 대비 88% 를 차지하면서 해설이 동어반복이었다.
  [RaceEventType.Overtake]: false,
  [RaceEventType.PitStop]: false,
  [RaceEventType.PersonalBestLap]: false,
  [RaceEventType.GapClosing]: false,
  [RaceEventType.GapIncreasing]: false,
  [RaceEventType.OverrideRangeEntered]: false,
  [RaceEventType.TeamRadioPosted]: false,
  [RaceEventType.SectorYellow]: false,
  [RaceEventType.SectorClear]: false,
  [RaceEventType.BlueFlag]: false,
  [RaceEventType.TrackLimits]: false,
  [RaceEventType.PositionChange]: false,
  [RaceEventType.SessionStarted]: false,
  [RaceEventType.SessionFinished]: false,
  [RaceEventType.YellowFlag]: false,
  [RaceEventType.GreenFlag]: false,
  [RaceEventType.RedFlag]: false,
  [RaceEventType.ChequeredFlag]: false,
  [RaceEventType.PitLaneClosed]: false,
  [RaceEventType.PitLaneOpen]: false,
  [RaceEventType.RainRisk]: false,
  [RaceEventType.OvertakeModeEnabled]: false,
  [RaceEventType.OvertakeModeDisabled]: false,
};

// 타입이 해설 대상인지 돌려준다. 매핑이 전수라 항상 값이 있다.
export const isCommentaryEligibleType = (type: RaceEventType): boolean =>
  COMMENTARY_ELIGIBLE_EVENT_TYPES[type];
