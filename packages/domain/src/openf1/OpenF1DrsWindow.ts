import { OpenF1RaceControlCategory } from "./OpenF1RaceControlCategory";
import { OpenF1RaceControlFlag } from "./OpenF1RaceControlFlag";
import {
  parseRaceControlCategory,
  parseRaceControlFlag,
} from "./OpenF1RaceControlParsing";
import { OpenF1RaceControl } from "./OpenF1Types";

// DRS 활성 구간 판정.
//
// OpenF1 은 DRS 를 `OVERTAKE ENABLED` / `OVERTAKE DISABLED` race_control 문구로 통보한다.
// 이 문구가 있는 세션에서는 그것이 가장 정확한 근거이므로 우선 사용하고,
// 없는 세션에서는 "랩 3 이후 && SC/VSC/적기 아님" 휴리스틱으로 대체한다.

// DRS 는 레이스 개시 후 2 랩이 지나야 허용된다.
const DRS_ENABLED_FROM_LAP = 3;

const OVERTAKE_ENABLED_TEXT = "OVERTAKE ENABLED";
const OVERTAKE_DISABLED_TEXT = "OVERTAKE DISABLED";

type StateToggle = {
  atMs: number;
  active: boolean;
};

export type DrsWindow = {
  isActiveAt: (atMs: number, lapNumber: number | null) => boolean;
};

const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

// 주어진 시각 이전의 마지막 토글 값을 찾는다. 토글이 없으면 fallback 을 쓴다.
const findStateAt = (
  toggles: StateToggle[],
  atMs: number,
  fallback: boolean,
): boolean => {
  let state = fallback;

  for (const toggle of toggles) {
    if (toggle.atMs > atMs) {
      break;
    }

    state = toggle.active;
  }

  return state;
};

export const buildDrsWindow = (messages: OpenF1RaceControl[]): DrsWindow => {
  const drsToggles: StateToggle[] = [];
  // active=true 는 "중립화(SC/VSC/적기) 중"을 뜻한다.
  const neutralizedToggles: StateToggle[] = [];

  for (const message of messages) {
    const atMs = parseMs(message.date);

    if (Number.isNaN(atMs)) {
      continue;
    }

    const text = message.message.toUpperCase();

    if (text.includes(OVERTAKE_ENABLED_TEXT)) {
      drsToggles.push({ atMs, active: true });

      continue;
    }

    if (text.includes(OVERTAKE_DISABLED_TEXT)) {
      drsToggles.push({ atMs, active: false });

      continue;
    }

    const category = parseRaceControlCategory(message.category);

    if (category === OpenF1RaceControlCategory.SafetyCar) {
      if (text.includes("DEPLOYED")) {
        neutralizedToggles.push({ atMs, active: true });
      } else if (text.includes("IN THIS LAP") || text.includes("ENDING")) {
        neutralizedToggles.push({ atMs, active: false });
      }

      continue;
    }

    const flag = parseRaceControlFlag(message.flag);

    if (flag === OpenF1RaceControlFlag.Red) {
      neutralizedToggles.push({ atMs, active: true });
    } else if (flag === OpenF1RaceControlFlag.Green) {
      neutralizedToggles.push({ atMs, active: false });
    }
  }

  drsToggles.sort((a, b) => a.atMs - b.atMs);
  neutralizedToggles.sort((a, b) => a.atMs - b.atMs);

  const hasDrsMessage = drsToggles.length > 0;

  return {
    isActiveAt: (atMs: number, lapNumber: number | null): boolean => {
      if (findStateAt(neutralizedToggles, atMs, false)) {
        return false;
      }

      if (hasDrsMessage) {
        return findStateAt(drsToggles, atMs, false);
      }

      return lapNumber !== null && lapNumber >= DRS_ENABLED_FROM_LAP;
    },
  };
};
