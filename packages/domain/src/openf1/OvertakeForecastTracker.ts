import { LiveRaceSnapshot } from "../LiveRaceSnapshot";
import { OvertakeForecast } from "./OvertakeForecast";

// 소프트 소멸(발화 조건 잡음 이탈)을 재무장으로 인정하기까지 요구하는 최소 랩 격차.
// 기본 2 = "최소 한 랩 온전히 부재". 벨기에 GP 실측에서 interval·잡는 속도가 임계값 주변을
// 폴링 잡음으로 오가며 예측이 한두 프레임 빠졌다 돌아오는 flicker 가 관찰됐고(46페어 79발화,
// 1.72배), 그 재발화를 흡수하려면 "한 랩은 온전히 사라져야 진짜 소멸"이라는 디바운스가 필요하다.
// 값은 트래커 옵션으로 열어 두되 기본은 이 상수를 쓴다.
const DEFAULT_REARM_ABSENCE_LAP_GAP = 2;

// 활성 페어의 기억. 재무장 판정을 위해 활성 시점의 양쪽 pitStopCount 를 함께 든다.
// absentSinceLap 은 소프트 소멸(forecasts 목록에서만 빠진 상태)이 시작된 랩. 목록에 있는
// 동안엔 null 이며, 부재가 시작될 때 기록하고 복귀하면 리셋한다.
type ActivePair = {
  chaserNumber: number;
  targetNumber: number;
  chaserPitStopCount: number;
  targetPitStopCount: number;
  absentSinceLap: number | null;
};

type OvertakeForecastTrackerOptions = {
  // 소프트 소멸을 재무장으로 인정하는 최소 랩 격차. 기본 DEFAULT_REARM_ABSENCE_LAP_GAP.
  rearmAbsenceLapGap?: number;
};

const pairKey = (chaserNumber: number, targetNumber: number): string =>
  `${chaserNumber}:${targetNumber}`;

// 추월 예측을 엣지 트리거로 바꾸는 상태 클래스 (docs/23 §이벤트, WatchNowDetector 패턴).
//
// buildOvertakeForecasts 는 매 프레임 "지금 성립하는" 예측을 전부 낸다. 그대로 이벤트로
// 흘리면 폴링마다 재발화해 overtake 소음(docs/22 배경)의 재판이 된다. 이 클래스가 프레임 간
// 상태를 들고 "처음 성립하는 순간" 1회만 통과시킨다. 한 세션에 인스턴스 하나를 두고 스냅샷이
// 갱신될 때마다 observe 를 호출한다.
//
// 재무장 판정은 두 갈래다:
//   - 하드 해체(즉시 재무장): 피트·리타이어·순위 비인접(스왑·제3자 개입). 진짜 에피소드
//     경계이므로 디바운스 없이 즉시 활성 상태를 푼다.
//   - 소프트 소멸(랩 디바운스): 페어는 여전히 순위 인접인데 forecasts 목록에만 없음. 임계값
//     주변 폴링 잡음으로 한두 프레임 빠졌다 돌아오는 flicker 라, 최소 한 랩(rearmAbsenceLapGap)
//     온전히 부재해야 진짜 소멸로 보고 재무장한다.
//
// 그리고 "성립 순간 1회"(docs/23 §이벤트)를 랩 단위로 강제한다: 한 페어는 같은 랩에 두 번
// 발화하지 않는다. 하드 해체는 활성 상태를 즉시 풀지만(재무장 자체는 즉시), 실측에서 피트
// 아웃랩 재등장·순위 데이터 지터가 같은 랩 안 재발화를 만든다. 재발화는 랩이 넘어간 뒤에만
// 허용해 "N랩 후 배틀" 예측이 한 랩에 두 번 나오는 무의미한 소음을 원천 차단한다.
export class OvertakeForecastTracker {
  private readonly activeByPair = new Map<string, ActivePair>();

  // 페어별 마지막 발화 랩. 활성에서 빠진 뒤에도 남겨, 같은 랩 재발화를 막는다.
  // 의도적으로 정리하지 않는다 — 활성 해제 후에도 같은 랩 재발화를 막으려면 남아야 하고,
  // 키가 드라이버 페어라 상한이 유계(O(N²))이며, 세션당 인스턴스라 세션 종료 시 함께 사라진다.
  private readonly lastFiredLapByPair = new Map<string, number | null>();

  private readonly rearmAbsenceLapGap: number;

  constructor(options: OvertakeForecastTrackerOptions = {}) {
    this.rearmAbsenceLapGap =
      options.rearmAbsenceLapGap ?? DEFAULT_REARM_ABSENCE_LAP_GAP;
  }

  // 이번 프레임 forecasts 중 "새로 성립한" 페어만 돌려준다.
  observe(
    forecasts: OvertakeForecast[],
    snapshot: LiveRaceSnapshot,
  ): OvertakeForecast[] {
    const pitStopCountByDriver = new Map<number, number>();
    const retiredByDriver = new Map<number, boolean>();
    const positionByDriver = new Map<number, number | null>();

    for (const driver of snapshot.drivers) {
      pitStopCountByDriver.set(driver.driverNumber, driver.pitStopCount);
      retiredByDriver.set(driver.driverNumber, driver.retired);
      positionByDriver.set(driver.driverNumber, driver.position);
    }

    const currentKeys = new Set(
      forecasts.map((forecast) => pairKey(forecast.chaserNumber, forecast.targetNumber)),
    );

    const currentLap = snapshot.currentLap;

    // 재무장·부재 판정을 아래 성립 판정보다 **먼저** 돌려, 피트 후 같은 프레임에 유지되는
    // 페어가 재무장 → 재성립으로 이어질 수 있게 한다.
    for (const [key, active] of this.activeByPair) {
      const present = currentKeys.has(key);
      const chaserPitStopCount =
        pitStopCountByDriver.get(active.chaserNumber) ?? active.chaserPitStopCount;
      const targetPitStopCount =
        pitStopCountByDriver.get(active.targetNumber) ?? active.targetPitStopCount;
      const pitted =
        chaserPitStopCount > active.chaserPitStopCount ||
        targetPitStopCount > active.targetPitStopCount;
      const retired =
        (retiredByDriver.get(active.chaserNumber) ?? false) ||
        (retiredByDriver.get(active.targetNumber) ?? false);

      // 순위 비인접: chaser 가 target 바로 뒤(pos = targetPos + 1)가 아니면 페어가 해체된 것.
      // 스왑(chaser 가 앞섬)·제3자 개입(간격 벌어짐) 모두 잡힌다. 한쪽 position 이 null 이면
      // 인접 여부를 단정할 수 없으므로 하드 해체로 보지 않는다(피트·리타이어가 이미 담당).
      const chaserPosition = positionByDriver.get(active.chaserNumber) ?? null;
      const targetPosition = positionByDriver.get(active.targetNumber) ?? null;
      const notAdjacent =
        chaserPosition !== null &&
        targetPosition !== null &&
        chaserPosition !== targetPosition + 1;

      // 하드 해체 — 진짜 에피소드 경계라 디바운스 없이 즉시 활성 상태를 푼다.
      if (pitted || retired || notAdjacent) {
        this.activeByPair.delete(key);

        continue;
      }

      // 목록에 다시 있으면(=복귀) 발화 없이 활성 복원하고 부재 기록을 리셋한다.
      if (present) {
        active.absentSinceLap = null;

        continue;
      }

      // 여기부터는 소프트 소멸(인접 유지 + 목록에만 없음). currentLap 이 null 인 프레임에서는
      // 랩 격차를 잴 수 없으므로 판정을 보류하고 상태를 유지한다.
      if (currentLap === null) {
        continue;
      }

      // 첫 부재 프레임: 기준 랩만 찍고 활성 유지.
      if (active.absentSinceLap === null) {
        active.absentSinceLap = currentLap;

        continue;
      }

      // 부재가 최소 한 랩(rearmAbsenceLapGap) 이상 지속되면 진짜 소멸로 보고 재무장한다.
      if (currentLap >= active.absentSinceLap + this.rearmAbsenceLapGap) {
        this.activeByPair.delete(key);
      }
    }

    const newlyEstablished: OvertakeForecast[] = [];

    for (const forecast of forecasts) {
      const key = pairKey(forecast.chaserNumber, forecast.targetNumber);

      // 이미 활성인 페어는 재반환하지 않는다.
      if (this.activeByPair.has(key)) {
        continue;
      }

      // 활성으로 올린다 — 재성립했으므로 이후 프레임엔 다시 재반환하지 않는다.
      this.activeByPair.set(key, {
        chaserNumber: forecast.chaserNumber,
        targetNumber: forecast.targetNumber,
        chaserPitStopCount: pitStopCountByDriver.get(forecast.chaserNumber) ?? 0,
        targetPitStopCount: pitStopCountByDriver.get(forecast.targetNumber) ?? 0,
        absentSinceLap: null,
      });

      // 같은 랩 재발화 차단: 직전 발화가 이 랩이면(하드 해체 후 피트 아웃·지터로 같은 랩에
      // 재등장한 경우) 활성으로만 올리고 발화는 삼킨다. 랩이 넘어간 뒤 재성립하면 그때 발화한다.
      const lastFiredLap = this.lastFiredLapByPair.get(key) ?? null;

      if (currentLap !== null && lastFiredLap !== null && currentLap === lastFiredLap) {
        continue;
      }

      this.lastFiredLapByPair.set(key, currentLap);
      newlyEstablished.push(forecast);
    }

    return newlyEstablished;
  }
}
