import { createOpenF1ClientOptions } from "@/server/OpenF1ServerClient";
import {
  ArchiveRaceDetail,
  ArchiveRaceListItem,
  loadArchiveRaceDetail,
  loadArchiveRaceList,
} from "@f1/domain";
import { unstable_cache } from "next/cache";

// 2026 시즌만 다룬다 (docs/17-race-archive.md §범위 밖 — 연도 전환 없음).
export const ARCHIVE_SEASON_YEAR = 2026;

// 목록은 새 레이스가 끝나면 반영돼야 하므로 짧게 잡는다.
export const ARCHIVE_LIST_REVALIDATE_SECONDS = 900;

// 완료된 세션 데이터는 불변이다. 사실상 만료시키지 않는다.
export const ARCHIVE_DETAIL_REVALIDATE_SECONDS = 31_536_000;

// 응답 형태가 바뀌면 이 값을 올려 굳어 있는 캐시를 무효화한다.
// 상세는 1년짜리라 키를 바꾸지 않으면 옛 형태가 그대로 살아남는다.
const ARCHIVE_CACHE_VERSION = "v3";

const ARCHIVE_LIST_TAG = "archive-race-list";
const ARCHIVE_DETAIL_TAG = "archive-race-detail";

// 캐시 계층은 Next 의 데이터 캐시(unstable_cache)다.
//
// 메모리 캐시는 Vercel 서버리스 인스턴스가 자주 재생성돼 신뢰할 수 없고,
// fetch 단위 캐시는 2MB 상한 때문에 상세의 intervals(3MB+) 를 담지 못한다.
// 그래서 "조립이 끝난 작은 결과물"을 캐시한다 — 상세 한 건의 OpenF1 요청
// 11 건이 캐시 히트에서는 0 건이 된다.
export const getArchiveRaceList = unstable_cache(
  async (): Promise<ArchiveRaceListItem[]> =>
    loadArchiveRaceList({
      year: ARCHIVE_SEASON_YEAR,
      // 목록을 이루는 조회는 모두 2MB 미만이라 fetch 캐시도 함께 태운다.
      clientOptions: createOpenF1ClientOptions(
        ARCHIVE_LIST_REVALIDATE_SECONDS,
      ),
      nowMs: Date.now(),
    }),
  [ARCHIVE_LIST_TAG, ARCHIVE_CACHE_VERSION, String(ARCHIVE_SEASON_YEAR)],
  { revalidate: ARCHIVE_LIST_REVALIDATE_SECONDS, tags: [ARCHIVE_LIST_TAG] },
);

// 완료 세션만 캐시에 들어가도록 목록으로 먼저 거른다. 진행 중이거나 방금 끝난
// 세션이 1년짜리 캐시에 굳어버리는 것을 막는 장치다.
export const getArchiveRaceDetail = async (
  sessionKey: number,
): Promise<ArchiveRaceDetail | null> => {
  const races = await getArchiveRaceList();
  const isCompleted = races.some((race) => race.sessionKey === sessionKey);

  if (!isCompleted) {
    return null;
  }

  const loadDetail = unstable_cache(
    async (): Promise<ArchiveRaceDetail | null> =>
      loadArchiveRaceDetail({
        year: ARCHIVE_SEASON_YEAR,
        // 상세 원본은 2MB 를 넘어 fetch 캐시에 담기지 않는다. 결과물만 캐시한다.
        clientOptions: createOpenF1ClientOptions(false),
        nowMs: Date.now(),
        sessionKey,
      }),
    [
      ARCHIVE_DETAIL_TAG,
      ARCHIVE_CACHE_VERSION,
      String(ARCHIVE_SEASON_YEAR),
      String(sessionKey),
    ],
    {
      revalidate: ARCHIVE_DETAIL_REVALIDATE_SECONDS,
      tags: [ARCHIVE_DETAIL_TAG],
    },
  );

  return loadDetail();
};
