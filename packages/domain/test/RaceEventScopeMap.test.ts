import { describe, expect, it } from "vitest";
import { RaceEventScope } from "../src/RaceEventScope";
import { RACE_EVENT_SCOPES, getRaceEventScope } from "../src/RaceEventScopeMap";
import { RaceEventType } from "../src/RaceEventType";

describe("RaceEventScopeMap", () => {
  it("모든 RaceEventType 이 범위에 매핑된다", () => {
    const types = Object.values(RaceEventType);
    const missing = types.filter((type) => RACE_EVENT_SCOPES[type] === undefined);

    expect(missing).toEqual([]);
    expect(types).toHaveLength(33);
    expect(Object.keys(RACE_EVENT_SCOPES)).toHaveLength(types.length);
  });

  it("매핑 값은 RaceEventScope 멤버만 사용한다", () => {
    const scopes = Object.values(RaceEventScope);

    for (const type of Object.values(RaceEventType)) {
      expect(scopes).toContain(getRaceEventScope(type));
    }
  });

  it("세션 이벤트를 Session 으로 분류한다", () => {
    expect(getRaceEventScope(RaceEventType.SafetyCar)).toBe(
      RaceEventScope.Session,
    );
    expect(getRaceEventScope(RaceEventType.SectorYellow)).toBe(
      RaceEventScope.Session,
    );
    expect(getRaceEventScope(RaceEventType.RainRisk)).toBe(
      RaceEventScope.Session,
    );
  });

  it("드라이버 이벤트를 Driver 로 분류한다", () => {
    expect(getRaceEventScope(RaceEventType.Penalty)).toBe(
      RaceEventScope.Driver,
    );
    expect(getRaceEventScope(RaceEventType.PositionChange)).toBe(
      RaceEventScope.Driver,
    );
    expect(getRaceEventScope(RaceEventType.TeamRadioPosted)).toBe(
      RaceEventScope.Driver,
    );
  });
});
