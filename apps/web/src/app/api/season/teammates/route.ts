import { createOpenF1ClientOptions } from "@/server/OpenF1ServerClient";
import { loadTeammateVs, type TeammateVs } from "@f1/domain";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

// 응원 팀 두 선수의 올 시즌 실적 비교 (docs 계획 §Phase 3). VS 대문이 소비한다.
const SEASON_YEAR = 2026;
const REVALIDATE_SECONDS = 3_600;

export const revalidate = 3_600;

// 팀명을 캐시 키에 넣어 팀별로 결과를 굳힌다 — 벌크 session_result 조회를 1시간 캐시.
const getTeammateVs = (teamName: string): Promise<TeammateVs | null> =>
  unstable_cache(
    async (): Promise<TeammateVs | null> =>
      loadTeammateVs({
        year: SEASON_YEAR,
        teamName,
        clientOptions: createOpenF1ClientOptions(REVALIDATE_SECONDS),
        nowMs: Date.now(),
      }),
    ["season-teammates", "v2", String(SEASON_YEAR), teamName],
    { revalidate: REVALIDATE_SECONDS, tags: ["season-teammates"] },
  )();

export const GET = async (request: Request) => {
  const teamName = new URL(request.url).searchParams.get("team");

  if (teamName === null || teamName.length === 0) {
    return NextResponse.json({ vs: null });
  }

  try {
    return NextResponse.json({ vs: await getTeammateVs(teamName) });
  } catch {
    return NextResponse.json({ vs: null });
  }
};
