import {
  fetchOpenF1Meetings,
  fetchOpenF1RaceSessions,
  OpenF1ClientOptions,
} from "../openf1/OpenF1Client";
import { NextRace, selectNextRace } from "./NextRaceSelector";

// 다음 결승을 OpenF1 에서 로드한다 (docs 계획 §Phase 2). Race 세션 목록 + 미팅명을 받아
// 순수 selectNextRace 로 고른다. 시즌이 끝났거나 예정 결승이 없으면 null.
export type LoadNextRaceInput = {
  year: number;
  clientOptions?: OpenF1ClientOptions;
  nowMs: number;
};

export const loadNextRace = async ({
  year,
  clientOptions = {},
  nowMs,
}: LoadNextRaceInput): Promise<NextRace | null> => {
  const [sessions, meetings] = await Promise.all([
    fetchOpenF1RaceSessions(year, clientOptions),
    fetchOpenF1Meetings(year, clientOptions),
  ]);

  return selectNextRace(sessions, meetings, nowMs);
};
