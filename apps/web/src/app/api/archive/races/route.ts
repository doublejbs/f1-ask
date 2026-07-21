import {
  ARCHIVE_LIST_REVALIDATE_SECONDS,
  getArchiveRaceList,
} from "@/server/ArchiveService";
import { archiveRaceListResponseSchema } from "@f1/schemas";
import { NextResponse } from "next/server";

// 완료 레이스 목록 (docs/17-race-archive.md).
// OpenF1 자격증명은 이 서버 경계 안에서만 쓰인다.
export const runtime = "nodejs";

export const GET = async (): Promise<NextResponse> => {
  try {
    const races = await getArchiveRaceList();
    // 응답도 경계에서 검증한다 — OpenF1 형태가 바뀌면 조용히 흘리지 않고 막는다.
    const body = archiveRaceListResponseSchema.parse({ races });

    return NextResponse.json(body, {
      headers: {
        // max-age 를 명시하지 않으면 브라우저가 휴리스틱 캐싱으로 임의 기간
        // 붙잡아 둔다. 공유 캐시(CDN)와 브라우저의 수명을 따로 못박는다.
        "cache-control": `public, max-age=60, s-maxage=${ARCHIVE_LIST_REVALIDATE_SECONDS}, stale-while-revalidate=3600`,
      },
    });
  } catch (error) {
    console.error("아카이브 목록 조회 실패", { error });

    // OpenF1 조회 실패가 앱을 멈추면 안 된다 — 목록만 오류 상태로 끝난다.
    return NextResponse.json(
      { error: "archive_list_unavailable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
};
