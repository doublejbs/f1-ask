import { describe, expect, it } from "vitest";
import { RaceEvent, RaceEventParams } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { SessionStateSeverity } from "../src/SessionStateSeverity";
import { selectActiveSessionStates } from "../src/SessionStateSelector";

const BASE_MS = Date.parse("2026-07-19T12:00:00.000Z");

// 초 단위 오프셋으로 이벤트를 만든다. 나머지 필드는 판정과 무관한 기본값이다.
const makeEvent = (
  type: RaceEventType,
  offsetSeconds: number,
  params: RaceEventParams = {},
): RaceEvent => ({
  schemaVersion: 1,
  id: `${type}-${offsetSeconds}`,
  sessionId: "test",
  type,
  priority: RaceEventPriority.Medium,
  timestamp: new Date(BASE_MS + offsetSeconds * 1000).toISOString(),
  params,
  deduplicationKey: `${type}-${offsetSeconds}`,
});

const toTypes = (states: { type: RaceEventType }[]): RaceEventType[] =>
  states.map((state) => state.type);

describe("selectActiveSessionStates", () => {
  it("빈 배열이면 활성 상태가 없다", () => {
    expect(selectActiveSessionStates([])).toEqual([]);
  });

  it("세이프티카 전개가 활성 상태로 남는다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.SafetyCar, 10),
    ]);

    expect(toTypes(states)).toEqual([RaceEventType.SafetyCar]);
    expect(states[0]?.severity).toBe(SessionStateSeverity.High);
    expect(states[0]?.sinceTimestamp).toBe(
      new Date(BASE_MS + 10_000).toISOString(),
    );
  });

  it("세이프티카가 세션 재시작으로 해제된다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.SafetyCar, 10),
      makeEvent(RaceEventType.SessionRestarted, 60),
    ]);

    expect(states).toEqual([]);
  });

  it("VSC 와 적기가 그린 플래그로 해제된다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.VirtualSafetyCar, 10),
      makeEvent(RaceEventType.RedFlag, 20),
      makeEvent(RaceEventType.GreenFlag, 30),
    ]);

    expect(states).toEqual([]);
  });

  it("피트레인 폐쇄가 개방으로 해제된다", () => {
    const closed = selectActiveSessionStates([
      makeEvent(RaceEventType.PitLaneClosed, 5),
    ]);

    expect(toTypes(closed)).toEqual([RaceEventType.PitLaneClosed]);

    const reopened = selectActiveSessionStates([
      makeEvent(RaceEventType.PitLaneClosed, 5),
      makeEvent(RaceEventType.PitLaneOpen, 15),
    ]);

    expect(reopened).toEqual([]);
  });

  it("오버테이크 모드 차단이 허용으로 해제된다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.OvertakeModeDisabled, 5),
      makeEvent(RaceEventType.OvertakeModeEnabled, 25),
    ]);

    expect(states).toEqual([]);
  });

  it("섹터 옐로는 섹터별로 독립이다 — 섹터 7 클리어가 섹터 13 옐로를 지우지 않는다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.SectorYellow, 10, { sector: 7 }),
      makeEvent(RaceEventType.SectorYellow, 12, { sector: 13 }),
      makeEvent(RaceEventType.SectorClear, 30, { sector: 7 }),
    ]);

    expect(states).toHaveLength(1);
    expect(states[0]?.type).toBe(RaceEventType.SectorYellow);
    expect(states[0]?.sector).toBe(13);
  });

  it("섹터가 없는 트랙 전체 클리어는 모든 섹터 옐로와 트랙 위험물을 지운다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.SectorYellow, 10, { sector: 7 }),
      makeEvent(RaceEventType.SectorYellow, 11, { sector: 13 }),
      makeEvent(RaceEventType.TrackHazard, 12, { kind: "marshals", turn: 4 }),
      makeEvent(RaceEventType.SectorClear, 30, { sector: null }),
    ]);

    expect(states).toEqual([]);
  });

  it("트랙 위험물은 그린 플래그로도 해제된다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.TrackHazard, 10, { kind: "recovery_vehicle" }),
      makeEvent(RaceEventType.GreenFlag, 40),
    ]);

    expect(states).toEqual([]);
  });

  it("트랙 전체 옐로가 그린 플래그로 해제된다", () => {
    const active = selectActiveSessionStates([
      makeEvent(RaceEventType.YellowFlag, 10),
    ]);

    expect(toTypes(active)).toEqual([RaceEventType.YellowFlag]);

    const cleared = selectActiveSessionStates([
      makeEvent(RaceEventType.YellowFlag, 10),
      makeEvent(RaceEventType.GreenFlag, 20),
    ]);

    expect(cleared).toEqual([]);
  });

  it("RainRisk 는 해제 이벤트 없이 최신 값만 유지한다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.RainRisk, 10, { percent: 20 }),
      makeEvent(RaceEventType.RainRisk, 200, { percent: 40 }),
    ]);

    expect(states).toHaveLength(1);
    expect(states[0]?.type).toBe(RaceEventType.RainRisk);
    expect(states[0]?.params.percent).toBe(40);
  });

  it("체커기가 다른 모든 활성 상태를 비운다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.SafetyCar, 10),
      makeEvent(RaceEventType.PitLaneClosed, 12),
      makeEvent(RaceEventType.RainRisk, 14, { percent: 40 }),
      makeEvent(RaceEventType.ChequeredFlag, 100),
    ]);

    expect(toTypes(states)).toEqual([RaceEventType.ChequeredFlag]);
  });

  it("세션 종료가 다른 모든 활성 상태를 비운다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.SectorYellow, 10, { sector: 3 }),
      makeEvent(RaceEventType.SessionFinished, 100),
    ]);

    expect(toTypes(states)).toEqual([RaceEventType.SessionFinished]);
  });

  it("이벤트가 뒤섞인 순서로 들어와도 정렬 후 접힌다", () => {
    const shuffled = [
      makeEvent(RaceEventType.SessionRestarted, 60),
      makeEvent(RaceEventType.SafetyCar, 10),
      makeEvent(RaceEventType.PitLaneClosed, 80),
    ];

    const states = selectActiveSessionStates(shuffled);

    // 재시작이 SC 보다 뒤이므로 SC 는 해제되고, 재시작 이후의 피트레인 폐쇄만 남는다.
    expect(toTypes(states)).toEqual([RaceEventType.PitLaneClosed]);
  });

  it("역순 입력에서도 해제가 열림보다 앞서면 상태가 남는다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.SafetyCar, 90),
      makeEvent(RaceEventType.SessionRestarted, 60),
    ]);

    expect(toTypes(states)).toEqual([RaceEventType.SafetyCar]);
  });

  it("atMs 이후의 이벤트는 반영하지 않는다", () => {
    const events = [
      makeEvent(RaceEventType.SafetyCar, 10),
      makeEvent(RaceEventType.SessionRestarted, 60),
    ];

    const midRace = selectActiveSessionStates(events, BASE_MS + 30_000);

    expect(toTypes(midRace)).toEqual([RaceEventType.SafetyCar]);

    const afterRestart = selectActiveSessionStates(events, BASE_MS + 90_000);

    expect(afterRestart).toEqual([]);
  });

  it("심각도 순으로 정렬해 반환한다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.RainRisk, 5, { percent: 30 }),
      makeEvent(RaceEventType.SectorYellow, 6, { sector: 2 }),
      makeEvent(RaceEventType.SafetyCar, 7),
      makeEvent(RaceEventType.RedFlag, 8),
    ]);

    expect(toTypes(states)).toEqual([
      RaceEventType.RedFlag,
      RaceEventType.SafetyCar,
      RaceEventType.SectorYellow,
      RaceEventType.RainRisk,
    ]);
  });

  it("드라이버 이벤트는 세션 상태에 영향을 주지 않는다", () => {
    const states = selectActiveSessionStates([
      makeEvent(RaceEventType.Overtake, 10),
      makeEvent(RaceEventType.Penalty, 20, { penaltySeconds: 5 }),
    ]);

    expect(states).toEqual([]);
  });

  it("timestamp 를 파싱할 수 없는 이벤트는 무시한다", () => {
    const broken: RaceEvent = {
      ...makeEvent(RaceEventType.SafetyCar, 10),
      timestamp: "not-a-date",
    };

    expect(selectActiveSessionStates([broken])).toEqual([]);
  });
});
