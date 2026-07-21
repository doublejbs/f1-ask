import { describe, expect, it } from "vitest";
import {
  buildOpenF1Index,
  deriveOpenF1Status,
} from "../src/openf1/OpenF1Normalizer";
import { buildRaceControlEvents } from "../src/openf1/OpenF1RaceControlEvents";
import { classifySafetyCarMessage } from "../src/openf1/OpenF1SafetyCarClassification";
import { OpenF1RaceControl } from "../src/openf1/OpenF1Types";
import { RaceEventType } from "../src/RaceEventType";
import { SessionStatus } from "../src/SessionStatus";
import { loadBelgianGpSessionData } from "./fixtures/BelgianGpFixture";

const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

// 실데이터에 등장하는 문구를 그대로 고정한다. FIA 는 풀 표기와 약어를 섞어 쓴다.
const SAFETY_CAR_MESSAGES = [
  "SAFETY CAR DEPLOYED",
  "SAFETY CAR IN THIS LAP",
  "VSC DEPLOYED",
  "VSC ENDING",
  "VIRTUAL SAFETY CAR DEPLOYED",
  "VIRTUAL SAFETY CAR ENDING",
];

describe("classifySafetyCarMessage", () => {
  it("'VSC DEPLOYED' 를 VSC 로 판정한다 (풀 SC 가 아니다)", () => {
    expect(classifySafetyCarMessage("VSC DEPLOYED")).toBe(
      SessionStatus.VirtualSafetyCar,
    );
  });

  it("'SAFETY CAR DEPLOYED' 를 풀 SC 로 판정한다", () => {
    expect(classifySafetyCarMessage("SAFETY CAR DEPLOYED")).toBe(
      SessionStatus.SafetyCar,
    );
  });

  it("풀 표기 'VIRTUAL SAFETY CAR DEPLOYED' 도 VSC 로 판정한다", () => {
    expect(classifySafetyCarMessage("VIRTUAL SAFETY CAR DEPLOYED")).toBe(
      SessionStatus.VirtualSafetyCar,
    );
  });

  it("해제 문구는 종류와 무관하게 그린으로 판정한다", () => {
    expect(classifySafetyCarMessage("VSC ENDING")).toBe(SessionStatus.Green);
    expect(classifySafetyCarMessage("VIRTUAL SAFETY CAR ENDING")).toBe(
      SessionStatus.Green,
    );
    expect(classifySafetyCarMessage("SAFETY CAR IN THIS LAP")).toBe(
      SessionStatus.Green,
    );
  });

  it("배치도 해제도 아닌 문구는 null 이다", () => {
    expect(classifySafetyCarMessage("SAFETY CAR")).toBeNull();
  });
});

// 이 버그의 원인은 같은 판정이 두 곳에 따로 있었다는 것이다.
// 두 호출부가 같은 메시지에 같은 판정을 내는지를 직접 고정해 다시 갈라지는 것을 막는다.
describe("두 호출부의 판정 일치", () => {
  const toStatusFromEvents = (message: string): SessionStatus | null => {
    const row: OpenF1RaceControl = {
      date: "2026-07-19T13:00:00+00:00",
      category: "SafetyCar",
      flag: null,
      scope: "Track",
      message,
    };
    const events = buildRaceControlEvents("s", [row], new Map());
    const type = events[0]?.event.type;

    if (type === RaceEventType.VirtualSafetyCar) {
      return SessionStatus.VirtualSafetyCar;
    }

    if (type === RaceEventType.SafetyCar) {
      return SessionStatus.SafetyCar;
    }

    if (type === RaceEventType.SessionRestarted) {
      return SessionStatus.Green;
    }

    return null;
  };

  const toStatusFromDerive = (message: string): SessionStatus => {
    const row: OpenF1RaceControl = {
      date: "2026-07-19T13:00:00+00:00",
      category: "SafetyCar",
      flag: null,
      scope: "Track",
      message,
    };

    return deriveOpenF1Status([row], parseMs(row.date));
  };

  it.each(SAFETY_CAR_MESSAGES)("'%s' 에 대해 두 호출부가 같은 판정을 낸다", (message) => {
    const expected = classifySafetyCarMessage(message);

    expect(toStatusFromEvents(message)).toBe(expected);
    expect(toStatusFromDerive(message)).toBe(expected);
  });
});

// 회귀 방지의 핵심. 수정 전에는 실데이터를 리플레이해도 virtual_safety_car 가 한 번도
// 나오지 않았다 ('VSC DEPLOYED' 가 풀 SC 로 오분류돼 화면 상단이 "세이프티 카"였다).
describe("벨기에 GP 실데이터 리플레이", () => {
  const data = loadBelgianGpSessionData();
  const index = buildOpenF1Index(data);
  const raceControl = index.raceControlSorted;

  const statusAt = (date: string): SessionStatus =>
    deriveOpenF1Status(raceControl, parseMs(date));

  it("VSC 구간에서 세션 상태가 virtual_safety_car 다", () => {
    // 'VSC DEPLOYED' 13:39:13 ~ 'VSC ENDING' 13:39:46
    expect(statusAt("2026-07-19T13:39:30+00:00")).toBe(
      SessionStatus.VirtualSafetyCar,
    );
    // 'VSC DEPLOYED' 13:43:18 ~ 'VSC ENDING' 13:44:52
    expect(statusAt("2026-07-19T13:44:00+00:00")).toBe(
      SessionStatus.VirtualSafetyCar,
    );
  });

  it("풀 SC 구간은 그대로 safety_car 다", () => {
    // 'SAFETY CAR DEPLOYED' 13:05:25 ~ 'SAFETY CAR IN THIS LAP' 13:12:32
    expect(statusAt("2026-07-19T13:08:00+00:00")).toBe(SessionStatus.SafetyCar);
  });

  it("해제 직후에는 그린으로 돌아온다", () => {
    expect(statusAt("2026-07-19T13:39:50+00:00")).toBe(SessionStatus.Green);
    expect(statusAt("2026-07-19T13:13:00+00:00")).toBe(SessionStatus.Green);
  });

  it("전 구간을 훑으면 virtual_safety_car 가 실제로 나타난다", () => {
    const startMs = Math.min(
      ...data.laps.map((lap) => parseMs(lap.date_start)).filter((ms) => !Number.isNaN(ms)),
    );
    const endMs = Math.max(
      ...data.laps.map((lap) => parseMs(lap.date_start)).filter((ms) => !Number.isNaN(ms)),
    );
    const statuses: SessionStatus[] = [];

    for (let atMs = startMs; atMs <= endMs; atMs += 6_000) {
      statuses.push(deriveOpenF1Status(raceControl, atMs));
    }

    const virtualCount = statuses.filter(
      (status) => status === SessionStatus.VirtualSafetyCar,
    ).length;
    const safetyCarCount = statuses.filter(
      (status) => status === SessionStatus.SafetyCar,
    ).length;

    // 수정 전에는 0 이었다.
    expect(virtualCount).toBeGreaterThan(0);
    // 풀 SC 구간은 사라지지 않는다.
    expect(safetyCarCount).toBeGreaterThan(0);
  });

  it("이벤트 스트림에도 SC 와 VSC 가 모두 나타난다", () => {
    const events = buildRaceControlEvents("openf1:belgian", data.raceControl, new Map());
    const types = events.map((entry) => entry.event.type);

    expect(types).toContain(RaceEventType.SafetyCar);
    expect(types).toContain(RaceEventType.VirtualSafetyCar);
  });
});
