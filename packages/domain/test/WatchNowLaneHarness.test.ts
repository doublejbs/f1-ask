import { beforeAll, describe, expect, it } from "vitest";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";
import { WatchNowDetector } from "../src/watchnow/WatchNowDetector";
import { DEFAULT_WATCH_NOW_DETECTOR_CONFIG } from "../src/watchnow/WatchNowDetectorConfig";
import { WatchNowLane } from "../src/watchnow/WatchNowLane";
import {
  buildWatchNowLanes,
  LaneWatchNowSignal,
  selectWatchNowCandidates,
  WatchNowLanes,
} from "../src/watchnow/WatchNowLaneBuilder";
import { DEFAULT_WATCH_NOW_LANE_CONFIG } from "../src/watchnow/WatchNowLaneConfig";
import { WatchNowSignal } from "../src/watchnow/WatchNowSignal";
import { WatchNowSignalType } from "../src/watchnow/WatchNowSignalType";
import { buildBelgianGpSnapshots } from "./fixtures/BelgianGpFixture";

// "지금 볼 것" 칸 구성 결과 목록 하네스 — 2026 벨기에 GP 실데이터.
//
// **이 파일의 목적은 검증이 아니라 눈으로 보는 것이다.** 칸 배정과 칸 안 순서가 말이
// 되는지는 실제로 무엇이 뽑히는지 봐야 알 수 있다.
//
// 예전 하네스는 점수 내역("기본50 +포인트권15 +희소17")을 찍었다. 그 점수들이 근거 없는
// 추정이라 폐기했으므로(WatchNowLaneConfig.ts 머리말) 지금 찍는 것은 **왜 그 칸의 그
// 순서인지** — 걸린 챔피언십 포인트와 발생 시각뿐이다.
//
// 실행:
//   WATCH_NOW_LANES=1 pnpm exec vitest run packages/domain/test/WatchNowLaneHarness.test.ts
//
// **env 게이트를 둔 이유**: 기본 `pnpm vitest run` 에서 이 출력이 쏟아지면 실제 실패가
// 묻힌다. OpenF1LivePoll(POLL_OPENF1) · OpenF1Capture(CAPTURE_OPENF1) 와 같은 방식이다.

const shouldRun = process.env.WATCH_NOW_LANES === "1";
// 경기 전반이 고르게 섞이도록 레이스를 이만큼의 구간으로 나눠 표본을 뽑는다.
const SAMPLE_SEGMENTS = Number(process.env.WATCH_NOW_SEGMENTS ?? "12");
// 즐겨찾기 없는 사용자가 기본이다. 내 드라이버 칸을 보려면 이 env 로 번호를 준다.
const FAVORITES = (process.env.WATCH_NOW_FAVORITES ?? "")
  .split(",")
  .map((raw) => Number(raw.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

const STATUS_LABEL: Record<SessionStatus, string> = {
  [SessionStatus.Scheduled]: "예정",
  [SessionStatus.Green]: "녹색기",
  [SessionStatus.Yellow]: "황색기",
  [SessionStatus.SafetyCar]: "세이프티카",
  [SessionStatus.VirtualSafetyCar]: "VSC",
  [SessionStatus.Red]: "적색기",
  [SessionStatus.Suspended]: "중단",
  [SessionStatus.Finished]: "종료",
  [SessionStatus.Unknown]: "알 수 없음",
};

const TYPE_LABEL: Record<WatchNowSignalType, string> = {
  [WatchNowSignalType.TireAge]: "타이어 노후",
  [WatchNowSignalType.GapConvergence]: "간격 수렴",
  [WatchNowSignalType.UndercutThreat]: "언더컷 위협",
  [WatchNowSignalType.PositionSwing]: "순위 급변",
  [WatchNowSignalType.OvertakeForecast]: "추월 예측",
};

const LANE_LABEL: Record<WatchNowLane, string> = {
  [WatchNowLane.Leader]: "1 선두권 (P1~P3)",
  [WatchNowLane.Field]: "2 필드 (P4 이하)",
  [WatchNowLane.Favorite]: "3 내 드라이버",
};

const COMPOUND_LABEL: Record<TireCompound, string> = {
  [TireCompound.Soft]: "소프트",
  [TireCompound.Medium]: "미디엄",
  [TireCompound.Hard]: "하드",
  [TireCompound.Intermediate]: "인터",
  [TireCompound.Wet]: "웻",
  [TireCompound.Unknown]: "타이어",
};

// 픽스처에 drivers 가 있으면 실제 코드(HAM 등)가 온다. 없으면 어댑터가 `D{번호}` 를
// 합성하므로, 그 경우만 번호 표기로 되돌려 찍는다 — "D44" 를 드라이버 코드인 척 보여주면
// 읽는 사람이 실제 약어로 오해한다.
const formatDriver = (code: string, driverNumber: number): string =>
  code === `D${driverNumber}` ? `#${driverNumber}` : code;

const formatPosition = (position: number | null): string =>
  position === null ? "P?" : `P${position}`;

// 스파는 UTC+2 다. 실데이터의 UTC 를 현지 시각으로 옮겨야 방송을 본 기억과 맞는다.
const LOCAL_OFFSET_MS = 2 * 60 * 60 * 1000;

const formatClock = (iso: string): string => {
  const local = new Date(Date.parse(iso) + LOCAL_OFFSET_MS);
  const hours = `${local.getUTCHours()}`.padStart(2, "0");
  const minutes = `${local.getUTCMinutes()}`.padStart(2, "0");

  return `${hours}:${minutes}`;
};

// 문자열의 표시 폭. 한글은 두 칸을 차지해 length 로 맞추면 열이 어긋난다.
const displayWidth = (text: string): number => {
  let width = 0;

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;

    width += code >= 0x1100 && code <= 0xffe6 && code !== 0x2500 ? 2 : 1;
  }

  return width;
};

const padDisplay = (text: string, width: number): string =>
  text + " ".repeat(Math.max(0, width - displayWidth(text)));

// 신호 종류별로 "무엇이 일어났는가"를 한 줄로 옮긴다.
const describeSignal = (
  entry: LaneWatchNowSignal,
  snapshot: LiveRaceSnapshot,
): string => {
  const { signal } = entry;
  const who = `${formatDriver(signal.driverCode, signal.driverNumber)} (${formatPosition(entry.position)})`;

  if (signal.type === WatchNowSignalType.UndercutThreat) {
    const rivalCode = signal.rivalDriverCode ?? "";
    const rivalNumber = signal.rivalDriverNumber ?? 0;

    return `${who} ← ${formatDriver(rivalCode, rivalNumber)}(${formatPosition(entry.rivalPosition)}) 피트인`;
  }

  if (signal.type === WatchNowSignalType.GapConvergence) {
    const ahead = snapshot.drivers.find(
      (driver) => entry.position !== null && driver.position === entry.position - 1,
    );
    const aheadLabel =
      ahead === undefined
        ? "앞차"
        : `${formatDriver(ahead.code, ahead.driverNumber)}(${formatPosition(ahead.position)})`;

    return `${who} vs ${aheadLabel} ${(signal.gapSeconds ?? 0).toFixed(1)}초`;
  }

  if (signal.type === WatchNowSignalType.TireAge) {
    const driver = snapshot.drivers.find(
      (row) => row.driverNumber === signal.driverNumber,
    );
    const compound = COMPOUND_LABEL[driver?.compound ?? TireCompound.Unknown];

    return `${who} ${compound} ${signal.tireAgeLaps ?? 0}랩`;
  }

  return `${who} ${signal.positionFrom ?? 0}위 → ${signal.positionTo ?? 0}위`;
};

type Frame = {
  snapshot: LiveRaceSnapshot;
  atMs: number;
  candidateCount: number;
  lanes: WatchNowLanes;
};

let snapshots: LiveRaceSnapshot[] = [];
let frames: Frame[] = [];

// SC · VSC 중 억제로 빠진 간격 후보가 몇 건인지 근사한다. 실제로 억제된 건수는 감지기
// 내부 상태라 밖에서 셀 수 없으므로, "지금 임계 이내에 있는 차가 몇 대인가"로 대신한다.
const countSuppressedGapCandidates = (snapshot: LiveRaceSnapshot): number =>
  snapshot.drivers.filter(
    (driver) =>
      !driver.inPit &&
      !driver.retired &&
      driver.intervalToAheadSeconds !== null &&
      driver.intervalToAheadSeconds <
        DEFAULT_WATCH_NOW_DETECTOR_CONFIG.gapThresholdSeconds,
  ).length;

const totalShown = (lanes: WatchNowLanes): number =>
  lanes.lanes.reduce((sum, group) => sum + group.entries.length, 0);

const printFrame = (frame: Frame): void => {
  const { snapshot, lanes } = frame;

  console.log(
    `[${formatClock(snapshot.generatedAt)} · ${snapshot.currentLap ?? 0}랩]  ${STATUS_LABEL[snapshot.status]}  후보 ${frame.candidateCount}건`,
  );

  for (const group of lanes.lanes) {
    if (group.collapsed) {
      // 즐겨찾기가 없으면 억지로 채우지 않고 접는다(docs/19 수용 기준 2).
      console.log(`  ${padDisplay(LANE_LABEL[group.lane], 18)}— 접힘 (즐겨찾기 없음)`);

      continue;
    }

    if (group.entries.length === 0) {
      console.log(`  ${padDisplay(LANE_LABEL[group.lane], 18)}— 지금은 조용함`);

      continue;
    }

    console.log(`  ${LANE_LABEL[group.lane]}`);

    group.entries.forEach((entry, index) => {
      const label = padDisplay(TYPE_LABEL[entry.signal.type], 13);
      const detail = padDisplay(describeSignal(entry, snapshot), 34);
      // 왜 이 순서인가 — 걸린 포인트가 1순위, 같으면 최신이 위다. 그 두 값만 찍는다.
      const why = `걸린 ${`${entry.pointsAtStake}`.padStart(2)}점 · ${formatClock(entry.signal.detectedAt)}`;

      console.log(`    ${index + 1}) ${label}${detail}${why}`);
    });
  }

  if (lanes.overflow.length > 0) {
    // 감지된 것 전부를 칸에 올리지 않는다 — 나머지는 순위표 행 표시로 간다
    // (docs/19 수용 기준 7).
    console.log(`  ─ 나머지 ${lanes.overflow.length}건은 순위표 행 표시로 내린다`);
  }

  if (
    snapshot.status === SessionStatus.SafetyCar ||
    snapshot.status === SessionStatus.VirtualSafetyCar
  ) {
    const suppressed = countSuppressedGapCandidates(snapshot);

    console.log(
      `  ─ 현재 1.0초 이내 ${suppressed}건은 ${STATUS_LABEL[snapshot.status]} 억제로 제외`,
    );
  }

  console.log("");
};

describe.skipIf(!shouldRun)("WatchNow 칸 구성 결과 목록 — 2026 벨기에 GP", () => {
  beforeAll(() => {
    snapshots = buildBelgianGpSnapshots().snapshots;

    const detector = new WatchNowDetector();
    const seen: WatchNowSignal[] = [];

    frames = snapshots.map((snapshot) => {
      seen.push(...detector.observe(snapshot));

      const atMs = Date.parse(snapshot.generatedAt);
      const candidates = selectWatchNowCandidates(seen, atMs);

      return {
        snapshot,
        atMs,
        candidateCount: candidates.length,
        lanes: buildWatchNowLanes({
          signals: candidates,
          snapshot,
          favoriteDriverNumbers: FAVORITES,
        }),
      };
    });
  });

  it("경기 전반에 걸친 표본 시점의 칸 구성을 출력한다", () => {
    expect(frames.length).toBeGreaterThan(0);

    console.log("");
    console.log("=== 지금 볼 것 — 칸 구성 결과 목록 ===");
    console.log(
      `후보 창 ${DEFAULT_WATCH_NOW_LANE_CONFIG.candidateWindowMs / 1000}초 · 칸당 최대 ${DEFAULT_WATCH_NOW_LANE_CONFIG.maxEntriesPerLane}줄 · 즐겨찾기 ${FAVORITES.length === 0 ? "없음" : FAVORITES.join(",")}`,
    );
    console.log("정렬 = 걸린 챔피언십 포인트 → 최신순. 칸 사이 점수 비교는 없다.");
    console.log("");

    const segmentSize = Math.floor(frames.length / SAMPLE_SEGMENTS);

    for (let segment = 0; segment < SAMPLE_SEGMENTS; segment += 1) {
      const start = segment * segmentSize;
      const end = segment === SAMPLE_SEGMENTS - 1 ? frames.length : start + segmentSize;
      const center = Math.floor((start + end) / 2);
      // 구간 중앙에서 가장 가까우면서 후보가 있는 프레임을 고른다. 없으면 중앙을 그대로
      // 찍어 "이 구간은 비어 있다"는 사실을 숨기지 않는다.
      let picked = frames[center];

      for (let offset = 0; offset < end - start; offset += 1) {
        const forward = frames[center + offset];
        const backward = frames[center - offset];

        if (
          forward !== undefined &&
          center + offset < end &&
          forward.candidateCount > 0
        ) {
          picked = forward;

          break;
        }

        if (
          backward !== undefined &&
          center - offset >= start &&
          backward.candidateCount > 0
        ) {
          picked = backward;

          break;
        }
      }

      if (picked !== undefined) {
        printFrame(picked);
      }
    }

    // SC · VSC 구간은 억제가 실제로 무엇을 걸러내는지 보여주므로 따로 뽑는다.
    const safetyCarFrames = frames.filter(
      (frame) =>
        frame.snapshot.status === SessionStatus.SafetyCar ||
        frame.snapshot.status === SessionStatus.VirtualSafetyCar,
    );

    if (safetyCarFrames.length > 0) {
      console.log("=== SC · VSC 구간 표본 ===");
      console.log("");

      const step = Math.max(1, Math.floor(safetyCarFrames.length / 2));

      for (let index = 0; index < safetyCarFrames.length; index += step) {
        const frame = safetyCarFrames[index];

        if (frame !== undefined) {
          printFrame(frame);
        }
      }
    }
  });

  it("칸별 채움 상태와 중복 여부를 측정한다", () => {
    const percent = (part: number, whole: number): string =>
      whole === 0 ? "0.0%" : `${((part / whole) * 100).toFixed(1)}%`;
    const laneFilled = (frame: Frame, lane: WatchNowLane): boolean =>
      (frame.lanes.lanes.find((group) => group.lane === lane)?.entries.length ?? 0) > 0;
    const emptyFrames = frames.filter((frame) => frame.candidateCount === 0);
    const meanCandidates =
      frames.reduce((sum, frame) => sum + frame.candidateCount, 0) / frames.length;
    const meanShown =
      frames.reduce((sum, frame) => sum + totalShown(frame.lanes), 0) / frames.length;

    console.log("");
    console.log("=== 측정치 ===");
    console.log(`전체 프레임: ${frames.length} (6초 주기)`);
    console.log(
      `후보 0건 프레임: ${emptyFrames.length} (${percent(emptyFrames.length, frames.length)})`,
    );
    console.log(`프레임당 평균 후보 수: ${meanCandidates.toFixed(2)}`);
    console.log(`프레임당 평균 표시 줄 수: ${meanShown.toFixed(2)}`);

    for (const lane of [WatchNowLane.Leader, WatchNowLane.Field, WatchNowLane.Favorite]) {
      const filled = frames.filter((frame) => laneFilled(frame, lane));

      console.log(
        `${LANE_LABEL[lane]} 채워진 프레임: ${filled.length} (${percent(filled.length, frames.length)})`,
      );
    }

    const collapsedFrames = frames.filter(
      (frame) =>
        frame.lanes.lanes.find((group) => group.lane === WatchNowLane.Favorite)
          ?.collapsed === true,
    );

    console.log(
      `내 드라이버 칸이 접힌 프레임: ${collapsedFrames.length} (${percent(collapsedFrames.length, frames.length)})`,
    );

    // 수용 기준 9 — 같은 드라이버가 두 칸에 뜨지 않는다. 상대역까지 포함해 센다.
    const duplicateFrames = frames.filter((frame) => {
      const occupied: number[] = [];

      for (const group of frame.lanes.lanes) {
        for (const entry of group.entries) {
          occupied.push(entry.signal.driverNumber);

          if (entry.signal.rivalDriverNumber !== null) {
            occupied.push(entry.signal.rivalDriverNumber);
          }
        }
      }

      return new Set(occupied).size < occupied.length;
    });

    console.log(
      `같은 드라이버가 두 번 뜬 프레임: ${duplicateFrames.length} (0 이어야 한다)`,
    );

    const overflowFrames = frames.filter((frame) => frame.lanes.overflow.length > 0);

    console.log(
      `행 표시로 내려간 신호가 있는 프레임: ${overflowFrames.length} (${percent(overflowFrames.length, frames.length)})`,
    );

    // **몇 건이냐가 행 표시의 성패를 가른다.** 행 표시는 "조용해야" 하는데
    // (docs/19 수용 기준 9) 매 프레임 스무 줄에 전부 점이 찍히면 점이 아무 뜻도
    // 갖지 못한다. 발생 빈도(위 %)만으로는 그 판단을 할 수 없어 분포를 함께 남긴다.
    // 점은 드라이버당 하나이므로 신호 건수가 아니라 **드라이버 수**를 센다.
    const overflowDriverCounts = frames
      .map(
        (frame) =>
          new Set(frame.lanes.overflow.map((entry) => entry.signal.driverNumber))
            .size,
      )
      .sort((a, b) => a - b);
    const quantile = (ratio: number): number =>
      overflowDriverCounts[
        Math.min(
          overflowDriverCounts.length - 1,
          Math.floor(overflowDriverCounts.length * ratio),
        )
      ] ?? 0;

    console.log(
      `행 표시가 붙는 드라이버 수: 중앙값 ${quantile(0.5)} · 90퍼센타일 ${quantile(0.9)} · 최댓값 ${quantile(1)} (전체 20명 중)`,
    );

    // 가장 긴 후보 0건 연속 구간 — 화면이 얼마나 오래 비는지가 Task 3 설계를 가른다.
    let longestEmptyRun = 0;
    let currentEmptyRun = 0;

    for (const frame of frames) {
      currentEmptyRun = frame.candidateCount === 0 ? currentEmptyRun + 1 : 0;
      longestEmptyRun = Math.max(longestEmptyRun, currentEmptyRun);
    }

    console.log(
      `가장 긴 후보 0건 연속 구간: ${longestEmptyRun} 프레임 (약 ${longestEmptyRun * 6}초)`,
    );
    console.log("");

    expect(duplicateFrames).toHaveLength(0);
  });
});
