import { beforeAll, describe, expect, it } from "vitest";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { WatchNowDetector } from "../src/watchnow/WatchNowDetector";
import {
  DEFAULT_WATCH_NOW_DETECTOR_CONFIG,
  WatchNowDetectorConfig,
} from "../src/watchnow/WatchNowDetectorConfig";
import { WatchNowSignal } from "../src/watchnow/WatchNowSignal";
import { WatchNowSignalType } from "../src/watchnow/WatchNowSignalType";
import { buildBelgianGpSnapshots } from "./fixtures/BelgianGpFixture";

// 2026 벨기에 GP 실데이터 회귀 테스트.
//
// **목적은 "특정 숫자를 재현하는 것"이 아니라 "구현이 나중에 조용히 바뀌는 것을 막는 것"이다.**
// 아래 기대값은 워커 폴링 주기(6초)로 실데이터를 재생해 측정한 값이며, 임계값을 바꾸면
// 당연히 달라진다. 감지 로직을 의도적으로 고쳤다면 이 값도 함께 갱신하고, 의도하지
// 않았는데 깨졌다면 회귀다.
//
// 관측 밀도 민감도도 함께 확인했다 (cadence 4 · 5 · 6 · 8 · 10초):
//   A 는 18 로 완전히 불변(랩 기반), C 는 21~22, D 는 61~70, B 는 89~97.
// 6초 근방에서 knife-edge 가 아니므로 이 값을 고정해도 무의미하게 깨지지 않는다.

const countByType = (signals: WatchNowSignal[]): Map<WatchNowSignalType, number> => {
  const counts = new Map<WatchNowSignalType, number>();

  for (const signal of signals) {
    counts.set(signal.type, (counts.get(signal.type) ?? 0) + 1);
  }

  return counts;
};

let snapshots: LiveRaceSnapshot[] = [];

const runDetector = (
  overrides: Partial<WatchNowDetectorConfig> = {},
): WatchNowSignal[] => {
  const detector = new WatchNowDetector({
    ...DEFAULT_WATCH_NOW_DETECTOR_CONFIG,
    ...overrides,
  });
  const signals: WatchNowSignal[] = [];

  for (const snapshot of snapshots) {
    signals.push(...detector.observe(snapshot));
  }

  return signals;
};

describe("WatchNow 실데이터 회귀 — 2026 벨기에 GP", () => {
  beforeAll(() => {
    // 2.4MB 픽스처 파싱 + 848 프레임 정규화는 1.5초 남짓 걸린다. 파일당 1회만 한다.
    snapshots = buildBelgianGpSnapshots().snapshots;
  });

  it("스냅샷 스트림이 레이스 전 구간을 덮는다", () => {
    expect(snapshots).toHaveLength(848);
    // SC · VSC 구간이 실제로 존재해야 억제 검증이 의미를 갖는다.
    const safetyCarFrames = snapshots.filter(
      (snapshot) =>
        snapshot.status === SessionStatus.SafetyCar ||
        snapshot.status === SessionStatus.VirtualSafetyCar,
    );

    expect(safetyCarFrames).toHaveLength(91);
  });

  it("채택 임계값에서의 감지 건수를 고정한다", () => {
    const counts = countByType(runDetector());

    // A 타이어 노후 (20랩). 51개 스틴트 중 20랩 이상 간 것이 18개다.
    // 원본 stint 행을 직접 세도 동일한 18이 나온다 — 스냅샷 경로가 원본과 일치한다.
    expect(counts.get(WatchNowSignalType.TireAge)).toBe(18);

    // B 간격 수렴 (1.0초 · 연속 3회 · SC 억제 켬).
    //
    // 93 → 92 로 내렸다. 정규화 층에서 **선두의 `intervalToAheadSeconds` 를 `null` 로**
    // 바꾼 결과다(OpenF1Normalizer). 그전에는 OpenF1 이 선두에게 보내는 `interval: 0` 이
    // 그대로 흘러 `0 < 1.0` 으로 발화했고 "P1 앞차와 0.0초" 라는 문장이 화면에 떴다.
    //
    // 순 감소는 1건이지만 실제로 바뀐 것은 7건이며, 전부 설명된다:
    //   제거 4건 — 전부 `P1` · `gap=0` 이다(ANT · VER · LEC · NOR). 레이스 중 선두가
    //     바뀔 때마다, 뒤차로서 이미 armed 상태였던 드라이버가 선두에 오르는 순간
    //     0 으로 한 번 발화했다. 리드 체인지 횟수만큼 나온 것이지 그 이상이 아니다.
    //   추가 3건 — 전부 선두가 아니고 실제 간격이 있다(VER P3 0.313 · ANT P5 0.0 ·
    //     NOR P2 0.568). 발화 시 `gapArmed = false` 로 무장이 풀리므로, 가짜 발화가
    //     그 드라이버를 disarm 시켜 **뒤로 처진 뒤의 진짜 접전을 가려 왔다.** 이제
    //     선두 구간에서는 `gap === null` 로 스트릭만 끊기고 무장은 유지되어 되살아난다.
    //
    // 즉 감소분은 "선두 1대분"이고, 늘어난 쪽은 원래 나왔어야 할 신호다.
    expect(counts.get(WatchNowSignalType.GapConvergence)).toBe(92);

    // C 언더컷 위협 (2계단). 28회 피트인이 만들어낸 위협 알림 수다.
    expect(counts.get(WatchNowSignalType.UndercutThreat)).toBe(21);

    // D 순위 급변 (3계단 · 발화 시 기준점 갱신).
    expect(counts.get(WatchNowSignalType.PositionSwing)).toBe(68);
  });

  it("임계값별 감지 건수를 고정한다", () => {
    const tireAgeCounts = [15, 20, 25].map(
      (threshold) =>
        countByType(runDetector({ tireAgeThresholdLaps: threshold })).get(
          WatchNowSignalType.TireAge,
        ) ?? 0,
    );

    expect(tireAgeCounts).toEqual([31, 18, 11]);

    const undercutCounts = [1, 2, 3].map(
      (threshold) =>
        countByType(runDetector({ undercutPositionGap: threshold })).get(
          WatchNowSignalType.UndercutThreat,
        ) ?? 0,
    );

    expect(undercutCounts).toEqual([10, 21, 35]);

    const positionSwingCounts = [2, 3, 4].map(
      (threshold) =>
        countByType(runDetector({ positionSwingThreshold: threshold })).get(
          WatchNowSignalType.PositionSwing,
        ) ?? 0,
    );

    expect(positionSwingCounts).toEqual([107, 68, 35]);
  });

  it("SC 억제가 간격 감지를 실제로 걸러낸다", () => {
    const suppressed = countByType(runDetector()).get(
      WatchNowSignalType.GapConvergence,
    );
    const unsuppressed = countByType(
      runDetector({ suppressGapDuringSafetyCar: false }),
    ).get(WatchNowSignalType.GapConvergence);

    // 선두 `null` 화(위 테스트 참고)로 양쪽이 나란히 1건씩 내려갔다: 93 → 92,
    // 103 → 102. **억제의 순 효과 10건은 그대로다** — 선두는 SC 여부와 무관하게
    // 빠지므로 억제 축과 직교한다. 두 축이 서로를 오염시키지 않았다는 확인이다.
    expect(suppressed).toBe(92);
    expect(unsuppressed).toBe(102);

    // 순 감소는 10건이지만, 억제의 진짜 효과는 "몇 건이 사라지는가"가 아니라
    // "몇 건이 SC 한복판에서 터지는가"다. 억제를 끄면 102건 중 19건(19%)이 SC 구간
    // 안에서 발화한다 — 전 차량이 밀착해 간격이 무의미해진 바로 그 순간이다.
    // 억제하면 그중 10건은 사라지고 9건은 그린 재개 후 제대로 된 시점으로 밀린다.
    //
    // 20 → 19 로 준 것도 선두 `null` 화 때문이다. SC 중에는 전 차량이 밀착하므로
    // 선두의 가짜 0 초도 그 안에서 한 번 발화하고 있었다.
    const safetyCarFrameTimes = new Set(
      snapshots
        .filter(
          (snapshot) =>
            snapshot.status === SessionStatus.SafetyCar ||
            snapshot.status === SessionStatus.VirtualSafetyCar,
        )
        .map((snapshot) => snapshot.generatedAt),
    );
    const firedDuringSafetyCar = runDetector({
      suppressGapDuringSafetyCar: false,
    }).filter(
      (signal) =>
        signal.type === WatchNowSignalType.GapConvergence &&
        safetyCarFrameTimes.has(signal.detectedAt),
    );

    expect(firedDuringSafetyCar).toHaveLength(19);

    // 억제를 켜면 SC 구간에서 발화한 간격 신호가 하나도 없어야 한다.
    const suppressedDuringSafetyCar = runDetector().filter(
      (signal) =>
        signal.type === WatchNowSignalType.GapConvergence &&
        safetyCarFrameTimes.has(signal.detectedAt),
    );

    expect(suppressedDuringSafetyCar).toHaveLength(0);
  });

  it("SC 중에도 C · D 는 계속 감지한다", () => {
    // SC 가 왜곡하는 것은 간격이지 피트 사실이나 순위가 아니다. 오히려 SC 중 피트인은
    // 정지 손실이 작아 전략적으로 가장 결정적이므로 여기서 막으면 안 된다.
    const safetyCarFrameTimes = new Set(
      snapshots
        .filter(
          (snapshot) =>
            snapshot.status === SessionStatus.SafetyCar ||
            snapshot.status === SessionStatus.VirtualSafetyCar,
        )
        .map((snapshot) => snapshot.generatedAt),
    );
    const duringSafetyCar = runDetector().filter((signal) =>
      safetyCarFrameTimes.has(signal.detectedAt),
    );
    const counts = countByType(duringSafetyCar);

    expect(counts.get(WatchNowSignalType.UndercutThreat)).toBe(6);
    expect(counts.get(WatchNowSignalType.GapConvergence)).toBeUndefined();
  });

  it("신호가 시간 순서대로 나오고 필수 필드가 채워진다", () => {
    const signals = runDetector();

    expect(signals.length).toBeGreaterThan(0);

    for (const signal of signals) {
      expect(signal.driverNumber).toBeGreaterThan(0);
      expect(signal.driverCode).not.toBe("");
      expect(Number.isNaN(Date.parse(signal.detectedAt))).toBe(false);
    }

    const times = signals.map((signal) => Date.parse(signal.detectedAt));

    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("C 는 피트인한 뒤차가 아니라 위협받는 앞차에게 발화한다", () => {
    const undercuts = runDetector().filter(
      (signal) => signal.type === WatchNowSignalType.UndercutThreat,
    );

    expect(undercuts.length).toBeGreaterThan(0);

    for (const signal of undercuts) {
      // 신호의 주체와 피트인한 상대는 항상 다른 드라이버다.
      expect(signal.rivalDriverNumber).not.toBeNull();
      expect(signal.rivalDriverNumber).not.toBe(signal.driverNumber);
    }
  });
});
