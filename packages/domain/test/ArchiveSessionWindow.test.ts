import { describe, expect, it } from "vitest";
import {
  ARCHIVE_FALLBACK_SESSION_MS,
  resolveArchiveSessionWindow,
} from "../src/archive/ArchiveSessionWindow";
import { selectArchiveTimelineEvents } from "../src/archive/ArchiveLoader";
import { RaceEvent } from "../src/RaceEvent";
import { RaceEventPriority } from "../src/RaceEventPriority";
import { RaceEventType } from "../src/RaceEventType";
import { OpenF1SessionData } from "../src/openf1/OpenF1Types";

const makeData = (
  overrides: Partial<OpenF1SessionData> = {},
): OpenF1SessionData => ({
  meta: {
    sessionId: "2026-bel-race",
    sessionKey: 11334,
    meetingKey: 1290,
    sessionName: "Race",
    sessionType: "Race",
    circuitName: "Spa-Francorchamps",
    countryCode: "BEL",
    dateStart: "2026-07-19T13:00:00+00:00",
    dateEnd: "2026-07-19T15:00:00+00:00",
  },
  drivers: [],
  positions: [],
  intervals: [],
  stints: [],
  laps: [],
  pits: [],
  raceControl: [],
  ...overrides,
});

describe("resolveArchiveSessionWindow", () => {
  it("첫 랩을 시작으로, 종료 시각을 끝으로 삼는다", () => {
    const window = resolveArchiveSessionWindow(
      makeData({
        laps: [
          {
            driver_number: 1,
            lap_number: 1,
            date_start: "2026-07-19T13:05:00+00:00",
            lap_duration: 100,
          },
          {
            driver_number: 1,
            lap_number: 2,
            date_start: "2026-07-19T13:07:00+00:00",
            lap_duration: 100,
          },
        ],
      }),
    );

    expect(window.startMs).toBe(Date.parse("2026-07-19T13:05:00+00:00"));
    expect(window.endMs).toBe(Date.parse("2026-07-19T15:00:00+00:00"));
  });

  it("체커드 플래그 뒤 race_control 이 창 밖으로 밀려나지 않게 끝을 늘린다", () => {
    const afterEnd = "2026-07-19T15:20:00+00:00";
    const window = resolveArchiveSessionWindow(
      makeData({
        raceControl: [
          {
            date: afterEnd,
            category: "Other",
            flag: null,
            scope: null,
            message: "PENALTY",
          },
        ],
      }),
    );

    expect(window.endMs).toBe(Date.parse(afterEnd));
  });

  it("랩이 없으면 예정 시작 시각을 쓴다", () => {
    const window = resolveArchiveSessionWindow(makeData());

    expect(window.startMs).toBe(Date.parse("2026-07-19T13:00:00+00:00"));
  });

  it("시작 시각을 모르면 끝에서 물려 창을 [end, end] 로 좁히지 않는다", () => {
    const window = resolveArchiveSessionWindow(
      makeData({
        meta: { ...makeData().meta, dateStart: null },
      }),
    );

    expect(window.endMs - window.startMs).toBe(ARCHIVE_FALLBACK_SESSION_MS);
  });

  it("끝 시각을 모르면 시작에서 늘려 닫는다", () => {
    const window = resolveArchiveSessionWindow(
      makeData({
        meta: { ...makeData().meta, dateEnd: null },
      }),
    );

    expect(window.startMs).toBe(Date.parse("2026-07-19T13:00:00+00:00"));
    expect(window.endMs - window.startMs).toBe(ARCHIVE_FALLBACK_SESSION_MS);
  });
});

const makeEvent = (
  index: number,
  priority: RaceEventPriority,
  type: RaceEventType,
): RaceEvent => ({
  schemaVersion: 1,
  id: `event-${index}`,
  sessionId: "2026-bel-race",
  type,
  priority,
  timestamp: new Date(Date.parse("2026-07-19T13:00:00Z") + index * 1000)
    .toISOString(),
  params: {},
  deduplicationKey: `key-${index}`,
});

describe("selectArchiveTimelineEvents", () => {
  it("Low / Medium 과 고빈도 반복 이벤트는 타임라인에 넣지 않는다", () => {
    const events = [
      makeEvent(0, RaceEventPriority.High, RaceEventType.Retirement),
      makeEvent(1, RaceEventPriority.Medium, RaceEventType.GapClosing),
      makeEvent(2, RaceEventPriority.Low, RaceEventType.PersonalBestLap),
      // 추월·피트스톱은 High 지만 수백 건이라 사건을 묻는다.
      makeEvent(3, RaceEventPriority.High, RaceEventType.Overtake),
      makeEvent(4, RaceEventPriority.High, RaceEventType.PitStop),
    ];

    expect(selectArchiveTimelineEvents(events, 10).map((e) => e.id)).toEqual([
      "event-0",
    ]);
  });

  it("상한을 넘겨도 Critical 은 밀려나지 않고 시간순은 유지된다", () => {
    const events = [
      ...Array.from({ length: 20 }, (_, index) =>
        makeEvent(index, RaceEventPriority.High, RaceEventType.Penalty),
      ),
      makeEvent(90, RaceEventPriority.Critical, RaceEventType.RedFlag),
    ];

    const selected = selectArchiveTimelineEvents(events, 5);

    expect(selected).toHaveLength(5);
    expect(selected.map((event) => event.id)).toContain("event-90");
    // 시간순(마지막이 가장 늦은 Critical)이 유지된다.
    expect(selected.at(-1)?.id).toBe("event-90");
  });
});
