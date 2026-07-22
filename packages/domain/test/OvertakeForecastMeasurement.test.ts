import { describe, expect, it } from "vitest";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import {
  buildOpenF1Index,
  normalizeOpenF1SnapshotAt,
} from "../src/openf1/OpenF1Normalizer";
import {
  buildOvertakeForecasts,
  OvertakeForecast,
} from "../src/openf1/OvertakeForecast";
import { DEFAULT_OVERTAKE_FORECAST_CONFIG } from "../src/openf1/OvertakeForecastConfig";
import { OvertakeForecastTracker } from "../src/openf1/OvertakeForecastTracker";
import { parseMs } from "../src/openf1/OpenF1LapMath";
import { loadBelgianGpSessionData } from "./fixtures/BelgianGpFixture";

// docs/23 §검증 2 의 실측 회귀 — 임계값(1.5s/0.15/10랩)은 2026-07 벨기에 GP 실측으로 확정.
//
// 이 파일은 관찰 하네스에서 회귀 테스트로 개편됐다(이전엔 리포트만 찍었다). 픽스처를 15초
// 스텝(339프레임, 실행 ~3s < 20s 예산이라 스텝 유지)으로 리플레이해 수정된 트래커의 발화를
// 실측하고, 아래 값을 정확히 고정한다:
//   - 같은 랩 안 중복 발화 = 0 (flicker 디바운스가 잡아야 함 — 이 테스트의 존재 이유)
//   - HUL→LAW 가 랩 35 이전에 발화 (실제 배틀 L35~39 의 사전 예측 — 예측 기능의 존재 이유)
//   - 발화 총 건수·고유 페어 수 = 재실측값 (정확히 고정)
//   - SC·VSC 프레임 발화 0
//
// 벨기에 GP 실측(2026-07): flicker 수정 전 46페어 79발화(1.72배, 같은 랩 중복 6건)에서
// 수정 후 57발화로 줄었다(고유 페어 46개는 유지). SAI→ALB 최다 7회 → 3회. 소프트 랩 디바운스가
// 소음 페어의 중복 재발화를 걷어내고, 랩당 1회 상한이 피트 아웃·순위 지터의 같은 랩 재발화까지
// 없앤다.
//
// 임계값·트래커·픽스처를 의도적으로 바꾼 경우라면 이 테스트를 단독 실행해
// (`pnpm vitest run packages/domain/test/OvertakeForecastMeasurement.test.ts`)
// expected/actual 차이로 새 실측값을 확인하고, docs/23 §검증 2 의 실측 요약과 함께 갱신한다.

const CADENCE_MS = 15_000;

// 강조 페어 드라이버 번호 (실측 리포트의 highlightPairs 와 동일).
const HUL = 27;
const LAW = 30;
const SAI = 55;
const ALB = 23;

// 재실측으로 확정한 회귀 고정값. 트래커·임계값이 바뀌면 여기가 먼저 깨진다.
const REGRESSION_TOTAL_FIRINGS = 57;
const REGRESSION_UNIQUE_PAIRS = 46;
const REGRESSION_SAI_ALB_FIRINGS = 3;
// HUL→LAW 실제 배틀은 L35 부근에서 시작한다 — 발화는 그 전에 나와야 예측으로서 의미가 있다.
const HUL_LAW_BATTLE_ONSET_LAP = 35;

const pairKey = (chaser: number, target: number): string => `${chaser}:${target}`;

type Firing = {
  frameIndex: number;
  lap: number | null;
  status: SessionStatus;
  forecast: OvertakeForecast;
};

describe("벨기에 GP 추월 예측 회귀 (docs/23 §검증 2, 15초 스텝)", () => {
  it("flicker 수정 후 발화 건수·페어·같은 랩 중복·SC/VSC 발화를 고정한다", () => {
    const data = loadBelgianGpSessionData();
    const index = buildOpenF1Index(data);
    const lapStarts = data.laps
      .map((lap) => parseMs(lap.date_start))
      .filter((ms) => !Number.isNaN(ms));
    const startMs = Math.min(...lapStarts);
    const endMs = Math.max(...lapStarts);

    // ── 스냅샷 스트림 (프레임마다 1회) ──
    const snapshots: LiveRaceSnapshot[] = [];
    const atMsList: number[] = [];
    let version = 0;

    for (let atMs = startMs; atMs <= endMs; atMs += CADENCE_MS) {
      snapshots.push(normalizeOpenF1SnapshotAt(index, atMs, version));
      atMsList.push(atMs);
      version += 1;
    }

    // ── 발화 수집 (기본 설정 · 수정된 트래커) ──
    const tracker = new OvertakeForecastTracker();
    const firings: Firing[] = [];

    snapshots.forEach((snapshot, i) => {
      const forecasts = buildOvertakeForecasts(
        snapshot,
        data,
        atMsList[i]!,
        DEFAULT_OVERTAKE_FORECAST_CONFIG,
      );
      const newly = tracker.observe(forecasts, snapshot);

      for (const forecast of newly) {
        firings.push({
          frameIndex: i,
          lap: snapshot.currentLap,
          status: snapshot.status,
          forecast,
        });
      }
    });

    // ── [1] 발화 총 건수·고유 페어 수 정확 고정 ──
    const uniquePairs = new Set(
      firings.map((f) => pairKey(f.forecast.chaserNumber, f.forecast.targetNumber)),
    );

    expect(firings.length).toBe(REGRESSION_TOTAL_FIRINGS);
    expect(uniquePairs.size).toBe(REGRESSION_UNIQUE_PAIRS);

    // ── [2] 같은 랩 안 중복 발화 = 0 (flicker 디바운스가 잡아야 함) ──
    // 같은 (chaser,target,lap) 조합이 두 번 이상 발화하면 flicker 재발화다. 수정 후 0 이어야 한다.
    const sameLapKeys = new Map<string, number>();

    for (const f of firings) {
      const key = `${f.forecast.chaserNumber}:${f.forecast.targetNumber}:${f.lap}`;

      sameLapKeys.set(key, (sameLapKeys.get(key) ?? 0) + 1);
    }

    const sameLapDuplicates = [...sameLapKeys.values()].filter((n) => n > 1).length;

    expect(sameLapDuplicates).toBe(0);

    // ── [3] SC·VSC 프레임 발화 0 ──
    // 세이프티카·버추얼SC 프레임은 전 차량이 인위적으로 밀착돼 예측 재료가 못 된다(docs/23 §대상).
    // buildOvertakeForecasts 가 애초에 걸러 발화가 없어야 한다.
    const safetyCarFirings = firings.filter(
      (f) =>
        f.status === SessionStatus.SafetyCar ||
        f.status === SessionStatus.VirtualSafetyCar,
    );

    expect(safetyCarFirings.length).toBe(0);

    // ── [4] SAI→ALB 재발화 횟수 고정 ──
    // 수정 전 최다 소음 페어(7회)였다. 디바운스로 3회까지 줄었고 각 발화는 서로 다른 랩이다.
    const saiAlbFirings = firings.filter(
      (f) => f.forecast.chaserNumber === SAI && f.forecast.targetNumber === ALB,
    );

    expect(saiAlbFirings.length).toBe(REGRESSION_SAI_ALB_FIRINGS);

    // ── [5] HUL→LAW 사전 예측 — 랩 35 이전 발화 (이 기능의 존재 이유) ──
    // 실제 배틀은 L35~39 에서 성립한다. 예측이 그 전 랩에 발화돼야 "다음에 볼 것"으로서 가치가 있다.
    const hulLawFirings = firings.filter(
      (f) => f.forecast.chaserNumber === HUL && f.forecast.targetNumber === LAW,
    );

    expect(hulLawFirings.length).toBeGreaterThan(0);

    const earliestHulLawLap = Math.min(
      ...hulLawFirings.map((f) => f.lap ?? Number.POSITIVE_INFINITY),
    );

    expect(earliestHulLawLap).toBeLessThan(HUL_LAW_BATTLE_ONSET_LAP);
  }, 60_000);
});
