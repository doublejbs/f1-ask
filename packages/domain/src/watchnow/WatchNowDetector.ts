import { LiveDriverState } from "../LiveDriverState";
import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { SessionStatus } from "../SessionStatus";
import {
  DEFAULT_WATCH_NOW_DETECTOR_CONFIG,
  WatchNowDetectorConfig,
} from "./WatchNowDetectorConfig";
import { WatchNowSignal } from "./WatchNowSignal";
import { WatchNowSignalType } from "./WatchNowSignalType";

// position 이 확정된 드라이버. 인접 판정에서 null 분기를 없앤다.
type RankedDriver = LiveDriverState & { position: number };

// 드라이버별 감지 상태. 스냅샷은 상태가 없으므로 감지기가 프레임 간 기억을 들고 있어야 한다.
type DriverDetectorState = {
  // A. 현재 스틴트에서 이미 발화했는가 (스틴트당 1회 제한).
  tireFiredForStint: boolean;
  // A. 스틴트 교체 판정용 — 타이어 나이가 줄면 새 스틴트다.
  lastTireAgeLaps: number | null;
  // C. 직전 관측의 피트 횟수 — 증가분이 곧 "방금 피트인했다"는 뜻이다.
  //
  // null 은 "아직 이 드라이버를 한 번도 관측하지 않았다"는 뜻이며 0(관측했고 피트가
  // 없었다)과 반드시 구분해야 한다. 0 으로 시작하면 레이스 중간에 합류한 첫 프레임에서
  // **이미 피트한 드라이버 전원이 "방금 피트인했다"로 잡힌다.** 세컨드 스크린은 레이스
  // 도중에 켜는 것이 정상 사용 경로이므로 이 오발화가 곧 첫 화면이 된다.
  lastPitStopCount: number | null;
  // B. 간격이 임계 아래로 유지된 연속 관측 횟수.
  gapConsecutiveCount: number;
  // B. 발화 후 재무장 전까지 다시 발화하지 않는다.
  gapArmed: boolean;
  // D. 순위 변동을 재는 기준점. 발화할 때마다 현재 순위로 갱신해 중복을 없앤다.
  positionBaseline: number | null;
  // F. 발화 후 재무장 전까지 다시 발화하지 않는다. 조건이 깨지면(사거리 이탈·타이어 교체 등)
  //    자동으로 재무장한다 — 같은 윈도우 동안 매 프레임 반복 발화하는 것을 막는 엣지 트리거다.
  pitWindowArmed: boolean;
};

const createDriverState = (): DriverDetectorState => ({
  tireFiredForStint: false,
  lastTireAgeLaps: null,
  lastPitStopCount: null,
  gapConsecutiveCount: 0,
  gapArmed: true,
  positionBaseline: null,
  pitWindowArmed: true,
});

// 감지가 의미를 갖는 세션 상태.
//
// Scheduled · Finished · Unknown 은 레이스가 진행 중이 아니다. Red · Suspended 는 전 차량이
// 피트레인에 정지해 있어 간격 · 순위 · 피트 횟수가 모두 레이스 상황을 뜻하지 않는다 —
// 이때 관측하면 재개 시 순위 재정렬이 통째로 "순위 급변"으로 잡힌다.
const isRacingStatus = (status: SessionStatus): boolean =>
  status === SessionStatus.Green ||
  status === SessionStatus.Yellow ||
  status === SessionStatus.SafetyCar ||
  status === SessionStatus.VirtualSafetyCar;

// SC · VSC 는 전 차량을 인위적으로 밀착시키므로 간격 기반 감지가 무의미해진다.
const isSafetyCarStatus = (status: SessionStatus): boolean =>
  status === SessionStatus.SafetyCar ||
  status === SessionStatus.VirtualSafetyCar;

// 스냅샷 스트림을 받아 "지금 볼 것" 신호를 내는 결정론적 감지기.
//
// LLM 을 쓰지 않는다 — 타이어 나이 · 간격 · 피트 횟수 · 순위가 모두 스냅샷에 이미 있어
// 순수 계산으로 나온다(docs/19-watch-now.md §원칙).
//
// 프레임 간 상태를 들고 있으므로 순수 함수가 아니라 클래스다. 한 세션에 인스턴스 하나를
// 두고 스냅샷이 갱신될 때마다 observe 를 호출한다.
export class WatchNowDetector {
  private readonly config: WatchNowDetectorConfig;
  private readonly stateByDriver = new Map<number, DriverDetectorState>();

  constructor(config: WatchNowDetectorConfig = DEFAULT_WATCH_NOW_DETECTOR_CONFIG) {
    this.config = config;
  }

  // 스냅샷 하나를 관측하고 이번 프레임에서 새로 발화한 신호만 돌려준다.
  observe(snapshot: LiveRaceSnapshot): WatchNowSignal[] {
    if (!isRacingStatus(snapshot.status)) {
      return [];
    }

    const signals: WatchNowSignal[] = [];
    const gapSuppressed =
      this.config.suppressGapDuringSafetyCar && isSafetyCarStatus(snapshot.status);

    // C 는 "직전 대비 피트 횟수가 늘었는가"로 피트인을 잡으므로, 드라이버별 상태를
    // 갱신하기 **전에** 스냅샷 전체를 훑어야 한다.
    signals.push(...this.detectUndercutThreats(snapshot));

    // F 는 앞차(순위 −1)의 타이어를 봐야 하므로 순위→드라이버 색인을 미리 만든다.
    const driverByPosition = new Map<number, LiveDriverState>();

    for (const driver of snapshot.drivers) {
      if (driver.position !== null) {
        driverByPosition.set(driver.position, driver);
      }
    }

    for (const driver of snapshot.drivers) {
      const state = this.stateFor(driver.driverNumber);

      this.detectTireAge(snapshot, driver, state, signals);
      this.detectGapConvergence(snapshot, driver, state, gapSuppressed, signals);
      this.detectPositionSwing(snapshot, driver, state, signals);
      this.detectPitWindow(
        snapshot,
        driver,
        state,
        gapSuppressed,
        driverByPosition,
        signals,
      );

      state.lastPitStopCount = driver.pitStopCount;
    }

    return signals;
  }

  private stateFor(driverNumber: number): DriverDetectorState {
    const existing = this.stateByDriver.get(driverNumber);

    if (existing !== undefined) {
      return existing;
    }

    const created = createDriverState();

    this.stateByDriver.set(driverNumber, created);

    return created;
  }

  // A. 타이어 노후 — 타이어가 임계 랩수에 도달하면 스틴트당 1회 발화한다.
  private detectTireAge(
    snapshot: LiveRaceSnapshot,
    driver: LiveDriverState,
    state: DriverDetectorState,
    signals: WatchNowSignal[],
  ): void {
    const tireAge = driver.tireAgeLaps;

    if (tireAge === null) {
      return;
    }

    // 타이어 나이가 줄었다면 새 타이어로 갈았다는 뜻이다. 피트 횟수 증가만으로 판정하면
    // 드라이브스루처럼 타이어를 안 가는 피트인에서 잘못 초기화된다.
    const isNewStint =
      state.lastTireAgeLaps !== null && tireAge < state.lastTireAgeLaps;

    if (isNewStint) {
      state.tireFiredForStint = false;
    }

    state.lastTireAgeLaps = tireAge;

    if (state.tireFiredForStint || tireAge < this.config.tireAgeThresholdLaps) {
      return;
    }

    state.tireFiredForStint = true;

    signals.push({
      type: WatchNowSignalType.TireAge,
      driverNumber: driver.driverNumber,
      driverCode: driver.code,
      lapNumber: snapshot.currentLap,
      detectedAt: snapshot.generatedAt,
      tireAgeLaps: tireAge,
      gapSeconds: null,
      rivalDriverNumber: null,
      rivalDriverCode: null,
      positionFrom: null,
      positionTo: null,
      predictedLapsToBattle: null,
    });
  }

  // B. 간격 수렴 — 앞차 간격이 임계 아래로 내려가 연속 N회 유지되면 발화한다.
  private detectGapConvergence(
    snapshot: LiveRaceSnapshot,
    driver: LiveDriverState,
    state: DriverDetectorState,
    gapSuppressed: boolean,
    signals: WatchNowSignal[],
  ): void {
    const gap = driver.intervalToAheadSeconds;
    const rearmThreshold =
      this.config.gapThresholdSeconds * this.config.gapRearmMultiplier;

    // 피트레인 · 리타이어 차량의 "앞차 간격"은 레이스 상황을 뜻하지 않는다.
    // 간격을 모르는 경우(선두 · 랩다운)도 연속성이 끊긴 것으로 본다.
    if (gap === null || driver.inPit || driver.retired) {
      state.gapConsecutiveCount = 0;

      return;
    }

    if (gap > rearmThreshold) {
      state.gapArmed = true;
    }

    // SC · VSC 중에는 스트릭을 끊기만 하고 발화하지 않는다. 유지했다가는 재개 직후
    // 밀착이 풀리기도 전에 억눌린 스트릭이 한꺼번에 터진다.
    if (gapSuppressed) {
      state.gapConsecutiveCount = 0;

      return;
    }

    if (gap >= this.config.gapThresholdSeconds) {
      state.gapConsecutiveCount = 0;

      return;
    }

    state.gapConsecutiveCount += 1;

    if (
      !state.gapArmed ||
      state.gapConsecutiveCount < this.config.gapConsecutiveSamples
    ) {
      return;
    }

    state.gapArmed = false;

    signals.push({
      type: WatchNowSignalType.GapConvergence,
      driverNumber: driver.driverNumber,
      driverCode: driver.code,
      lapNumber: snapshot.currentLap,
      detectedAt: snapshot.generatedAt,
      tireAgeLaps: null,
      gapSeconds: gap,
      rivalDriverNumber: null,
      rivalDriverCode: null,
      positionFrom: null,
      positionTo: null,
      predictedLapsToBattle: null,
    });
  }

  // F. 피트 윈도우 — 앞차와 언더컷 사거리 안이고 내 타이어가 낡았으면 "지금 피트하면
  // 앞차를 언더컷할 기회"로 본다. C(수비: 뒤차가 나를 위협)의 공격 짝이다.
  //
  // 신호의 주체는 **피트해야 할 나**(앞차가 아니라). 재무장은 조건이 깨지면 자동으로 된다 —
  // 사거리를 벗어나거나 타이어를 갈면 armed 를 되살려, 같은 윈도우 동안 반복 발화하지 않되
  // 윈도우가 새로 열리면 다시 발화한다(GapConvergence 의 armed 와 같은 엣지 트리거).
  //
  // SC · VSC 는 간격을 인위적으로 좁히므로 B 와 함께 억제한다(gapSuppressed).
  private detectPitWindow(
    snapshot: LiveRaceSnapshot,
    driver: LiveDriverState,
    state: DriverDetectorState,
    gapSuppressed: boolean,
    driverByPosition: Map<number, LiveDriverState>,
    signals: WatchNowSignal[],
  ): void {
    const eligible = this.isPitWindowEligible(
      driver,
      gapSuppressed,
      driverByPosition,
    );

    // 조건이 성립하지 않으면 재무장만 하고 끝낸다 — 다음에 윈도우가 열리면 발화할 수 있게.
    if (eligible === null) {
      state.pitWindowArmed = true;

      return;
    }

    // 조건은 성립하지만 이미 이 윈도우에서 발화했다면 침묵한다.
    if (!state.pitWindowArmed) {
      return;
    }

    state.pitWindowArmed = false;

    signals.push({
      type: WatchNowSignalType.PitWindow,
      driverNumber: driver.driverNumber,
      driverCode: driver.code,
      lapNumber: snapshot.currentLap,
      detectedAt: snapshot.generatedAt,
      tireAgeLaps: driver.tireAgeLaps,
      gapSeconds: eligible.gapSeconds,
      rivalDriverNumber: eligible.target.driverNumber,
      rivalDriverCode: eligible.target.code,
      positionFrom: null,
      positionTo: null,
      predictedLapsToBattle: null,
    });
  }

  // F 발화 조건을 한곳에서 판정한다. 성립하면 앞차와 간격을, 아니면 null 을 돌려준다.
  private isPitWindowEligible(
    driver: LiveDriverState,
    gapSuppressed: boolean,
    driverByPosition: Map<number, LiveDriverState>,
  ): { target: LiveDriverState; gapSeconds: number } | null {
    // SC · VSC 중 간격은 인위적이라 판단 재료가 못 된다.
    if (gapSuppressed) {
      return null;
    }

    // 내가 피트레인 · 리타이어면 피트 타이밍을 논할 상황이 아니다.
    if (driver.inPit || driver.retired) {
      return null;
    }

    // 선두(앞차 없음)거나 순위를 모르면 언더컷 대상이 없다.
    if (driver.position === null || driver.position <= 1) {
      return null;
    }

    // 내 타이어가 아직 새것이면 피트할 때가 아니다.
    const tireAge = driver.tireAgeLaps;

    if (tireAge === null || tireAge < this.config.pitWindowMinTireAgeLaps) {
      return null;
    }

    // 앞차 간격이 사거리 밖이거나 알 수 없으면(선두 · 랩다운) 대상이 아니다.
    const gap = driver.intervalToAheadSeconds;

    if (
      gap === null ||
      gap <= 0 ||
      gap > this.config.pitWindowGapThresholdSeconds
    ) {
      return null;
    }

    const target = driverByPosition.get(driver.position - 1);

    // 앞차가 피트레인 · 리타이어면 언더컷할 대상이 아니다.
    if (target === undefined || target.inPit || target.retired) {
      return null;
    }

    // 앞차가 방금 새 타이어로 갈았다면(타이어가 젊다면) 언더컷이 무의미하다. 나이를 모르면
    // 보수적으로 대상으로 인정한다 — 정보가 없다고 기회를 지어내지도, 지우지도 않는다.
    if (
      target.tireAgeLaps !== null &&
      target.tireAgeLaps < this.config.pitWindowMinTireAgeLaps
    ) {
      return null;
    }

    return { target, gapSeconds: gap };
  }

  // C. 언더컷 위협 — 내 뒤 N계단 이내의 차가 피트인했고 나는 아직 안 들어갔다.
  //
  // 신호의 주체는 피트인한 뒤차가 아니라 **아직 트랙에 남은 앞차**다. 위협을 받는 쪽이
  // 알림을 받아야 한다.
  //
  // "아직 안 들어갔다"를 "피트 횟수 0"이 아니라 "뒤차보다 적게 들어갔다"로 정의한다.
  // 2스톱 레이스에서 뒤차가 두 번째 스톱을 마쳤는데 나는 한 번만 했다면 상대는 나보다
  // 새 타이어이고 그것이 정확히 언더컷 위협이다 — "피트 횟수 0" 조건은 이 경우를 통째로
  // 놓친다.
  private detectUndercutThreats(snapshot: LiveRaceSnapshot): WatchNowSignal[] {
    const ranked = snapshot.drivers
      .filter((driver): driver is RankedDriver => driver.position !== null)
      .sort((a, b) => a.position - b.position);
    const signals: WatchNowSignal[] = [];

    for (const pitter of ranked) {
      // `?? null` 이 두 가지("상태 자체가 없다" · "상태는 있는데 아직 관측 전이다")를
      // 하나로 모은다. 어느 쪽이든 비교할 직전 값이 없다는 뜻이다.
      const previousPitCount =
        this.stateByDriver.get(pitter.driverNumber)?.lastPitStopCount ?? null;

      // 첫 관측에서는 기준선만 잡고 넘어간다. A(lastTireAgeLaps) · D(positionBaseline) 가
      // null 로 첫 프레임을 막는 것과 같은 모양이다 — 여기만 예외를 두면 레이스 중간
      // 합류 시 이미 피트한 드라이버가 전부 언더컷 위협으로 오발화한다.
      if (previousPitCount === null) {
        continue;
      }

      // 이번 프레임에 피트 횟수가 늘어난 드라이버만이 "방금 피트인했다".
      if (pitter.pitStopCount <= previousPitCount) {
        continue;
      }

      for (const observer of ranked) {
        const positionGap = pitter.position - observer.position;

        // 나보다 뒤에 있고, 순위가 인접 범위 안에 있는 차만 위협이다.
        if (positionGap <= 0 || positionGap > this.config.undercutPositionGap) {
          continue;
        }

        // 나도 이미 같은 횟수만큼 들어갔다면 상대에게 타이어 우위가 없다.
        if (observer.pitStopCount >= pitter.pitStopCount) {
          continue;
        }

        // 나도 지금 피트레인에 있거나 리타이어했다면 경고할 상황이 아니다.
        if (observer.inPit || observer.retired) {
          continue;
        }

        signals.push({
          type: WatchNowSignalType.UndercutThreat,
          driverNumber: observer.driverNumber,
          driverCode: observer.code,
          lapNumber: snapshot.currentLap,
          detectedAt: snapshot.generatedAt,
          tireAgeLaps: observer.tireAgeLaps,
          gapSeconds: null,
          rivalDriverNumber: pitter.driverNumber,
          rivalDriverCode: pitter.code,
          positionFrom: null,
          positionTo: null,
          predictedLapsToBattle: null,
        });
      }
    }

    return signals;
  }

  // D. 순위 급변 — 기준점 대비 임계 이상 순위가 변하면 발화하고 기준점을 갱신한다.
  //
  // 기준점 갱신이 곧 중복 제거다. 고정된 기준점(출발 순위)을 쓰면 한 번 크게 움직인
  // 드라이버가 그 뒤로 매 프레임 발화한다.
  private detectPositionSwing(
    snapshot: LiveRaceSnapshot,
    driver: LiveDriverState,
    state: DriverDetectorState,
    signals: WatchNowSignal[],
  ): void {
    const position = driver.position;

    if (position === null) {
      return;
    }

    const baseline = state.positionBaseline;

    if (baseline === null) {
      state.positionBaseline = position;

      return;
    }

    if (Math.abs(position - baseline) < this.config.positionSwingThreshold) {
      return;
    }

    state.positionBaseline = position;

    signals.push({
      type: WatchNowSignalType.PositionSwing,
      driverNumber: driver.driverNumber,
      driverCode: driver.code,
      lapNumber: snapshot.currentLap,
      detectedAt: snapshot.generatedAt,
      tireAgeLaps: null,
      gapSeconds: null,
      rivalDriverNumber: null,
      rivalDriverCode: null,
      positionFrom: baseline,
      positionTo: position,
      predictedLapsToBattle: null,
    });
  }
}
