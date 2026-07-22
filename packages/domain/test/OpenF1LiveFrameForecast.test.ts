import { describe, expect, it } from "vitest";
import { buildOpenF1LiveFrame } from "../src/openf1/OpenF1Recording";
import {
  buildOpenF1Index,
  normalizeOpenF1SnapshotAt,
} from "../src/openf1/OpenF1Normalizer";
import { buildOvertakeForecasts } from "../src/openf1/OvertakeForecast";
import { loadBelgianGpSessionData } from "./fixtures/BelgianGpFixture";

const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

const belgianGp = loadBelgianGpSessionData();

const startMs = Math.min(
  ...belgianGp.laps.map((lap) => parseMs(lap.date_start)).filter((ms) => !Number.isNaN(ms)),
);

// 경기 중반 시점. 인접 페어의 랩타임 이력이 충분히 쌓여 예측이 계산될 수 있다.
const midRaceMs = Date.parse("2026-07-19T13:40:00.000Z");

describe("buildOpenF1LiveFrame — overtakeForecasts 를 스냅샷에 싣는다", () => {
  it("프레임 스냅샷에 overtakeForecasts 배열이 실린다", () => {
    const { snapshot } = buildOpenF1LiveFrame(belgianGp, {
      startMs,
      nowMs: midRaceMs,
    });

    expect(Array.isArray(snapshot.overtakeForecasts)).toBe(true);
  });

  it("프레임이 싣는 값은 도메인 계산(buildOvertakeForecasts)과 동일하다", () => {
    const { snapshot } = buildOpenF1LiveFrame(belgianGp, {
      startMs,
      nowMs: midRaceMs,
    });

    // 프레임 빌더가 도메인 함수를 그대로 거치는지 정확히 검증한다 — 정규화 스냅샷 + 원본으로
    // 독립 계산한 결과와 일치해야 한다.
    const normalized = normalizeOpenF1SnapshotAt(
      buildOpenF1Index(belgianGp),
      midRaceMs,
      0,
    );
    const expected = buildOvertakeForecasts(normalized, belgianGp, midRaceMs);

    expect(snapshot.overtakeForecasts).toEqual(expected);
  });
});
