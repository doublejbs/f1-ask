import { createOpenF1ClientOptions } from "@/server/OpenF1ServerClient";
import { loadRoster, type RosterTeam } from "@f1/domain";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

// 온보딩·VS 대문용 팀 로스터 (docs 계획 §Phase 1). OpenF1 `drivers` 를 서버에서 받아
// 팀별로 묶어 반환한다. 로스터는 거의 안 바뀌므로 하루 캐시한다.
const SEASON_YEAR = 2026;
const REVALIDATE_SECONDS = 86_400;

export const revalidate = 86_400;

// 조립된 결과물을 Next 데이터 캐시에 담는다(아카이브 서비스와 같은 패턴) — 캐시 히트 시
// OpenF1 요청 0건.
const getRoster = unstable_cache(
  async (): Promise<RosterTeam[]> =>
    loadRoster({
      year: SEASON_YEAR,
      clientOptions: createOpenF1ClientOptions(REVALIDATE_SECONDS),
      nowMs: Date.now(),
    }),
  ["roster", "v2", String(SEASON_YEAR)],
  { revalidate: REVALIDATE_SECONDS, tags: ["roster"] },
);

export const GET = async () => {
  try {
    return NextResponse.json({ teams: await getRoster() });
  } catch {
    // OpenF1 장애·라이브 차단 시 빈 로스터 — 온보딩은 건너뛰기로 폴백한다.
    return NextResponse.json({ teams: [] });
  }
};
