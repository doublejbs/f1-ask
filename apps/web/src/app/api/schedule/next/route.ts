import { createOpenF1ClientOptions } from "@/server/OpenF1ServerClient";
import { loadNextRace, type NextRace } from "@f1/domain";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

// 다음 결승 정보 (docs 계획 §Phase 2). 무세션 홈의 카운트다운·대문이 소비한다.
const SEASON_YEAR = 2026;
const REVALIDATE_SECONDS = 3_600;

export const revalidate = 3_600;

// nowMs 를 캐시 키에 넣으면 매초 캐시가 갈리므로, 시각은 로더 안에서 읽고 결과만 1시간 캐시한다.
// 카운트다운의 정밀 시각은 반환된 dateStartIso 로 클라이언트가 매초 계산한다.
const getNextRace = unstable_cache(
  async (): Promise<NextRace | null> =>
    loadNextRace({
      year: SEASON_YEAR,
      clientOptions: createOpenF1ClientOptions(REVALIDATE_SECONDS),
      nowMs: Date.now(),
    }),
  ["schedule-next", "v1", String(SEASON_YEAR)],
  { revalidate: REVALIDATE_SECONDS, tags: ["schedule-next"] },
);

export const GET = async () => {
  try {
    return NextResponse.json({ nextRace: await getNextRace() });
  } catch {
    return NextResponse.json({ nextRace: null });
  }
};
