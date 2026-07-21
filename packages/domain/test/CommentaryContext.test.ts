import { describe, expect, it } from "vitest";
import {
  buildCommentaryContext,
  RECENT_COMMENTARY_LIMIT,
} from "../src/ai/CommentaryContext";
import { buildCommentarySystemRules } from "../src/ai/CommentaryPrompt";
import { LiveDriverState } from "../src/LiveDriverState";
import { LiveRaceSnapshot } from "../src/LiveRaceSnapshot";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventScope } from "../src/RaceEventScope";
import { RaceEventType } from "../src/RaceEventType";
import { SessionStatus } from "../src/SessionStatus";
import { TireCompound } from "../src/TireCompound";

// 순위 슬라이스를 검증하려면 순위가 결정적이어야 해 스냅샷을 직접 만든다.
const buildDriver = (position: number): LiveDriverState => ({
  driverNumber: position,
  code: `D${position.toString().padStart(2, "0")}`,
  fullName: `Driver ${position}`,
  teamName: `Team ${position}`,
  position,
  startingPosition: position,
  positionChange: 0,
  gapToLeaderSeconds: position === 1 ? 0 : position * 1.5,
  intervalToAheadSeconds: position === 1 ? null : 1.5,
  intervalToBehindSeconds: 1.5,
  lastLapSeconds: 90 + position * 0.1,
  personalBestLapSeconds: 89.5,
  compound: TireCompound.Medium,
  tireAgeLaps: 10,
  pitStopCount: 1,
  inPit: false,
  retired: false,
  recentLapTimesSeconds: [],
});

const DRIVER_COUNT = 10;

const snapshot: LiveRaceSnapshot = {
  schemaVersion: 1,
  sessionId: "session:test",
  sessionKey: 1,
  meetingKey: 1,
  sessionName: "Race",
  sessionType: "Race",
  circuitName: "Spa-Francorchamps",
  countryCode: "BEL",
  status: SessionStatus.Green,
  currentLap: 41,
  totalLaps: 44,
  // 역순으로 넣어 함수가 position 으로 정렬하는지 확인한다.
  drivers: Array.from({ length: DRIVER_COUNT }, (_, index) =>
    buildDriver(DRIVER_COUNT - index),
  ),
  generatedAt: "2026-07-19T05:00:00.000Z",
  sourceUpdatedAt: "2026-07-19T05:00:00.000Z",
  version: 1,
};

const buildEvent = (type: RaceEventType, driverNumber?: number): RaceEvent => ({
  schemaVersion: 1,
  id: `event:${type}`,
  sessionId: "session:test",
  type,
  priority: RaceEventPriority.High,
  driverNumber,
  lapNumber: 41,
  timestamp: "2026-07-19T05:00:00.000Z",
  params: { reason: "collision" },
  deduplicationKey: `dedup:${type}`,
});

describe("buildCommentaryContext", () => {
  it("Driver 범위 이벤트는 순위 슬라이스를 포함한다", () => {
    const context = buildCommentaryContext(
      buildEvent(RaceEventType.Penalty, 7),
      snapshot,
    );

    expect(context.scope).toBe(RaceEventScope.Driver);
    expect(context.standings).toBeDefined();
    expect(context.standings?.length).toBeGreaterThan(0);
    expect(context.event.driverCode).toBe("D07");
  });

  it("Session 범위 이벤트는 순위 슬라이스를 포함하지 않는다", () => {
    const context = buildCommentaryContext(
      buildEvent(RaceEventType.SafetyCar),
      snapshot,
    );

    expect(context.scope).toBe(RaceEventScope.Session);
    expect(context.standings).toBeUndefined();
  });

  it("순위 슬라이스가 상위 3명 + 대상 앞뒤 1명으로 좁혀지고 중복이 없다", () => {
    const context = buildCommentaryContext(
      buildEvent(RaceEventType.Penalty, 7),
      snapshot,
    );
    const positions = context.standings?.map((row) => row.position) ?? [];

    expect(positions).toEqual([1, 2, 3, 6, 7, 8]);
    expect(new Set(positions).size).toBe(positions.length);
    // 필요한 열만 남긴다 — 전체 20명·전 필드를 넣으면 모델이 초점을 잃는다.
    expect(Object.keys(context.standings?.[0] ?? {}).sort()).toEqual([
      "code",
      "gapToLeaderSeconds",
      "position",
      "team",
    ]);
  });

  it("대상 드라이버가 상위 3명과 겹치면 중복 없이 합쳐진다", () => {
    const context = buildCommentaryContext(
      buildEvent(RaceEventType.Retirement, 2),
      snapshot,
    );
    const positions = context.standings?.map((row) => row.position) ?? [];

    expect(positions).toEqual([1, 2, 3]);
  });

  it("직전 해설이 최근 N 건으로 잘린다", () => {
    const recent = ["c1", "c2", "c3", "c4", "c5", "c6"];
    const context = buildCommentaryContext(
      buildEvent(RaceEventType.Penalty, 7),
      snapshot,
      recent,
    );

    expect(RECENT_COMMENTARY_LIMIT).toBe(4);
    expect(context.recentCommentary).toEqual(["c3", "c4", "c5", "c6"]);
  });

  it("스냅샷에서 남은 랩 수를 계산한다", () => {
    const context = buildCommentaryContext(
      buildEvent(RaceEventType.SafetyCar),
      snapshot,
    );

    expect(context.session.lapsRemaining).toBe(3);
    expect(context.session.retiredCount).toBe(0);
  });
});

describe("buildCommentarySystemRules", () => {
  it("해설 규칙에는 '모르면 모른다' 계열 표현이 없다", () => {
    for (const scope of Object.values(RaceEventScope)) {
      const rules = buildCommentarySystemRules(scope).toLowerCase();

      expect(rules).not.toContain("say you do not know");
      expect(rules).not.toContain("cannot be confirmed from the data");
      expect(rules).not.toContain("insufficient");
    }
  });

  it("해설 규칙은 환각·호칭·형식을 고정한다", () => {
    const rules = buildCommentarySystemRules(RaceEventScope.Driver);

    expect(rules).toContain("If it is not in the data, it does not exist.");
    expect(rules).toContain("three-letter code");
    expect(rules).toContain("Exactly one sentence.");
  });

  it("Driver 는 '왜 중요한지', Session 은 사실만 요구한다", () => {
    expect(buildCommentarySystemRules(RaceEventScope.Driver)).toContain(
      "WHY it matters",
    );
    expect(buildCommentarySystemRules(RaceEventScope.Session)).not.toContain(
      "WHY it matters",
    );
    expect(buildCommentarySystemRules(RaceEventScope.Session)).toContain(
      "State exactly what happened",
    );
  });
});
