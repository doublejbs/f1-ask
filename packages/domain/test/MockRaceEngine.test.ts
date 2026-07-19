import { describe, expect, it } from "vitest";
import { MockRaceEngine } from "../src/mock/MockRaceEngine";
import { DEFAULT_MOCK_SCENARIO } from "../src/mock/MockScenario";
import { RaceEventType } from "../src/RaceEventType";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";

const START_EPOCH = Date.parse("2026-07-19T05:00:00.000Z");

const createEngine = (): MockRaceEngine =>
  new MockRaceEngine(DEFAULT_MOCK_SCENARIO, START_EPOCH);

describe("MockRaceEngine", () => {
  it("항상 20명의 드라이버를 반환한다", () => {
    const engine = createEngine();
    const { snapshot } = engine.snapshotAt(0);

    expect(snapshot.drivers).toHaveLength(20);
  });

  it("결정론적이다 — 동일 입력에 동일 결과", () => {
    const a = createEngine().snapshotAt(70);
    const b = createEngine().snapshotAt(70);

    expect(a).toEqual(b);
  });

  it("시작 시 세션 상태가 green 이고 session_started 이벤트를 낸다", () => {
    const { snapshot, events } = createEngine().snapshotAt(1);

    expect(snapshot.status).toBe(SessionStatus.Green);
    expect(events.some((e) => e.type === RaceEventType.SessionStarted)).toBe(true);
  });

  it("경과에 따라 랩이 증가하고 총 랩을 넘지 않는다", () => {
    const engine = createEngine();

    expect(engine.snapshotAt(0).snapshot.currentLap).toBe(1);
    expect(engine.snapshotAt(30).snapshot.currentLap).toBe(6);
    expect(engine.snapshotAt(1000).snapshot.currentLap).toBe(
      DEFAULT_MOCK_SCENARIO.totalLaps,
    );
  });

  it("이벤트를 type 과 params 로 저장한다 (번역 문자열 아님)", () => {
    const { events } = createEngine().snapshotAt(122);
    const overtake = events.find((e) => e.type === RaceEventType.Overtake);

    expect(overtake).toBeDefined();
    expect(overtake?.params.driverCode).toBeTypeOf("string");
    expect(overtake?.deduplicationKey).toContain(RaceEventType.Overtake);
  });

  it("피트스톱이 타이어 컴파운드와 피트 카운트를 변경한다", () => {
    // HAM(44) 은 t=30 에 HARD 로 피트인한다.
    const { snapshot } = createEngine().snapshotAt(31);
    const hamilton = snapshot.drivers.find((d) => d.driverNumber === 44);

    expect(hamilton?.compound).toBe(TireCompound.Hard);
    expect(hamilton?.pitStopCount).toBe(1);
  });

  it("피트 윈도우 동안에만 inPit 이 true 다", () => {
    const during = createEngine().snapshotAt(31).snapshot.drivers.find(
      (d) => d.driverNumber === 44,
    );
    const after = createEngine().snapshotAt(40).snapshot.drivers.find(
      (d) => d.driverNumber === 44,
    );

    expect(during?.inPit).toBe(true);
    expect(after?.inPit).toBe(false);
  });

  it("리타이어한 드라이버는 순위표 하단으로 정렬되고 retired=true 다", () => {
    // STR(18) 은 t=95 에 리타이어한다.
    const { snapshot } = createEngine().snapshotAt(96);
    const stroll = snapshot.drivers.find((d) => d.driverNumber === 18);
    const lastDriver = snapshot.drivers.at(-1);

    expect(stroll?.retired).toBe(true);
    expect(stroll?.position).toBeNull();
    expect(lastDriver?.retired).toBe(true);
  });

  it("세이프티카와 재시작 이벤트가 순차적으로 발생한다", () => {
    const { events, snapshot } = createEngine().snapshotAt(122);
    const types = events.map((e) => e.type);

    expect(types).toContain(RaceEventType.SafetyCar);
    expect(types).toContain(RaceEventType.SessionRestarted);
    expect(snapshot.status).toBe(SessionStatus.Finished);
  });

  it("리더의 리더 대비 간격은 0 이다", () => {
    const { snapshot } = createEngine().snapshotAt(50);
    const leader = snapshot.drivers.find((d) => d.position === 1);

    expect(leader?.gapToLeaderSeconds).toBe(0);
    expect(leader?.intervalToAheadSeconds).toBeNull();
  });
});
