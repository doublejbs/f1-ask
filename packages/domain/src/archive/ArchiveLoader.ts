import { buildOpenF1LiveFrame } from "../openf1/OpenF1Recording";
import {
  fetchOpenF1Meetings,
  fetchOpenF1PodiumResults,
  fetchOpenF1RaceSessions,
  fetchOpenF1SeasonDrivers,
  fetchOpenF1SessionByKey,
  fetchOpenF1SessionData,
  toOpenF1SessionMeta,
  OpenF1ClientOptions,
} from "../openf1/OpenF1Client";
import { OpenF1Driver, OpenF1SessionResult } from "../openf1/OpenF1Types";
import { isPrimaryRaceEvent } from "../PrimaryEventPriorities";
import { RaceEvent } from "../RaceEvent";
import { RaceEventPriority } from "../RaceEventPriority";
import { RaceEventType } from "../RaceEventType";
import { selectRaceSummaryData } from "../RaceSummary";
import {
  ARCHIVE_PODIUM_SIZE,
  buildArchiveResultRows,
  selectArchivePodium,
} from "./ArchiveResultBuilder";
import { ArchiveRaceDetail, ArchiveRaceListItem } from "./ArchiveRaceTypes";
import { ArchiveResultStatus } from "./ArchiveResultStatus";
import {
  isArchivableSession,
  selectCompletedRaceSessions,
} from "./ArchiveSessionSelector";
import { resolveArchiveSessionWindow } from "./ArchiveSessionWindow";

// 상세 타임라인 상한. 반복 이벤트를 뺀 뒤에는 레이스 한 건이 보통 수십 건이라
// 잘릴 일이 없지만, 응답이 무한정 커지지 않게 막아 둔다.
export const ARCHIVE_TIMELINE_EVENT_LIMIT = 120;

// 상세 요약의 키 모먼트 개수. 목록 카드가 아니라 전용 화면이라 기본값보다 넉넉하다.
export const ARCHIVE_KEY_MOMENT_LIMIT = 6;

export type ArchiveLoadOptions = {
  year: number;
  clientOptions: OpenF1ClientOptions;
  nowMs: number;
};

// 타임라인에서 빼는 고빈도 반복 이벤트.
//
// 추월은 레이스 한 건에 200건이 넘고 피트스톱도 수십 건이라, 그대로 두면
// 「주요 장면」이 같은 문장 수백 줄이 되어 실제 사건(리타이어·페널티·적기)이 묻힌다.
// 총량은 경기 요약이 숫자로 이미 전달하므로 타임라인은 사건만 남긴다.
export const ARCHIVE_TIMELINE_EXCLUDED_TYPES: RaceEventType[] = [
  RaceEventType.Overtake,
  RaceEventType.PitStop,
];

// 주요 이벤트 타임라인을 상한 안으로 줄인다.
//
// 그냥 앞뒤로 자르면 Critical(레드 플래그·세이프티카)이 통째로 밀려날 수 있다.
// Critical 을 먼저 확보하고 남는 자리를 High 로 채운 뒤, 시간순으로 되돌린다.
export const selectArchiveTimelineEvents = (
  events: readonly RaceEvent[],
  limit: number = ARCHIVE_TIMELINE_EVENT_LIMIT,
): RaceEvent[] => {
  const primary = events.filter(
    (event) =>
      isPrimaryRaceEvent(event) &&
      !ARCHIVE_TIMELINE_EXCLUDED_TYPES.includes(event.type),
  );

  if (primary.length <= limit) {
    return [...primary];
  }

  const critical = primary.filter(
    (event) => event.priority === RaceEventPriority.Critical,
  );
  const rest = primary.filter(
    (event) => event.priority !== RaceEventPriority.Critical,
  );
  const remaining = Math.max(0, limit - critical.length);
  const kept = new Set([
    ...critical.slice(0, limit).map((event) => event.id),
    ...rest.slice(0, remaining).map((event) => event.id),
  ]);

  return primary.filter((event) => kept.has(event.id));
};

// 세션별 결과 행을 묶는다. 시즌 전체를 한 번에 받은 응답이므로 session_key 로 가른다.
const groupBySessionKey = <T extends { session_key?: number }>(
  rows: readonly T[],
): Map<number, T[]> => {
  const grouped = new Map<number, T[]>();

  for (const row of rows) {
    const key = row.session_key;

    if (key === undefined) {
      continue;
    }

    const bucket = grouped.get(key) ?? [];

    bucket.push(row);
    grouped.set(key, bucket);
  }

  return grouped;
};

// 완료 레이스 목록 (최신순, 포디움 3인 포함).
//
// OpenF1 요청은 세션 수와 무관하게 4건이다 — sessions / meetings / 포디움 결과 /
// 드라이버 로스터. 세션마다 조회하면 목록 한 번에 수십 요청이 된다.
export const loadArchiveRaceList = async (
  options: ArchiveLoadOptions,
): Promise<ArchiveRaceListItem[]> => {
  const [sessions, meetings] = await Promise.all([
    fetchOpenF1RaceSessions(options.year, options.clientOptions),
    fetchOpenF1Meetings(options.year, options.clientOptions),
  ]);

  const completed = selectCompletedRaceSessions(
    sessions,
    meetings,
    options.nowMs,
  );

  if (completed.length === 0) {
    return [];
  }

  const minSessionKey = Math.min(
    ...completed.map((session) => session.sessionKey),
  );

  // 포디움·로스터 조회가 실패해도 목록 자체는 살린다 — 포디움 없는 항목이
  // 아무것도 없는 화면보다 낫다.
  const [podiumResults, drivers] = await Promise.all([
    fetchOpenF1PodiumResults(
      minSessionKey,
      ARCHIVE_PODIUM_SIZE,
      options.clientOptions,
    ).catch((): OpenF1SessionResult[] => []),
    fetchOpenF1SeasonDrivers(minSessionKey, options.clientOptions).catch(
      (): OpenF1Driver[] => [],
    ),
  ]);

  const resultsBySession = groupBySessionKey(podiumResults);
  const driversBySession = groupBySessionKey(drivers);

  return completed.map((session) => {
    const results = resultsBySession.get(session.sessionKey) ?? [];
    const roster = driversBySession.get(session.sessionKey) ?? [];
    const rows = buildArchiveResultRows(results, roster, session.sessionKey);

    return { ...session, podium: selectArchivePodium(rows) };
  });
};

export type ArchiveDetailLoadOptions = ArchiveLoadOptions & {
  sessionKey: number;
};

// 상세. 라이브 폴러와 같은 정규화 경로(buildOpenF1LiveFrame)를 세션 종료
// 시각으로 호출해 최종 스냅샷 + 전체 이벤트를 얻는다 — 새 정규화 로직은 없다.
export const loadArchiveRaceDetail = async (
  options: ArchiveDetailLoadOptions,
): Promise<ArchiveRaceDetail | null> => {
  // 라운드 번호는 시즌 전체 세션·미팅이 있어야 도출되므로 목록과 같은 두 조회를
  // 재사용한다. 캐시를 타면 상세 한 건에 추가되는 실제 비용은 없다.
  const [sessions, meetings] = await Promise.all([
    fetchOpenF1RaceSessions(options.year, options.clientOptions),
    fetchOpenF1Meetings(options.year, options.clientOptions),
  ]);

  const session =
    sessions.find((row) => row.session_key === options.sessionKey) ??
    (await fetchOpenF1SessionByKey(options.sessionKey, options.clientOptions));

  if (session === null || session === undefined) {
    return null;
  }

  if (!isArchivableSession(session, options.nowMs)) {
    return null;
  }

  const listEntry = selectCompletedRaceSessions(
    sessions.some((row) => row.session_key === options.sessionKey)
      ? sessions
      : [...sessions, session],
    meetings,
    options.nowMs,
  ).find((entry) => entry.sessionKey === options.sessionKey);

  if (listEntry === undefined) {
    return null;
  }

  const meta = toOpenF1SessionMeta(session);
  const data = await fetchOpenF1SessionData(meta, options.clientOptions);
  const { startMs, endMs } = resolveArchiveSessionWindow(data);
  const { snapshot, events } = buildOpenF1LiveFrame(data, {
    startMs,
    nowMs: endMs,
  });

  const results = buildArchiveResultRows(
    data.sessionResults ?? [],
    data.drivers,
    options.sessionKey,
  );

  const summary = selectRaceSummaryData(
    snapshot,
    events,
    ARCHIVE_KEY_MOMENT_LIMIT,
  );

  return {
    session: listEntry,
    results,
    summary: {
      ...summary,
      // 스냅샷의 retired 플래그는 라이브 정규화에서 항상 false 다(OpenF1 은 실시간
      // 리타이어 신호를 주지 않는다). 종료된 세션에는 확정된 session_result 가
      // 있으므로 그쪽을 정답으로 쓴다.
      retiredDriverNumbers: results
        .filter((row) => row.status !== ArchiveResultStatus.Finished)
        .map((row) => row.driverNumber),
    },
    events: selectArchiveTimelineEvents(events),
  };
};
