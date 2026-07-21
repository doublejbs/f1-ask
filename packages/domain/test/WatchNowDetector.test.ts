import { describe, expect, it } from "vitest";
import { LiveDriverState } from "../src/LiveDriverState";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";
import { WatchNowDetector } from "../src/watchnow/WatchNowDetector";
import { DEFAULT_WATCH_NOW_DETECTOR_CONFIG } from "../src/watchnow/WatchNowDetectorConfig";
import { WatchNowSignalType } from "../src/watchnow/WatchNowSignalType";

// 감지에 쓰는 필드만 지정하고 나머지는 기본값으로 채우는 드라이버 팩토리.
const makeDriver = (
  overrides: Partial<LiveDriverState> & { driverNumber: number },
): LiveDriverState => ({
  code: `D${overrides.driverNumber}`,
  fullName: "Test Driver",
  teamName: "Test Team",
  position: overrides.driverNumber,
  startingPosition: overrides.driverNumber,
  positionChange: 0,
  gapToLeaderSeconds: null,
  intervalToAheadSeconds: null,
  intervalToBehindSeconds: null,
  lastLapSeconds: null,
  personalBestLapSeconds: null,
  compound: TireCompound.Medium,
  tireAgeLaps: null,
  pitStopCount: 0,
  inPit: false,
  retired: false,
  recentLapTimesSeconds: [],
  ...overrides,
});

let snapshotCounter = 0;

const makeSnapshot = (
  drivers: LiveDriverState[],
  status: SessionStatus = SessionStatus.Green,
): LiveRaceSnapshot => {
  snapshotCounter += 1;

  const iso = new Date(1_700_000_000_000 + snapshotCounter * 6_000).toISOString();

  return {
    schemaVersion: 1,
    sessionId: "test",
    sessionKey: 1,
    meetingKey: 1,
    sessionName: "Race",
    sessionType: "Race",
    circuitName: "test",
    countryCode: "TST",
    status,
    currentLap: 10,
    totalLaps: 50,
    drivers,
    generatedAt: iso,
    sourceUpdatedAt: iso,
    version: snapshotCounter,
  };
};

// 같은 드라이버 상태를 여러 프레임 흘려보내고 발화한 신호를 모두 모은다.
const observeRepeated = (
  detector: WatchNowDetector,
  drivers: LiveDriverState[],
  times: number,
  status: SessionStatus = SessionStatus.Green,
) => {
  const signals = [];

  for (let i = 0; i < times; i += 1) {
    signals.push(...detector.observe(makeSnapshot(drivers, status)));
  }

  return signals;
};

describe("WatchNowDetector — A 타이어 노후", () => {
  it("임계 랩수에 도달하면 발화한다", () => {
    const detector = new WatchNowDetector();

    expect(
      detector.observe(makeSnapshot([makeDriver({ driverNumber: 1, tireAgeLaps: 19 })])),
    ).toHaveLength(0);

    const signals = detector.observe(
      makeSnapshot([makeDriver({ driverNumber: 1, tireAgeLaps: 20 })]),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]?.type).toBe(WatchNowSignalType.TireAge);
    expect(signals[0]?.tireAgeLaps).toBe(20);
  });

  it("한 스틴트에서는 한 번만 발화한다", () => {
    const detector = new WatchNowDetector();
    const signals = observeRepeated(
      detector,
      [makeDriver({ driverNumber: 1, tireAgeLaps: 25 })],
      5,
    );

    expect(signals).toHaveLength(1);
  });

  it("타이어를 갈면 다시 발화할 수 있다", () => {
    const detector = new WatchNowDetector();

    observeRepeated(detector, [makeDriver({ driverNumber: 1, tireAgeLaps: 22 })], 3);
    // 타이어 나이가 줄면 새 스틴트다.
    detector.observe(
      makeSnapshot([makeDriver({ driverNumber: 1, tireAgeLaps: 0, pitStopCount: 1 })]),
    );

    const signals = detector.observe(
      makeSnapshot([makeDriver({ driverNumber: 1, tireAgeLaps: 20, pitStopCount: 1 })]),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]?.type).toBe(WatchNowSignalType.TireAge);
  });

  it("임계값을 설정으로 조절할 수 있다", () => {
    const detector = new WatchNowDetector({
      ...DEFAULT_WATCH_NOW_DETECTOR_CONFIG,
      tireAgeThresholdLaps: 15,
    });

    expect(
      detector.observe(makeSnapshot([makeDriver({ driverNumber: 1, tireAgeLaps: 15 })])),
    ).toHaveLength(1);
  });
});

describe("WatchNowDetector — B 간격 수렴", () => {
  it("연속 3회 유지되어야 발화한다", () => {
    const detector = new WatchNowDetector();
    const close = [makeDriver({ driverNumber: 2, intervalToAheadSeconds: 0.8 })];

    expect(detector.observe(makeSnapshot(close))).toHaveLength(0);
    expect(detector.observe(makeSnapshot(close))).toHaveLength(0);

    const signals = detector.observe(makeSnapshot(close));

    expect(signals).toHaveLength(1);
    expect(signals[0]?.type).toBe(WatchNowSignalType.GapConvergence);
    expect(signals[0]?.gapSeconds).toBe(0.8);
  });

  it("중간에 간격이 벌어지면 연속 카운트가 끊긴다", () => {
    const detector = new WatchNowDetector();
    const close = [makeDriver({ driverNumber: 2, intervalToAheadSeconds: 0.8 })];

    detector.observe(makeSnapshot(close));
    detector.observe(makeSnapshot(close));
    detector.observe(
      makeSnapshot([makeDriver({ driverNumber: 2, intervalToAheadSeconds: 1.4 })]),
    );

    expect(detector.observe(makeSnapshot(close))).toHaveLength(0);
    expect(detector.observe(makeSnapshot(close))).toHaveLength(0);
    expect(detector.observe(makeSnapshot(close))).toHaveLength(1);
  });

  it("재무장 전에는 다시 발화하지 않는다", () => {
    const detector = new WatchNowDetector();
    const close = [makeDriver({ driverNumber: 2, intervalToAheadSeconds: 0.8 })];

    expect(observeRepeated(detector, close, 3)).toHaveLength(1);
    // 임계의 2배(2.0초)를 넘지 않는 한 재무장하지 않는다.
    detector.observe(
      makeSnapshot([makeDriver({ driverNumber: 2, intervalToAheadSeconds: 1.5 })]),
    );

    expect(observeRepeated(detector, close, 3)).toHaveLength(0);
  });

  it("간격이 임계의 2배를 넘으면 재무장한다", () => {
    const detector = new WatchNowDetector();
    const close = [makeDriver({ driverNumber: 2, intervalToAheadSeconds: 0.8 })];

    expect(observeRepeated(detector, close, 3)).toHaveLength(1);
    detector.observe(
      makeSnapshot([makeDriver({ driverNumber: 2, intervalToAheadSeconds: 2.5 })]),
    );

    expect(observeRepeated(detector, close, 3)).toHaveLength(1);
  });

  it("피트레인 안에서는 발화하지 않는다", () => {
    const detector = new WatchNowDetector();
    const inPit = [
      makeDriver({ driverNumber: 2, intervalToAheadSeconds: 0.5, inPit: true }),
    ];

    expect(observeRepeated(detector, inPit, 5)).toHaveLength(0);
  });

  it("SC 중에는 억제되고, 억제를 끄면 발화한다", () => {
    const close = [makeDriver({ driverNumber: 2, intervalToAheadSeconds: 0.3 })];
    const suppressing = new WatchNowDetector();

    expect(
      observeRepeated(suppressing, close, 5, SessionStatus.SafetyCar),
    ).toHaveLength(0);
    expect(
      observeRepeated(suppressing, close, 5, SessionStatus.VirtualSafetyCar),
    ).toHaveLength(0);

    const permissive = new WatchNowDetector({
      ...DEFAULT_WATCH_NOW_DETECTOR_CONFIG,
      suppressGapDuringSafetyCar: false,
    });

    expect(
      observeRepeated(permissive, close, 5, SessionStatus.SafetyCar),
    ).toHaveLength(1);
  });

  it("SC 가 끝나면 스트릭을 처음부터 다시 쌓는다", () => {
    const detector = new WatchNowDetector();
    const close = [makeDriver({ driverNumber: 2, intervalToAheadSeconds: 0.3 })];

    // SC 중 억눌린 관측이 재개 직후 한꺼번에 터지면 안 된다.
    observeRepeated(detector, close, 5, SessionStatus.SafetyCar);

    expect(detector.observe(makeSnapshot(close))).toHaveLength(0);
    expect(detector.observe(makeSnapshot(close))).toHaveLength(0);
    expect(detector.observe(makeSnapshot(close))).toHaveLength(1);
  });

  it("SC 중에도 A · C · D 는 억제되지 않는다", () => {
    const detector = new WatchNowDetector();
    const signals = detector.observe(
      makeSnapshot(
        [makeDriver({ driverNumber: 1, position: 1, tireAgeLaps: 30 })],
        SessionStatus.SafetyCar,
      ),
    );

    expect(signals.map((signal) => signal.type)).toContain(
      WatchNowSignalType.TireAge,
    );
  });
});

describe("WatchNowDetector — C 언더컷 위협", () => {
  const buildField = (pitCounts: Record<number, number>): LiveDriverState[] =>
    [1, 2, 3, 4, 5].map((position) =>
      makeDriver({
        driverNumber: position,
        position,
        pitStopCount: pitCounts[position] ?? 0,
      }),
    );

  it("내 뒤 2계단 이내의 차가 피트인하면 아직 안 들어간 앞차에게 발화한다", () => {
    const detector = new WatchNowDetector();

    detector.observe(makeSnapshot(buildField({})));

    const signals = detector
      .observe(makeSnapshot(buildField({ 4: 1 })))
      .filter((signal) => signal.type === WatchNowSignalType.UndercutThreat);

    // P4 가 피트인 → P2 · P3 이 경고 대상이다 (P1 은 3계단 앞이라 제외).
    expect(signals.map((signal) => signal.driverNumber).sort()).toEqual([2, 3]);
    expect(signals[0]?.rivalDriverNumber).toBe(4);
  });

  it("앞차가 피트인한 경우는 언더컷이 아니다", () => {
    const detector = new WatchNowDetector();

    detector.observe(makeSnapshot(buildField({})));

    const signals = detector
      .observe(makeSnapshot(buildField({ 2: 1 })))
      .filter((signal) => signal.type === WatchNowSignalType.UndercutThreat);

    // P2 가 피트인했으므로 뒤에 있는 P3 · P4 는 위협을 받는 쪽이 아니다.
    expect(signals.map((signal) => signal.driverNumber)).toEqual([1]);
  });

  it("나도 같은 횟수만큼 들어갔으면 발화하지 않는다", () => {
    const detector = new WatchNowDetector();

    detector.observe(makeSnapshot(buildField({ 2: 1, 3: 1 })));

    const signals = detector
      .observe(makeSnapshot(buildField({ 2: 1, 3: 1, 4: 1 })))
      .filter((signal) => signal.type === WatchNowSignalType.UndercutThreat);

    expect(signals).toHaveLength(0);
  });

  it("2스톱에서 뒤차가 나보다 한 번 더 들어가면 발화한다", () => {
    const detector = new WatchNowDetector();

    detector.observe(makeSnapshot(buildField({ 2: 1, 3: 1, 4: 1 })));

    const signals = detector
      .observe(makeSnapshot(buildField({ 2: 1, 3: 1, 4: 2 })))
      .filter((signal) => signal.type === WatchNowSignalType.UndercutThreat);

    expect(signals.map((signal) => signal.driverNumber).sort()).toEqual([2, 3]);
  });

  it("인접 계단 임계를 설정으로 조절할 수 있다", () => {
    const detector = new WatchNowDetector({
      ...DEFAULT_WATCH_NOW_DETECTOR_CONFIG,
      undercutPositionGap: 1,
    });

    detector.observe(makeSnapshot(buildField({})));

    const signals = detector
      .observe(makeSnapshot(buildField({ 4: 1 })))
      .filter((signal) => signal.type === WatchNowSignalType.UndercutThreat);

    expect(signals.map((signal) => signal.driverNumber)).toEqual([3]);
  });
});

// 레이스 중간 합류(콜드 스타트).
//
// **벨기에 GP 회귀 테스트가 이 축을 못 잡는다.** 픽스처는 첫 랩부터 재생하므로 프레임 1의
// pitStopCount 가 전원 0 이고, "이미 피트한 드라이버로 시작하는 첫 스냅샷" 이 존재하지
// 않는다. 세컨드 스크린은 레이스 도중에 켜는 것이 정상 사용 경로이므로 여기서 고정한다.
describe("WatchNowDetector — 레이스 중간 합류", () => {
  // 리뷰어가 재현한 그대로 — P1~P4 가 각각 1/2/1/2 회 피트한 상태로 합류한다.
  const buildMidRaceField = (): LiveDriverState[] =>
    [
      { driverNumber: 1, pitStopCount: 1 },
      { driverNumber: 2, pitStopCount: 2 },
      { driverNumber: 3, pitStopCount: 1 },
      { driverNumber: 4, pitStopCount: 2 },
    ].map((driver) =>
      makeDriver({ ...driver, position: driver.driverNumber }),
    );

  it("이미 피트한 드라이버로 시작해도 첫 프레임에 언더컷이 발화하지 않는다", () => {
    const detector = new WatchNowDetector();

    const signals = detector
      .observe(makeSnapshot(buildMidRaceField()))
      .filter((signal) => signal.type === WatchNowSignalType.UndercutThreat);

    expect(signals).toHaveLength(0);
  });

  it("합류 후 실제로 피트 횟수가 늘면 발화한다", () => {
    const detector = new WatchNowDetector();

    detector.observe(makeSnapshot(buildMidRaceField()));

    // P3 이 2번째 스톱을 마쳤다. P1(1회) · P2(2회) 중 나보다 적게 들어간 P1 만 위협받는다.
    const advanced = buildMidRaceField().map((driver) =>
      driver.driverNumber === 3 ? { ...driver, pitStopCount: 2 } : driver,
    );
    const signals = detector
      .observe(makeSnapshot(advanced))
      .filter((signal) => signal.type === WatchNowSignalType.UndercutThreat);

    expect(signals.map((signal) => signal.driverNumber)).toEqual([1]);
    expect(signals[0]?.rivalDriverNumber).toBe(3);
  });

  it("첫 프레임에 뒤늦게 나타난 드라이버도 기준선만 잡는다", () => {
    const detector = new WatchNowDetector();

    detector.observe(
      makeSnapshot([makeDriver({ driverNumber: 1, position: 1, pitStopCount: 1 })]),
    );

    // P2 가 이번 프레임에 처음 보인다. 피트 2회지만 직전 값이 없으므로 발화하면 안 된다.
    const signals = detector
      .observe(
        makeSnapshot([
          makeDriver({ driverNumber: 1, position: 1, pitStopCount: 1 }),
          makeDriver({ driverNumber: 2, position: 2, pitStopCount: 2 }),
        ]),
      )
      .filter((signal) => signal.type === WatchNowSignalType.UndercutThreat);

    expect(signals).toHaveLength(0);
  });
});

describe("WatchNowDetector — D 순위 급변", () => {
  it("기준점 대비 3계단 이상 변하면 발화한다", () => {
    const detector = new WatchNowDetector();

    detector.observe(makeSnapshot([makeDriver({ driverNumber: 1, position: 10 })]));

    expect(
      detector.observe(makeSnapshot([makeDriver({ driverNumber: 1, position: 8 })])),
    ).toHaveLength(0);

    const signals = detector.observe(
      makeSnapshot([makeDriver({ driverNumber: 1, position: 7 })]),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]?.type).toBe(WatchNowSignalType.PositionSwing);
    expect(signals[0]?.positionFrom).toBe(10);
    expect(signals[0]?.positionTo).toBe(7);
  });

  it("발화 후 기준점이 갱신되어 중복 발화하지 않는다", () => {
    const detector = new WatchNowDetector();

    detector.observe(makeSnapshot([makeDriver({ driverNumber: 1, position: 10 })]));
    detector.observe(makeSnapshot([makeDriver({ driverNumber: 1, position: 7 })]));

    // 기준점이 7 로 갱신됐으므로 같은 순위를 유지하는 동안에는 다시 발화하지 않는다.
    expect(
      observeRepeated(detector, [makeDriver({ driverNumber: 1, position: 7 })], 5),
    ).toHaveLength(0);

    // 갱신된 기준점에서 다시 3계단 움직여야 발화한다.
    expect(
      detector.observe(makeSnapshot([makeDriver({ driverNumber: 1, position: 4 })])),
    ).toHaveLength(1);
  });

  it("순위 하락도 발화한다", () => {
    const detector = new WatchNowDetector();

    detector.observe(makeSnapshot([makeDriver({ driverNumber: 1, position: 5 })]));

    const signals = detector.observe(
      makeSnapshot([makeDriver({ driverNumber: 1, position: 9 })]),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]?.positionTo).toBe(9);
  });
});

describe("WatchNowDetector — 세션 상태 게이트", () => {
  it("레이스가 진행 중이 아니면 아무것도 감지하지 않는다", () => {
    const notRacing = [
      SessionStatus.Scheduled,
      SessionStatus.Red,
      SessionStatus.Suspended,
      SessionStatus.Finished,
      SessionStatus.Unknown,
    ];

    for (const status of notRacing) {
      const detector = new WatchNowDetector();
      const drivers = [
        makeDriver({
          driverNumber: 1,
          position: 1,
          tireAgeLaps: 40,
          intervalToAheadSeconds: 0.2,
        }),
      ];

      expect(observeRepeated(detector, drivers, 5, status)).toHaveLength(0);
    }
  });

  it("옐로 중에는 정상 감지한다", () => {
    const detector = new WatchNowDetector();
    const signals = detector.observe(
      makeSnapshot(
        [makeDriver({ driverNumber: 1, tireAgeLaps: 30 })],
        SessionStatus.Yellow,
      ),
    );

    expect(signals).toHaveLength(1);
  });
});
