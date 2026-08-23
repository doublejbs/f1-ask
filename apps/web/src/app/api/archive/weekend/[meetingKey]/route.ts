import {
  WEEKEND_TIRES_REVALIDATE_SECONDS,
  getWeekendTires,
} from "@/server/ArchiveService";
import { weekendTireUsageSchema } from "@f1/schemas";
import { NextResponse } from "next/server";

// 주말 타이어 사용 (docs/29-tire-strategy.md §범위 밖 → 구현).
// OpenF1 자격증명은 이 서버 경계 안에서만 쓰인다.
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
    const usage = await getWeekendTires(parsedKey);
    // 응답도 경계에서 검증한다 — OpenF1 형태가 바뀌면 조용히 흘리지 않고 막는다.
    const body = weekendTireUsageSchema.parse(usage);

    return NextResponse.json(body, {
      headers: {
        "cache-control": `public, max-age=60, s-maxage=${WEEKEND_TIRES_REVALIDATE_SECONDS}, stale-while-revalidate=3600`,
      },
    });
  } catch (error) {
    console.error("주말 타이어 조회 실패", { error });

    return NextResponse.json(
      { error: "weekend_tires_unavailable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
};
