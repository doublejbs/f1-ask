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
import { WeekendFormat } from "./TireAllocation";

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
