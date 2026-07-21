import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LiveRaceSnapshot } from "../../src/LiveRaceSnapshot";
import {
  buildOpenF1Index,
  normalizeOpenF1SnapshotAt,
} from "../../src/openf1/OpenF1Normalizer";
import {
  OpenF1Driver,
  OpenF1Interval,
  OpenF1Lap,
  OpenF1Pit,
  OpenF1Position,
  OpenF1RaceControl,
  OpenF1SessionData,
  OpenF1Stint,
} from "../../src/openf1/OpenF1Types";

// 2026 벨기에 GP 실데이터 축약본. 감지에 쓰는 필드만 남아 있고 필드명은 OpenF1 원본 그대로다.
type BelgianGpFixture = {
  sessionKey: number;
  note: string;
  intervals: OpenF1Interval[];
  stints: OpenF1Stint[];
  pit: OpenF1Pit[];
  position: OpenF1Position[];
  laps: OpenF1Lap[];
  raceControl: OpenF1RaceControl[];
  drivers?: OpenF1Driver[];
};

// 감지기는 최종적으로 워커의 라이브 스냅샷 위에서 돈다. 회귀 테스트만 원본 형태를 쓰면
// 감지 로직이 두 벌이 되므로, 픽스처를 OpenF1SessionData 로 되돌린 뒤 프로덕션과 **동일한**
// normalizeOpenF1SnapshotAt 을 태워 스냅샷 스트림으로 만든다.
const toSessionData = (fixture: BelgianGpFixture): OpenF1SessionData => {
  // 감지기 자체는 번호 · 순위 · 타이어 · 피트만 보고 이름을 쓰지 않는다. 다만 랭킹 결과를
  // 사람이 읽고 판단할 때는 번호(#44)보다 코드(HAM)가 훨씬 낫다. 픽스처에 drivers 가 있으면
  // 그것을 쓰고, 없으면 등장 번호로 최소 목록을 합성한다.
  const driverNumbers = [
    ...new Set([
      ...fixture.position.map((row) => row.driver_number),
      ...fixture.intervals.map((row) => row.driver_number),
      ...fixture.stints.map((row) => row.driver_number),
    ]),
  ].sort((a, b) => a - b);

  return {
    meta: {
      sessionId: `openf1:${fixture.sessionKey}`,
      sessionKey: fixture.sessionKey,
      meetingKey: 0,
      sessionName: "Race",
      sessionType: "Race",
      circuitName: "spa-francorchamps",
      countryCode: "BEL",
    },
    drivers:
      fixture.drivers !== undefined && fixture.drivers.length > 0
        ? fixture.drivers
        : driverNumbers.map((number) => ({
            driver_number: number,
            name_acronym: `D${number}`,
            full_name: `Driver ${number}`,
            team_name: "Unknown",
          })),
    positions: fixture.position,
    intervals: fixture.intervals,
    stints: fixture.stints,
    laps: fixture.laps,
    pits: fixture.pit,
    raceControl: fixture.raceControl,
  };
};

const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

export const loadBelgianGpSessionData = (): OpenF1SessionData => {
  const path = fileURLToPath(new URL("./BelgianGp2026.json", import.meta.url));
  const fixture = JSON.parse(readFileSync(path, "utf8")) as BelgianGpFixture;

  return toSessionData(fixture);
};

// 워커 폴링 주기(docs/16-poller-worker.md — 6초 간격). 회귀 수치를 프로덕션과 같은
// 관측 밀도에서 고정하려고 그대로 맞춘다. B 의 "연속 3회"는 이 주기에 묶여 있다.
export const BELGIAN_GP_CADENCE_MS = 6_000;

export type BelgianGpSnapshotStream = {
  snapshots: LiveRaceSnapshot[];
  startMs: number;
  endMs: number;
};

// 레이스 구간(첫 랩 시작 ~ 마지막 랩 시작)을 폴링 주기로 훑어 스냅샷 스트림을 만든다.
// 그리드 대기 구간은 제외한다 — 레이스 전 포지션 정렬을 "순위 급변"으로 잡을 이유가 없다.
export const buildBelgianGpSnapshots = (
  cadenceMs: number = BELGIAN_GP_CADENCE_MS,
): BelgianGpSnapshotStream => {
  const data = loadBelgianGpSessionData();
  const lapStarts = data.laps
    .map((lap) => parseMs(lap.date_start))
    .filter((ms) => !Number.isNaN(ms));
  const startMs = Math.min(...lapStarts);
  const endMs = Math.max(...lapStarts);
  const index = buildOpenF1Index(data);
  const snapshots: LiveRaceSnapshot[] = [];
  let version = 0;

  for (let atMs = startMs; atMs <= endMs; atMs += cadenceMs) {
    snapshots.push(normalizeOpenF1SnapshotAt(index, atMs, version));
    version += 1;
  }

  return { snapshots, startMs, endMs };
};
