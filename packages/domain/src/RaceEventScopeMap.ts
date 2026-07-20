import { RaceEventScope } from "./RaceEventScope";
import { RaceEventType } from "./RaceEventType";

// 이벤트 타입 → 범위 매핑 (docs/14-event-placement.md 축 1 분류표).
//
// `Partial` 이 아니라 `Record<RaceEventType, RaceEventScope>` 로 선언한 것이 핵심이다.
// RaceEventType 에 멤버가 추가되면 이 객체가 컴파일되지 않아 tsc 가 누락을 잡는다.
export const RACE_EVENT_SCOPES: Record<RaceEventType, RaceEventScope> = {
  // ── 세션 (전체 경기) ──
  [RaceEventType.SessionStarted]: RaceEventScope.Session,
  [RaceEventType.SessionRestarted]: RaceEventScope.Session,
  [RaceEventType.SessionFinished]: RaceEventScope.Session,
  [RaceEventType.GreenFlag]: RaceEventScope.Session,
  [RaceEventType.YellowFlag]: RaceEventScope.Session,
  [RaceEventType.RedFlag]: RaceEventScope.Session,
  [RaceEventType.ChequeredFlag]: RaceEventScope.Session,
  [RaceEventType.SafetyCar]: RaceEventScope.Session,
  [RaceEventType.VirtualSafetyCar]: RaceEventScope.Session,
  [RaceEventType.SectorYellow]: RaceEventScope.Session,
  [RaceEventType.SectorClear]: RaceEventScope.Session,
  [RaceEventType.TrackHazard]: RaceEventScope.Session,
  [RaceEventType.PitLaneClosed]: RaceEventScope.Session,
  [RaceEventType.PitLaneOpen]: RaceEventScope.Session,
  [RaceEventType.RainRisk]: RaceEventScope.Session,
  [RaceEventType.OvertakeModeEnabled]: RaceEventScope.Session,
  [RaceEventType.OvertakeModeDisabled]: RaceEventScope.Session,

  // ── 드라이버 (특정 선수) ──
  [RaceEventType.Overtake]: RaceEventScope.Driver,
  [RaceEventType.PitStop]: RaceEventScope.Driver,
  [RaceEventType.FastestLap]: RaceEventScope.Driver,
  [RaceEventType.PersonalBestLap]: RaceEventScope.Driver,
  [RaceEventType.Penalty]: RaceEventScope.Driver,
  [RaceEventType.Investigation]: RaceEventScope.Driver,
  [RaceEventType.TrackLimits]: RaceEventScope.Driver,
  [RaceEventType.BlueFlag]: RaceEventScope.Driver,
  [RaceEventType.Retirement]: RaceEventScope.Driver,
  [RaceEventType.StrategyNote]: RaceEventScope.Driver,
  [RaceEventType.TeamRadioPosted]: RaceEventScope.Driver,
  [RaceEventType.GapClosing]: RaceEventScope.Driver,
  [RaceEventType.GapIncreasing]: RaceEventScope.Driver,
  [RaceEventType.OverrideRangeEntered]: RaceEventScope.Driver,
  [RaceEventType.PositionChange]: RaceEventScope.Driver,
};

// 이벤트 타입의 범위를 돌려준다. 매핑이 전수라 항상 값이 있다.
export const getRaceEventScope = (type: RaceEventType): RaceEventScope =>
  RACE_EVENT_SCOPES[type];
