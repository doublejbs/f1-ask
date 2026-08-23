// 주말 타이어 온디맨드 로더 (docs/29 §범위 밖 → 구현).
//
// 아카이브와 같은 온디맨드 방식이다 — Firestore 저장·워커 변경 없이 OpenF1 을 조회한다
// (docs/27 §저장하지 않는다). meeting_key 한 벌로 세션·스틴트·로스터 3요청만 쓴다.

import {
  fetchOpenF1MeetingDrivers,
  fetchOpenF1MeetingSessions,
  fetchOpenF1MeetingStints,
  OpenF1ClientOptions,
} from "../openf1/OpenF1Client";
import { buildWeekendTireUsage, WeekendTireUsage } from "./WeekendTires";

export type LoadWeekendTiresOptions = {
  meetingKey: number;
  clientOptions?: OpenF1ClientOptions;
};

export const loadWeekendTires = async ({
  meetingKey,
  clientOptions = {},
}: LoadWeekendTiresOptions): Promise<WeekendTireUsage> => {
  const [sessions, stints, drivers] = await Promise.all([
    fetchOpenF1MeetingSessions(meetingKey, clientOptions),
    fetchOpenF1MeetingStints(meetingKey, clientOptions),
    fetchOpenF1MeetingDrivers(meetingKey, clientOptions),
  ]);

  return buildWeekendTireUsage(sessions, stints, drivers);
};
