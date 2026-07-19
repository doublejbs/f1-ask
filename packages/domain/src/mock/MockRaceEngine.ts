import { LiveDriverState } from "../LiveDriverState";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { RaceDataSource, RaceFrame } from "../RaceDataSource";
import { RaceEvent, RaceEventParams } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventType } from "../RaceEventType";
import { SessionStatus } from "../SessionStatus";
import { TireCompound } from "../TireCompound";
import { DriverSeed, MOCK_DRIVER_SEEDS } from "./DriverSeed";
import { MockScenario, MockScenarioStep } from "./MockScenario";

const SNAPSHOT_SCHEMA_VERSION = 1;
const EVENT_SCHEMA_VERSION = 1;
const BASE_LAP_SECONDS = 90;

// 시뮬레이션 내부 작업 상태. snapshot/event 로 변환되기 전의 가변 상태다.
type WorkingDriver = {
  seed: DriverSeed;
  position: number;
  gapToLeaderSeconds: number;
  compound: TireCompound;
  tireStartLap: number;
  pitStopCount: number;
  inPitUntilSecond: number | null;
  retired: boolean;
  lastLapSeconds: number;
  personalBestLapSeconds: number;
};

type SimulationResult = {
  drivers: Map<number, WorkingDriver>;
  status: SessionStatus;
  greenSeen: boolean;
  events: RaceEvent[];
};

// RaceFrame 과 동일 구조. 하위 호환을 위해 별칭으로 유지한다.
export type MockSnapshotResult = RaceFrame;

// 결정론적 Mock 경기 엔진.
// 동일한 (scenario, startEpochMs, elapsedSeconds) 입력에 대해 항상 동일한 결과를 반환한다.
// Worker(Live) / Replay 와 동일한 domain 모델(LiveRaceSnapshot, RaceEvent)을 산출한다.
export class MockRaceEngine implements RaceDataSource {
  private readonly scenario: MockScenario;
  private readonly startEpochMs: number;

  constructor(scenario: MockScenario, startEpochMs: number) {
    this.scenario = scenario;
    this.startEpochMs = startEpochMs;
  }

  get durationSeconds(): number {
    return this.scenario.durationSeconds;
  }

  // RaceDataSource 구현. snapshotAt 의 별칭.
  frameAt(elapsedSeconds: number): RaceFrame {
    return this.snapshotAt(elapsedSeconds);
  }

  // 경과 시간 기준 현재 랩. 총 랩 수를 넘지 않는다.
  currentLapAt(elapsedSeconds: number): number {
    const lap = 1 + Math.floor(elapsedSeconds / this.scenario.secondsPerLap);

    return Math.min(Math.max(lap, 1), this.scenario.totalLaps);
  }

  // 경과 시간 시점의 snapshot 과 그때까지 누적된 이벤트를 반환한다.
  snapshotAt(elapsedSeconds: number): MockSnapshotResult {
    const clampedElapsed = Math.max(0, elapsedSeconds);
    const sim = this.simulate(clampedElapsed);
    const currentLap = this.currentLapAt(clampedElapsed);
    const timestampIso = this.timestampAt(clampedElapsed);

    const drivers = this.buildDriverStates(sim.drivers, currentLap, clampedElapsed);

    const snapshot: LiveRaceSnapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      sessionId: this.scenario.sessionId,
      sessionKey: this.scenario.sessionKey,
      meetingKey: this.scenario.meetingKey,
      sessionName: this.scenario.sessionName,
      sessionType: this.scenario.sessionType,
      circuitName: this.scenario.circuitName,
      countryCode: this.scenario.countryCode,
      status: sim.status,
      currentLap,
      totalLaps: this.scenario.totalLaps,
      drivers,
      weather: {
        airTemperatureCelsius: 24,
        trackTemperatureCelsius: 38,
        humidityPercent: 55,
        rainfall: false,
      },
      generatedAt: timestampIso,
      sourceUpdatedAt: timestampIso,
      version: Math.floor(clampedElapsed),
    };

    return { snapshot, events: sim.events };
  }

  private timestampAt(elapsedSeconds: number): string {
    return new Date(this.startEpochMs + elapsedSeconds * 1000).toISOString();
  }

  // 초기 그리드 상태를 구성한다.
  private initialDrivers(): Map<number, WorkingDriver> {
    const drivers = new Map<number, WorkingDriver>();

    for (const seed of MOCK_DRIVER_SEEDS) {
      const startCompound =
        seed.gridPosition <= 10 ? TireCompound.Soft : TireCompound.Medium;

      drivers.set(seed.driverNumber, {
        seed,
        position: seed.gridPosition,
        gapToLeaderSeconds: (seed.gridPosition - 1) * 1.2,
        compound: startCompound,
        tireStartLap: 1,
        pitStopCount: 0,
        inPitUntilSecond: null,
        retired: false,
        lastLapSeconds: BASE_LAP_SECONDS + seed.gridPosition * 0.08,
        personalBestLapSeconds: BASE_LAP_SECONDS + seed.gridPosition * 0.08 - 0.4,
      });
    }

    return drivers;
  }

  // elapsed 시점까지 시나리오 스텝을 순서대로 적용한다.
  private simulate(elapsedSeconds: number): SimulationResult {
    const drivers = this.initialDrivers();
    const events: RaceEvent[] = [];
    let status = SessionStatus.Scheduled;
    let greenSeen = false;

    const applicable = this.scenario.steps.filter(
      (step) => step.atSecond <= elapsedSeconds,
    );

    for (const step of applicable) {
      const lapAtStep = this.currentLapAt(step.atSecond);
      const result = this.applyStep(step, drivers, status, greenSeen, lapAtStep);

      status = result.status;
      greenSeen = result.greenSeen;

      if (result.event) {
        events.push(result.event);
      }
    }

    return { drivers, status, greenSeen, events };
  }

  private applyStep(
    step: MockScenarioStep,
    drivers: Map<number, WorkingDriver>,
    status: SessionStatus,
    greenSeen: boolean,
    lapAtStep: number,
  ): { status: SessionStatus; greenSeen: boolean; event: RaceEvent | null } {
    switch (step.kind) {
      case "session_status": {
        return this.applyStatusStep(step, greenSeen, lapAtStep);
      }
      case "overtake": {
        const event = this.applyOvertake(step, drivers, lapAtStep);

        return { status, greenSeen, event };
      }
      case "pit_stop": {
        const event = this.applyPitStop(step, drivers, lapAtStep);

        return { status, greenSeen, event };
      }
      case "fastest_lap": {
        const event = this.applyLap(
          step.driverNumber,
          step.lapTimeSeconds,
          drivers,
          RaceEventType.FastestLap,
          RaceEventPriority.Medium,
          step.atSecond,
          lapAtStep,
        );

        return { status, greenSeen, event };
      }
      case "personal_best": {
        const event = this.applyLap(
          step.driverNumber,
          step.lapTimeSeconds,
          drivers,
          RaceEventType.PersonalBestLap,
          RaceEventPriority.Low,
          step.atSecond,
          lapAtStep,
        );

        return { status, greenSeen, event };
      }
      case "drs_range": {
        const event = this.buildEvent(
          RaceEventType.DrsRangeEntered,
          RaceEventPriority.Medium,
          step.atSecond,
          lapAtStep,
          {
            driverNumber: step.driverNumber,
            targetDriverNumber: step.targetDriverNumber,
          },
          this.driverParams(drivers, step.driverNumber, step.targetDriverNumber),
        );

        return { status, greenSeen, event };
      }
      case "gap_change": {
        const event = this.applyGapChange(step, drivers, lapAtStep);

        return { status, greenSeen, event };
      }
      case "retirement": {
        const event = this.applyRetirement(step, drivers, lapAtStep);

        return { status, greenSeen, event };
      }
      case "strategy_note": {
        const event = this.buildEvent(
          RaceEventType.StrategyNote,
          RaceEventPriority.Medium,
          step.atSecond,
          lapAtStep,
          { driverNumber: step.driverNumber },
          {
            ...this.driverParams(drivers, step.driverNumber),
            noteKey: step.noteKey,
          },
        );

        return { status, greenSeen, event };
      }
      default: {
        // 모든 kind 를 처리했음을 컴파일 타임에 보장한다.
        const exhaustive: never = step;

        throw new Error(`Unhandled scenario step: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  private applyStatusStep(
    step: Extract<MockScenarioStep, { kind: "session_status" }>,
    greenSeen: boolean,
    lapAtStep: number,
  ): { status: SessionStatus; greenSeen: boolean; event: RaceEvent | null } {
    const nextStatus = step.status;
    let eventType: RaceEventType;
    let priority: RaceEventPriority;
    let nextGreenSeen = greenSeen;

    switch (nextStatus) {
      case SessionStatus.Green: {
        if (greenSeen) {
          eventType = RaceEventType.SessionRestarted;
          priority = RaceEventPriority.High;
        } else {
          eventType = RaceEventType.SessionStarted;
          priority = RaceEventPriority.Medium;
        }

        nextGreenSeen = true;
        break;
      }
      case SessionStatus.Yellow: {
        eventType = RaceEventType.YellowFlag;
        priority = RaceEventPriority.High;
        break;
      }
      case SessionStatus.SafetyCar: {
        eventType = RaceEventType.SafetyCar;
        priority = RaceEventPriority.Critical;
        break;
      }
      case SessionStatus.VirtualSafetyCar: {
        eventType = RaceEventType.VirtualSafetyCar;
        priority = RaceEventPriority.Critical;
        break;
      }
      case SessionStatus.Red: {
        eventType = RaceEventType.RedFlag;
        priority = RaceEventPriority.Critical;
        break;
      }
      case SessionStatus.Finished: {
        eventType = RaceEventType.SessionFinished;
        priority = RaceEventPriority.High;
        break;
      }
      default: {
        eventType = RaceEventType.GreenFlag;
        priority = RaceEventPriority.Low;
        break;
      }
    }

    const event = this.buildEvent(eventType, priority, step.atSecond, lapAtStep, {}, {
      status: nextStatus,
    });

    return { status: nextStatus, greenSeen: nextGreenSeen, event };
  }

  private applyOvertake(
    step: Extract<MockScenarioStep, { kind: "overtake" }>,
    drivers: Map<number, WorkingDriver>,
    lapAtStep: number,
  ): RaceEvent | null {
    const gainer = drivers.get(step.driverNumber);
    const target = drivers.get(step.targetDriverNumber);

    if (!gainer || !target || gainer.retired || target.retired) {
      return null;
    }

    // 두 드라이버의 순위와 리더 대비 간격을 교환한다.
    const tmpPosition = gainer.position;
    gainer.position = target.position;
    target.position = tmpPosition;

    const tmpGap = gainer.gapToLeaderSeconds;
    gainer.gapToLeaderSeconds = target.gapToLeaderSeconds;
    target.gapToLeaderSeconds = tmpGap;

    return this.buildEvent(
      RaceEventType.Overtake,
      RaceEventPriority.High,
      step.atSecond,
      lapAtStep,
      {
        driverNumber: step.driverNumber,
        targetDriverNumber: step.targetDriverNumber,
      },
      {
        ...this.driverParams(drivers, step.driverNumber, step.targetDriverNumber),
        newPosition: gainer.position,
      },
    );
  }

  private applyPitStop(
    step: Extract<MockScenarioStep, { kind: "pit_stop" }>,
    drivers: Map<number, WorkingDriver>,
    lapAtStep: number,
  ): RaceEvent | null {
    const driver = drivers.get(step.driverNumber);

    if (!driver || driver.retired) {
      return null;
    }

    driver.pitStopCount += 1;
    driver.compound = step.newCompound;
    driver.tireStartLap = lapAtStep;
    driver.inPitUntilSecond = step.atSecond + this.scenario.pitDurationSeconds;

    return this.buildEvent(
      RaceEventType.PitStop,
      RaceEventPriority.High,
      step.atSecond,
      lapAtStep,
      { driverNumber: step.driverNumber },
      {
        ...this.driverParams(drivers, step.driverNumber),
        compound: step.newCompound,
        stopNumber: driver.pitStopCount,
      },
    );
  }

  private applyLap(
    driverNumber: number,
    lapTimeSeconds: number,
    drivers: Map<number, WorkingDriver>,
    type: RaceEventType,
    priority: RaceEventPriority,
    atSecond: number,
    lapAtStep: number,
  ): RaceEvent | null {
    const driver = drivers.get(driverNumber);

    if (!driver || driver.retired) {
      return null;
    }

    driver.lastLapSeconds = lapTimeSeconds;

    if (lapTimeSeconds < driver.personalBestLapSeconds) {
      driver.personalBestLapSeconds = lapTimeSeconds;
    }

    return this.buildEvent(type, priority, atSecond, lapAtStep, { driverNumber }, {
      ...this.driverParams(drivers, driverNumber),
      lapTimeSeconds,
    });
  }

  private applyGapChange(
    step: Extract<MockScenarioStep, { kind: "gap_change" }>,
    drivers: Map<number, WorkingDriver>,
    lapAtStep: number,
  ): RaceEvent | null {
    const driver = drivers.get(step.driverNumber);

    if (!driver || driver.retired) {
      return null;
    }

    driver.gapToLeaderSeconds = Math.max(
      0,
      driver.gapToLeaderSeconds + step.deltaSeconds,
    );

    const type =
      step.deltaSeconds < 0
        ? RaceEventType.GapClosing
        : RaceEventType.GapIncreasing;

    return this.buildEvent(type, RaceEventPriority.Medium, step.atSecond, lapAtStep, {
      driverNumber: step.driverNumber,
    }, {
      ...this.driverParams(drivers, step.driverNumber),
      gapDeltaSeconds: Number(step.deltaSeconds.toFixed(2)),
    });
  }

  private applyRetirement(
    step: Extract<MockScenarioStep, { kind: "retirement" }>,
    drivers: Map<number, WorkingDriver>,
    lapAtStep: number,
  ): RaceEvent | null {
    const driver = drivers.get(step.driverNumber);

    if (!driver || driver.retired) {
      return null;
    }

    driver.retired = true;
    driver.inPitUntilSecond = null;

    return this.buildEvent(
      RaceEventType.Retirement,
      RaceEventPriority.High,
      step.atSecond,
      lapAtStep,
      { driverNumber: step.driverNumber },
      this.driverParams(drivers, step.driverNumber),
    );
  }

  // 이벤트 params 에 드라이버 코드/이름을 담아 UI 가 번역·표시할 수 있게 한다.
  private driverParams(
    drivers: Map<number, WorkingDriver>,
    driverNumber: number,
    targetDriverNumber?: number,
  ): RaceEventParams {
    const driver = drivers.get(driverNumber);
    const params: RaceEventParams = {};

    if (driver) {
      params.driverCode = driver.seed.code;
      params.driverName = driver.seed.fullName;
    }

    if (targetDriverNumber !== undefined) {
      const target = drivers.get(targetDriverNumber);

      if (target) {
        params.targetDriverCode = target.seed.code;
        params.targetDriverName = target.seed.fullName;
      }
    }

    return params;
  }

  private buildEvent(
    type: RaceEventType,
    priority: RaceEventPriority,
    atSecond: number,
    lapNumber: number,
    ids: { driverNumber?: number; targetDriverNumber?: number },
    params: RaceEventParams,
  ): RaceEvent {
    const deduplicationKey = `${this.scenario.sessionId}:${type}:${atSecond}:${ids.driverNumber ?? "-"}:${ids.targetDriverNumber ?? "-"}`;

    const event: RaceEvent = {
      schemaVersion: EVENT_SCHEMA_VERSION,
      id: deduplicationKey,
      sessionId: this.scenario.sessionId,
      type,
      priority,
      timestamp: this.timestampAt(atSecond),
      params,
      deduplicationKey,
      lapNumber,
    };

    if (ids.driverNumber !== undefined) {
      event.driverNumber = ids.driverNumber;
    }

    if (ids.targetDriverNumber !== undefined) {
      event.targetDriverNumber = ids.targetDriverNumber;
    }

    return event;
  }

  // 작업 상태를 정렬된 LiveDriverState[] 로 변환한다.
  private buildDriverStates(
    drivers: Map<number, WorkingDriver>,
    currentLap: number,
    elapsedSeconds: number,
  ): LiveDriverState[] {
    const working = Array.from(drivers.values());

    // 리타이어 드라이버는 순위표 하단으로 정렬한다.
    const sorted = working.slice().sort((a, b) => {
      if (a.retired !== b.retired) {
        return a.retired ? 1 : -1;
      }

      return a.position - b.position;
    });

    const gapByPosition = new Map<number, number>();

    for (const driver of sorted) {
      if (!driver.retired) {
        gapByPosition.set(driver.position, driver.gapToLeaderSeconds);
      }
    }

    return sorted.map((driver) => {
      const startingPosition = driver.seed.gridPosition;

      if (driver.retired) {
        return this.toRetiredState(driver, startingPosition);
      }

      const gapAhead = gapByPosition.get(driver.position - 1);
      const gapBehind = gapByPosition.get(driver.position + 1);

      const intervalToAhead =
        gapAhead === undefined
          ? null
          : Math.max(0, driver.gapToLeaderSeconds - gapAhead);
      const intervalToBehind =
        gapBehind === undefined
          ? null
          : Math.max(0, gapBehind - driver.gapToLeaderSeconds);

      const tireAgeLaps = Math.max(0, currentLap - driver.tireStartLap);

      return {
        driverNumber: driver.seed.driverNumber,
        code: driver.seed.code,
        fullName: driver.seed.fullName,
        teamName: driver.seed.teamName,
        position: driver.position,
        startingPosition,
        positionChange: startingPosition - driver.position,
        gapToLeaderSeconds:
          driver.position === 1
            ? 0
            : Number(driver.gapToLeaderSeconds.toFixed(3)),
        intervalToAheadSeconds:
          intervalToAhead === null ? null : Number(intervalToAhead.toFixed(3)),
        intervalToBehindSeconds:
          intervalToBehind === null ? null : Number(intervalToBehind.toFixed(3)),
        lastLapSeconds: Number(driver.lastLapSeconds.toFixed(3)),
        personalBestLapSeconds: Number(driver.personalBestLapSeconds.toFixed(3)),
        compound: driver.compound,
        tireAgeLaps,
        pitStopCount: driver.pitStopCount,
        inPit:
          driver.inPitUntilSecond !== null &&
          elapsedSeconds < driver.inPitUntilSecond,
        retired: false,
        recentLapTimesSeconds: this.recentLaps(driver.lastLapSeconds),
      };
    });
  }

  private toRetiredState(
    driver: WorkingDriver,
    startingPosition: number,
  ): LiveDriverState {
    return {
      driverNumber: driver.seed.driverNumber,
      code: driver.seed.code,
      fullName: driver.seed.fullName,
      teamName: driver.seed.teamName,
      position: null,
      startingPosition,
      positionChange: null,
      gapToLeaderSeconds: null,
      intervalToAheadSeconds: null,
      intervalToBehindSeconds: null,
      lastLapSeconds: null,
      personalBestLapSeconds: Number(driver.personalBestLapSeconds.toFixed(3)),
      compound: driver.compound,
      tireAgeLaps: null,
      pitStopCount: driver.pitStopCount,
      inPit: false,
      retired: true,
      recentLapTimesSeconds: [],
    };
  }

  private recentLaps(lastLap: number): number[] {
    return [
      Number(lastLap.toFixed(3)),
      Number((lastLap + 0.183).toFixed(3)),
      Number((lastLap + 0.291).toFixed(3)),
    ];
  }
}
