import { OpenF1Auth, OpenF1ClientOptions, OpenF1FetchImpl } from "@f1/domain";

// OpenF1 자격증명은 서버 전용이다 — NEXT_PUBLIC_ 접두사를 붙이면 클라이언트
// 번들에 인라인되므로 절대 쓰지 않는다 (docs/17-race-archive.md).
// 과거 세션 조회는 대체로 인증 없이도 열려 있어 자격증명은 선택이다.
const readCredentials = (): { username: string; password: string } | null => {
  const username = process.env.OPENF1_USERNAME;
  const password = process.env.OPENF1_PASSWORD;

  if (
    username === undefined ||
    password === undefined ||
    username === "" ||
    password === ""
  ) {
    return null;
  }

  return { username, password };
};

// 토큰은 1시간짜리라 모듈 스코프에서 재사용한다. 서버리스 인스턴스가 사라지면
// 함께 사라지지만, 그때는 다시 발급하면 그만이라 정합성 문제가 없다.
let cachedAuth: OpenF1Auth | null | undefined;

const getAuth = (): OpenF1Auth | undefined => {
  if (cachedAuth === undefined) {
    const credentials = readCredentials();

    cachedAuth = credentials === null ? null : new OpenF1Auth(credentials);
  }

  return cachedAuth ?? undefined;
};

// revalidateSeconds 가 false 면 Next 데이터 캐시를 쓰지 않는다.
// 2MB 를 넘는 응답(레이스 한 건의 intervals 는 3MB 를 넘는다)은 어차피 데이터
// 캐시에 담기지 않으므로, 상세 경로는 no-store 로 두고 결과물만 캐시한다.
const createFetchImpl = (
  revalidateSeconds: number | false,
): OpenF1FetchImpl => {
  const cacheInit =
    revalidateSeconds === false
      ? { cache: "no-store" as const }
      : { next: { revalidate: revalidateSeconds } };

  return async (url, init) =>
    fetch(url, {
      method: init?.method,
      headers: init?.headers,
      body: init?.body,
      ...cacheInit,
    });
};

export const createOpenF1ClientOptions = (
  revalidateSeconds: number | false,
): OpenF1ClientOptions => {
  const auth = getAuth();

  return {
    fetchImpl: createFetchImpl(revalidateSeconds),
    ...(auth === undefined ? {} : { auth }),
  };
};
