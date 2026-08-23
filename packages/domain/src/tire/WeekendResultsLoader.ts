// 주말 프랙티스·퀄리 결과 온디맨드 로더 (docs/27, E1). 아카이브와 같은 온디맨드 방식.
// meeting_key 로 세션·결과·로스터 3요청을 받아 정규화한다.

import {
  fetchOpenF1MeetingDrivers,
  fetchOpenF1MeetingSessions,
  fetchOpenF1MeetingSessionResults,
  OpenF1ClientOptions,
} from "../openf1/OpenF1Client";
import { buildWeekendResults, WeekendResults } from "./WeekendResults";

export type LoadWeekendResultsOptions = {
  meetingKey: number;
  clientOptions?: OpenF1ClientOptions;
};

export const loadWeekendResults = async ({
  meetingKey,
  clientOptions = {},
}: LoadWeekendResultsOptions): Promise<WeekendResults> => {
  const [sessions, results, drivers] = await Promise.all([
    fetchOpenF1MeetingSessions(meetingKey, clientOptions),
    fetchOpenF1MeetingSessionResults(meetingKey, clientOptions),
    fetchOpenF1MeetingDrivers(meetingKey, clientOptions),
  ]);

  return buildWeekendResults(sessions, results, drivers);
};
