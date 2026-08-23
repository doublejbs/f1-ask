// 주말(그랑프리) 세션별 타이어 사용 정규화 (docs/29 §범위 밖 → 구현).
//
// "레이스 전에 프랙티스·퀄리에서 어떤 타이어를 썼는지"를 보여 주기 위해, 미팅의 세션 목록과
// 전체 스틴트를 받아 **드라이버 × 세션 → 사용 compound** 로 정리한다. OpenF1 스틴트는
// compound·tyre_age_at_start 만 주므로(세트 ID 없음) "사용한 컴파운드"까지가 한계다 — 남은
// 세트는 규정 기반 경우의 수(TireAllocation)로 별개로 다룬다(docs/29).
//
// LLM 을 쓰지 않는다. 결정론적 정규화다.

import { StintCompoundUse } from "../LiveRaceContextSummary";
import { OpenF1Driver, OpenF1Session, OpenF1Stint } from "../openf1/OpenF1Types";
import { mapCompound } from "../openf1/OpenF1Normalizer";
import { TireCompound } from "../TireCompound";
import {
  DRY_TIRE_ALLOCATION,
  TireSetCounts,
  WeekendFormat,
} from "./TireAllocation";

// 세션 종류. session_name 으로 분류한다 — session_type 만으로는 스프린트 주말에서 퀄리·레이스가
// 중복돼 구분되지 않는다(docs/27 §실측).
export enum WeekendSessionKind {
  Practice = "practice",
  Qualifying = "qualifying",
  SprintQualifying = "sprint_qualifying",
  Sprint = "sprint",
  Race = "race",
  Unknown = "unknown",
}

export type WeekendTireSession = {
  sessionKey: number;
  // 원문 세션명(예: "Practice 1", "Sprint Qualifying"). 화면 표기용.
  name: string;
  kind: WeekendSessionKind;
};

// 한 드라이버가 한 세션에서 쓴 타이어(시작 순서대로).
export type SessionTireUse = {
  sessionKey: number;
  compounds: StintCompoundUse[];
};

export type DriverWeekendTires = {
  driverNumber: number;
  code: string;
  // 이 드라이버가 실제로 주행한 세션만(빈 세션은 담지 않는다). WeekendTireUsage.sessions 순서.
  sessions: SessionTireUse[];
};

export type WeekendTireUsage = {
  format: WeekendFormat;
  // 시간순 정렬된 세션 목록.
  sessions: WeekendTireSession[];
  // driverNumber 오름차순.
  drivers: DriverWeekendTires[];
};

// session_name 으로 세션 종류를 판정한다. "Sprint Qualifying" 을 "Qualifying" 보다 먼저 본다.
const classifySession = (name: string): WeekendSessionKind => {
  const lower = name.toLowerCase();

  if (lower.includes("sprint") && lower.includes("qualifying")) {
    return WeekendSessionKind.SprintQualifying;
  }

  if (lower.includes("sprint")) {
    return WeekendSessionKind.Sprint;
  }

  if (lower.includes("practice")) {
    return WeekendSessionKind.Practice;
  }

  if (lower.includes("qualifying")) {
    return WeekendSessionKind.Qualifying;
  }

  if (lower.includes("race")) {
    return WeekendSessionKind.Race;
  }

  return WeekendSessionKind.Unknown;
};

// 스프린트 세션이 하나라도 있으면 스프린트 주말이다.
const detectFormat = (sessions: OpenF1Session[]): WeekendFormat =>
  sessions.some((session) => session.session_name.toLowerCase().includes("sprint"))
    ? WeekendFormat.Sprint
    : WeekendFormat.Conventional;

// 취소된 세션은 제외하고 시간순(date_start, fallback session_key)으로 정렬한다.
const orderedSessions = (sessions: OpenF1Session[]): OpenF1Session[] =>
  sessions
    .filter((session) => session.is_cancelled !== true)
    .slice()
    .sort((left, right) => {
      const leftMs = left.date_start ? Date.parse(left.date_start) : NaN;
      const rightMs = right.date_start ? Date.parse(right.date_start) : NaN;

      if (!Number.isNaN(leftMs) && !Number.isNaN(rightMs) && leftMs !== rightMs) {
        return leftMs - rightMs;
      }

      return left.session_key - right.session_key;
    });

// driver_number → 코드(name_acronym). 로스터 행이 세션마다 중복되므로 먼저 채워지는 값을 쓴다.
const buildCodeByNumber = (drivers: OpenF1Driver[]): Map<number, string> => {
  const codes = new Map<number, string>();

  for (const driver of drivers) {
    if (!codes.has(driver.driver_number) && driver.name_acronym !== null) {
      codes.set(driver.driver_number, driver.name_acronym);
    }
  }

  return codes;
};

// session_key → (driver_number → 스틴트 목록). compound 가 null 인 스틴트는 제외한다
// (피트 직후 확정 전 임시 행 — docs 실측). lap_start 오름차순으로 정렬한다.
const buildStintsBySession = (
  stints: OpenF1Stint[],
): Map<number, Map<number, OpenF1Stint[]>> => {
  const bySession = new Map<number, Map<number, OpenF1Stint[]>>();

  for (const stint of stints) {
    if (stint.session_key === undefined || stint.compound === null) {
      continue;
    }

    const byDriver =
      bySession.get(stint.session_key) ?? new Map<number, OpenF1Stint[]>();
    const list = byDriver.get(stint.driver_number) ?? [];

    list.push(stint);
    byDriver.set(stint.driver_number, list);
    bySession.set(stint.session_key, byDriver);
  }

  for (const byDriver of bySession.values()) {
    for (const list of byDriver.values()) {
      list.sort((left, right) => left.lap_start - right.lap_start);
    }
  }

  return bySession;
};

const toCompoundUses = (stints: OpenF1Stint[]): StintCompoundUse[] =>
  stints.map((stint) => ({
    compound: mapCompound(stint.compound),
    startedNew: stint.tyre_age_at_start === 0,
  }));

// 미팅의 세션·스틴트·로스터를 주말 타이어 사용으로 정리한다.
export const buildWeekendTireUsage = (
  sessions: OpenF1Session[],
  stints: OpenF1Stint[],
  drivers: OpenF1Driver[],
): WeekendTireUsage => {
  const ordered = orderedSessions(sessions);
  const format = detectFormat(ordered);
  const codeByNumber = buildCodeByNumber(drivers);
  const stintsBySession = buildStintsBySession(stints);

  const weekendSessions: WeekendTireSession[] = ordered.map((session) => ({
    sessionKey: session.session_key,
    name: session.session_name,
    kind: classifySession(session.session_name),
  }));

  // 어느 세션이든 스틴트가 있는 드라이버 번호를 모은다(로스터에 없어도 주행했으면 포함).
  const driverNumbers = new Set<number>();

  for (const byDriver of stintsBySession.values()) {
    for (const driverNumber of byDriver.keys()) {
      driverNumbers.add(driverNumber);
    }
  }

  const driverTires: DriverWeekendTires[] = [...driverNumbers]
    .sort((left, right) => left - right)
    .map((driverNumber) => {
      const sessionUses: SessionTireUse[] = [];

      for (const session of weekendSessions) {
        const stintsForDriver = stintsBySession
          .get(session.sessionKey)
          ?.get(driverNumber);

        if (stintsForDriver !== undefined && stintsForDriver.length > 0) {
          sessionUses.push({
            sessionKey: session.sessionKey,
            compounds: toCompoundUses(stintsForDriver),
          });
        }
      }

      return {
        driverNumber,
        // 코드를 못 찾으면 번호를 표시한다 — 화면에 빈 값이 나가지 않게.
        code: codeByNumber.get(driverNumber) ?? `#${driverNumber}`,
        sessions: sessionUses,
      };
    })
    // 어떤 세션에서도 유효 스틴트가 없던 드라이버는 뺀다.
    .filter((driver) => driver.sessions.length > 0);

  return { format, sessions: weekendSessions, drivers: driverTires };
};

// 마지막 반납 이후 세션 종류. 그 세션에서 신품으로 깐 세트는 반납될 수 없어 잔여 하한이다.
//   일반: FP3 후 반납이 끝 → 퀄리·레이스가 반납 이후.
//   스프린트: 퀄리 후 반납이 끝 → 레이스만 반납 이후.
const postReturnKinds = (format: WeekendFormat): Set<WeekendSessionKind> =>
  format === WeekendFormat.Sprint
    ? new Set([WeekendSessionKind.Race])
    : new Set([WeekendSessionKind.Qualifying, WeekendSessionKind.Race]);

// 한 드라이버의 "잔여 컴파운드별 하한". 반납 이후 세션에서 **신품으로 시작한** 스틴트를
// 컴파운드별로 센다 — 그 세트들은 반납될 수 없었으므로 반드시 잔여에 있다(docs/29 §개정).
// OpenF1 세트 ID 부재로 신품 스틴트(tyre_age_at_start===0)로 세트 수를 근사한다.
// 인터·웨트는 드라이 할당 모델 밖이라 무시한다. 각 하한은 할당량으로 클램프한다.
export const computeRemainingMinimums = (
  usage: WeekendTireUsage,
  driverNumber: number,
): TireSetCounts => {
  const minimums: TireSetCounts = { hard: 0, medium: 0, soft: 0 };
  const driver = usage.drivers.find((entry) => entry.driverNumber === driverNumber);

  if (driver === undefined) {
    return minimums;
  }

  const kinds = postReturnKinds(usage.format);
  const kindByKey = new Map(
    usage.sessions.map((session) => [session.sessionKey, session.kind]),
  );

  for (const sessionUse of driver.sessions) {
    const kind = kindByKey.get(sessionUse.sessionKey);

    if (kind === undefined || !kinds.has(kind)) {
      continue;
    }

    for (const use of sessionUse.compounds) {
      if (!use.startedNew) {
        continue;
      }

      if (use.compound === TireCompound.Hard) {
        minimums.hard += 1;
      } else if (use.compound === TireCompound.Medium) {
        minimums.medium += 1;
      } else if (use.compound === TireCompound.Soft) {
        minimums.soft += 1;
      }
    }
  }

  const allocation = DRY_TIRE_ALLOCATION[usage.format];

  return {
    hard: Math.min(minimums.hard, allocation.hard),
    medium: Math.min(minimums.medium, allocation.medium),
    soft: Math.min(minimums.soft, allocation.soft),
  };
};

// 한 세션(예: 이번 레이스)에서 신품으로 깐 세트를 컴파운드별로 세어 잔여 하한을 낸다.
// 레이스는 모든 반납 이후라 여기서 신품으로 쓴 세트는 반납 불가 → 잔여 하한이다(docs/29).
// AI 컨텍스트가 주말 데이터 없이 레이스 스틴트만으로 잔여를 추정할 때 쓴다(C1).
export const remainingMinimumsFromCompoundUses = (
  uses: StintCompoundUse[],
): TireSetCounts => {
  const minimums: TireSetCounts = { hard: 0, medium: 0, soft: 0 };

  for (const use of uses) {
    if (!use.startedNew) {
      continue;
    }

    if (use.compound === TireCompound.Hard) {
      minimums.hard += 1;
    } else if (use.compound === TireCompound.Medium) {
      minimums.medium += 1;
    } else if (use.compound === TireCompound.Soft) {
      minimums.soft += 1;
    }
  }

  return minimums;
};

// 도메인 TireCompound 로 세션에서 쓴 **구별되는** compound 집합(중복 스틴트 접기). 요약 표기용.
export const distinctCompounds = (uses: StintCompoundUse[]): TireCompound[] => {
  const seen: TireCompound[] = [];

  for (const use of uses) {
    if (!seen.includes(use.compound)) {
      seen.push(use.compound);
    }
  }

  return seen;
};

// 구별되는 compound + 신품 여부. hasNew = 그 세션에서 그 compound 를 신품으로 깐 스틴트가
// 하나라도 있으면 true. 격자에서 신품(채운 점)/중고만(테두리 점)을 구분하는 데 쓴다(A3).
export type DistinctCompoundUse = { compound: TireCompound; hasNew: boolean };

export const distinctCompoundUses = (
  uses: StintCompoundUse[],
): DistinctCompoundUse[] => {
  const byCompound = new Map<TireCompound, boolean>();

  for (const use of uses) {
    byCompound.set(use.compound, (byCompound.get(use.compound) ?? false) || use.startedNew);
  }

  return [...byCompound.entries()].map(([compound, hasNew]) => ({ compound, hasNew }));
};
