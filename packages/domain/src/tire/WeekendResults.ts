// 주말 프랙티스·퀄리 결과 정규화 (docs/27, E1). session_result 는 세션 종류마다 형태가
// 다르다: 프랙티스=베스트랩(스칼라), 퀄리=Q1/Q2/Q3 랩타임 배열. 종류별 타입으로 나눠 담고,
// **세그먼트 랭크는 우리가 계산한다** — position(최종 분류)과 세그먼트 성적은 다른 값이다
// (docs/27 §설계, 회귀: HUL Q1 6위 vs 최종 P10).
//
// LLM 을 쓰지 않는다. 결정론적 정규화다.

import {
  OpenF1Driver,
  OpenF1Session,
  OpenF1SessionResult,
} from "../openf1/OpenF1Types";
import {
  classifyWeekendSession,
  orderedWeekendSessions,
} from "./WeekendTires";
import { WeekendSessionKind } from "./WeekendTires";

// 프랙티스 결과 한 행 — duration 은 베스트 랩(초).
export type PracticeResult = {
  driverNumber: number;
  code: string;
  position: number | null;
  bestLapSeconds: number | null;
  gapToLeaderSeconds: number | null;
};

// 퀄리 세그먼트 하나. rank 는 그 세그먼트에서 기록한 드라이버끼리의 순위(우리가 계산).
export type QualifyingSegment = {
  index: 1 | 2 | 3;
  lapSeconds: number | null;
  rank: number | null;
};

export type QualifyingResult = {
  driverNumber: number;
  code: string;
  finalPosition: number | null;
  segments: QualifyingSegment[];
};

export type WeekendSessionResults = {
  sessionKey: number;
  name: string;
  kind: WeekendSessionKind;
} & (
  | { type: "practice"; practice: PracticeResult[] }
  | { type: "qualifying"; qualifying: QualifyingResult[] }
);

export type WeekendResults = {
  sessions: WeekendSessionResults[];
};

const isQualifyingKind = (kind: WeekendSessionKind): boolean =>
  kind === WeekendSessionKind.Qualifying ||
  kind === WeekendSessionKind.SprintQualifying;

const isPracticeKind = (kind: WeekendSessionKind): boolean =>
  kind === WeekendSessionKind.Practice;

const buildCodeByNumber = (drivers: OpenF1Driver[]): Map<number, string> => {
  const codes = new Map<number, string>();

  for (const driver of drivers) {
    if (!codes.has(driver.driver_number) && driver.name_acronym !== null) {
      codes.set(driver.driver_number, driver.name_acronym);
    }
  }

  return codes;
};

const codeOf = (
  codes: Map<number, string>,
  driverNumber: number,
): string => codes.get(driverNumber) ?? `#${driverNumber}`;

// duration 이 스칼라면 그 값, 배열이면 인덱스 값, 아니면 null.
const scalarDuration = (duration: OpenF1SessionResult["duration"]): number | null =>
  typeof duration === "number" && Number.isFinite(duration) ? duration : null;

const segmentDuration = (
  duration: OpenF1SessionResult["duration"],
  index: number,
): number | null => {
  if (!Array.isArray(duration)) {
    return null;
  }

  const value = duration[index];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const scalarGapSeconds = (
  gap: OpenF1SessionResult["gap_to_leader"],
): number | null =>
  typeof gap === "number" && Number.isFinite(gap) ? gap : null;

// 한 세그먼트에서 기록(non-null)한 드라이버끼리 랩타임 오름차순 순위. 동률은 driver_number.
// 반환: driver_number → rank(1부터). 무기록(null)은 순위에 들지 않는다.
const rankSegment = (
  results: OpenF1SessionResult[],
  index: number,
): Map<number, number> => {
  const timed = results
    .map((result) => ({
      driverNumber: result.driver_number,
      lap: segmentDuration(result.duration, index),
    }))
    .filter((entry): entry is { driverNumber: number; lap: number } => entry.lap !== null)
    .sort((left, right) =>
      left.lap !== right.lap
        ? left.lap - right.lap
        : left.driverNumber - right.driverNumber,
    );

  const rankByDriver = new Map<number, number>();

  timed.forEach((entry, order) => {
    rankByDriver.set(entry.driverNumber, order + 1);
  });

  return rankByDriver;
};

// 최종 분류 순으로 정렬(position null 은 뒤로).
const byFinalPosition = <T extends { finalPosition?: number | null; position?: number | null }>(
  left: T,
  right: T,
): number => {
  const leftPos = (left.finalPosition ?? left.position) ?? Number.MAX_SAFE_INTEGER;
  const rightPos = (right.finalPosition ?? right.position) ?? Number.MAX_SAFE_INTEGER;

  return leftPos - rightPos;
};

const buildPracticeResults = (
  results: OpenF1SessionResult[],
  codes: Map<number, string>,
): PracticeResult[] =>
  results
    .map((result) => ({
      driverNumber: result.driver_number,
      code: codeOf(codes, result.driver_number),
      position: result.position ?? null,
      bestLapSeconds: scalarDuration(result.duration),
      gapToLeaderSeconds: scalarGapSeconds(result.gap_to_leader),
    }))
    .sort(byFinalPosition);

const buildQualifyingResults = (
  results: OpenF1SessionResult[],
  codes: Map<number, string>,
): QualifyingResult[] => {
  const ranks = [0, 1, 2].map((index) => rankSegment(results, index));

  return results
    .map((result) => ({
      driverNumber: result.driver_number,
      code: codeOf(codes, result.driver_number),
      finalPosition: result.position ?? null,
      segments: ([1, 2, 3] as const).map((segment) => {
        const index = segment - 1;

        return {
          index: segment,
          lapSeconds: segmentDuration(result.duration, index),
          rank: ranks[index]?.get(result.driver_number) ?? null,
        };
      }),
    }))
    .sort(byFinalPosition);
};

// 미팅의 세션·결과·로스터를 프랙티스·퀄리 결과로 정리한다(레이스는 아카이브 상세가 담당).
export const buildWeekendResults = (
  sessions: OpenF1Session[],
  results: OpenF1SessionResult[],
  drivers: OpenF1Driver[],
): WeekendResults => {
  const codes = buildCodeByNumber(drivers);
  const resultsBySession = new Map<number, OpenF1SessionResult[]>();

  for (const result of results) {
    if (result.session_key === undefined) {
      continue;
    }

    const list = resultsBySession.get(result.session_key) ?? [];

    list.push(result);
    resultsBySession.set(result.session_key, list);
  }

  const sessionResults: WeekendSessionResults[] = [];

  for (const session of orderedWeekendSessions(sessions)) {
    const kind = classifyWeekendSession(session.session_name);
    const rows = resultsBySession.get(session.session_key) ?? [];

    if (rows.length === 0) {
      continue;
    }

    if (isQualifyingKind(kind)) {
      sessionResults.push({
        sessionKey: session.session_key,
        name: session.session_name,
        kind,
        type: "qualifying",
        qualifying: buildQualifyingResults(rows, codes),
      });
    } else if (isPracticeKind(kind)) {
      sessionResults.push({
        sessionKey: session.session_key,
        name: session.session_name,
        kind,
        type: "practice",
        practice: buildPracticeResults(rows, codes),
      });
    }
    // 레이스·스프린트 결과는 여기서 다루지 않는다(아카이브 상세 최종 순위가 담당).
  }

  return { sessions: sessionResults };
};
