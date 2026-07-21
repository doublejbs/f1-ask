import {
  ARCHIVE_DETAIL_REVALIDATE_SECONDS,
  getArchiveRaceDetail,
} from "@/server/ArchiveService";
import { archiveRaceDetailSchema } from "@f1/schemas";
import { NextResponse } from "next/server";

// 완료 레이스 상세 (docs/17-race-archive.md).
// 라이브 폴러와 같은 정규화 경로를 세션 종료 시각으로 호출해 만든 결과를 돌려준다.
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionKey: string }>;
};

export const GET = async (
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> => {
  const { sessionKey } = await context.params;
  const parsedKey = Number(sessionKey);

  if (!Number.isInteger(parsedKey) || parsedKey <= 0) {
    return NextResponse.json(
      { error: "invalid_session_key" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const detail = await getArchiveRaceDetail(parsedKey);

    if (detail === null) {
      return NextResponse.json(
        { error: "race_not_found" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    const body = archiveRaceDetailSchema.parse(detail);

    return NextResponse.json(body, {
      headers: {
        // 완료된 세션 데이터는 불변이다. 브라우저는 한 시간, 공유 캐시(CDN)는
        // 사실상 영구로 잡는다 — max-age 를 빼면 브라우저가 휴리스틱으로
        // 임의 기간 붙잡아 배포 후에도 옛 응답을 계속 쓴다.
        "cache-control": `public, max-age=3600, s-maxage=${ARCHIVE_DETAIL_REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
      },
    });
  } catch (error) {
    console.error("아카이브 상세 조회 실패", { sessionKey: parsedKey, error });

    return NextResponse.json(
      { error: "archive_detail_unavailable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
};
