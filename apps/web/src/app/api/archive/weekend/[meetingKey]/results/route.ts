import {
  WEEKEND_TIRES_REVALIDATE_SECONDS,
  getWeekendResults,
} from "@/server/ArchiveService";
import { weekendResultsSchema } from "@f1/schemas";
import { NextResponse } from "next/server";

// 주말 프랙티스·퀄리 결과 (docs/27, E1). OpenF1 자격증명은 이 서버 경계 안에서만.
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ meetingKey: string }>;
};

export const GET = async (
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> => {
  const { meetingKey } = await context.params;
  const parsedKey = Number(meetingKey);

  if (!Number.isInteger(parsedKey) || parsedKey <= 0) {
    return NextResponse.json(
      { error: "invalid_meeting_key" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const results = await getWeekendResults(parsedKey);
    const body = weekendResultsSchema.parse(results);

    return NextResponse.json(body, {
      headers: {
        "cache-control": `public, max-age=60, s-maxage=${WEEKEND_TIRES_REVALIDATE_SECONDS}, stale-while-revalidate=3600`,
      },
    });
  } catch (error) {
    console.error("주말 결과 조회 실패", { error });

    return NextResponse.json(
      { error: "weekend_results_unavailable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
};
