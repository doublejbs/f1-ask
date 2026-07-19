import {
  OpenF1Driver,
  OpenF1Interval,
  OpenF1Lap,
  OpenF1Overtake,
  OpenF1Pit,
  OpenF1Position,
  OpenF1RaceControl,
  OpenF1SessionData,
  OpenF1SessionMeta,
  OpenF1Stint,
  OpenF1Weather,
} from "./OpenF1Types";

// OpenF1 API 클라이언트 (외부 provider).
// 라이브 세션 동안 api.openf1.org 는 인증을 요구한다. 토큰은 1시간 만료되므로
// username/password 로 자동 발급·갱신하는 OpenF1Auth 를 지원한다.
// fetch 구현을 주입 가능하게 해 네트워크 없이 단위 테스트한다.
export type OpenF1FetchImpl = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type OpenF1Credentials = {
  username: string;
  password: string;
};

export type OpenF1AuthOptions = {
  fetchImpl?: OpenF1FetchImpl;
  tokenUrl?: string;
  // 만료 몇 ms 전에 미리 갱신할지 (기본 120초).
  refreshMarginMs?: number;
  // 테스트용 시계 주입.
  nowMs?: () => number;
};

const DEFAULT_BASE_URL = "https://api.openf1.org/v1";
const DEFAULT_TOKEN_URL = "https://api.openf1.org/token";
const DEFAULT_REFRESH_MARGIN_MS = 120_000;
const MAX_ATTEMPTS = 6;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const asFetch = (fetchImpl?: OpenF1FetchImpl): OpenF1FetchImpl =>
  fetchImpl ?? (fetch as unknown as OpenF1FetchImpl);

// username/password → 단기 access token (form-urlencoded, docs: openf1.org/auth.html).
export const fetchOpenF1Token = async (
  credentials: OpenF1Credentials,
  options: OpenF1AuthOptions = {},
): Promise<{ accessToken: string; expiresInSec: number }> => {
  const url = options.tokenUrl ?? DEFAULT_TOKEN_URL;
  const body = `username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}`;

  const response = await asFetch(options.fetchImpl)(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`OpenF1 token request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: string | number;
  };

  if (typeof data.access_token !== "string" || data.access_token.length === 0) {
    throw new Error("OpenF1 token response missing access_token");
  }

  const expiresInSec = Number(data.expires_in ?? 3600) || 3600;

  return { accessToken: data.access_token, expiresInSec };
};

// 토큰을 캐시하고 만료 임박 시 자동 갱신한다. 401 시 강제 갱신에도 사용한다.
export class OpenF1Auth {
  private token: string | null = null;
  private expiresAtMs = 0;

  constructor(
    private readonly credentials: OpenF1Credentials,
    private readonly options: OpenF1AuthOptions = {},
  ) {}

  async getToken(forceRefresh = false): Promise<string> {
    const now = (this.options.nowMs ?? (() => Date.now()))();
    const margin = this.options.refreshMarginMs ?? DEFAULT_REFRESH_MARGIN_MS;

    if (
      !forceRefresh &&
      this.token !== null &&
      now < this.expiresAtMs - margin
    ) {
      return this.token;
    }

    const { accessToken, expiresInSec } = await fetchOpenF1Token(
      this.credentials,
      this.options,
    );

    this.token = accessToken;
    this.expiresAtMs = now + expiresInSec * 1000;

    return accessToken;
  }
}

export type OpenF1ClientOptions = {
  // 정적 토큰(단기) 또는 자동 갱신 auth 중 하나를 사용한다.
  apiKey?: string;
  auth?: OpenF1Auth;
  fetchImpl?: OpenF1FetchImpl;
  baseUrl?: string;
  // 429 재시도 사이 대기(ms). 테스트에서 0 으로 줄일 수 있다.
  retryBaseMs?: number;
};

const resolveFetch = (options: OpenF1ClientOptions): OpenF1FetchImpl =>
  asFetch(options.fetchImpl);

const authHeaders = async (
  options: OpenF1ClientOptions,
  forceRefresh = false,
): Promise<Record<string, string>> => {
  if (options.auth !== undefined) {
    return { Authorization: `Bearer ${await options.auth.getToken(forceRefresh)}` };
  }

  if (options.apiKey !== undefined) {
    return { Authorization: `Bearer ${options.apiKey}` };
  }

  return {};
};

// 단일 엔드포인트 조회 (429 백오프 재시도, 401 시 토큰 강제 갱신 후 1회 재시도).
const fetchEndpoint = async <T>(
  endpoint: string,
  queryKey: string,
  queryValue: string | number,
  options: OpenF1ClientOptions,
): Promise<T[]> => {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${base}/${endpoint}?${queryKey}=${queryValue}`;
  const retryBase = options.retryBaseMs ?? 2000;
  const doFetch = resolveFetch(options);
  let refreshedOn401 = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const headers = await authHeaders(options);
    const response = await doFetch(url, { headers });

    if (response.ok) {
      return (await response.json()) as T[];
    }

    // 404 = 이 세션 유형에 해당 데이터 없음 (예: Qualifying 에는 intervals/pit 이 없음).
    if (response.status === 404) {
      return [];
    }

    // 401 = 토큰 만료/무효. auth 가 있으면 1회 강제 갱신 후 재시도.
    if (
      response.status === 401 &&
      options.auth !== undefined &&
      !refreshedOn401
    ) {
      refreshedOn401 = true;
      await options.auth.getToken(true);
      continue;
    }

    if (response.status === 429) {
      await sleep(retryBase * (attempt + 1));
      continue;
    }

    throw new Error(`OpenF1 ${endpoint} failed: ${response.status}`);
  }

  throw new Error(`OpenF1 ${endpoint} failed after retries`);
};

type OpenF1SessionRow = {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  circuit_short_name: string;
  country_code: string;
  year: number;
};

// 안정적인 세션 ID 슬러그 (예: "2026-sgp-race").
export const toSessionId = (session: OpenF1SessionRow): string =>
  `${session.year}-${session.country_code.toLowerCase()}-${session.session_type
    .toLowerCase()
    .replace(/\s+/g, "-")}`;

// 최신 세션 메타 조회 (session_key=latest).
export const fetchLatestOpenF1Meta = async (
  options: OpenF1ClientOptions = {},
): Promise<OpenF1SessionMeta> => {
  const rows = await fetchEndpoint<OpenF1SessionRow>(
    "sessions",
    "session_key",
    "latest",
    options,
  );
  const session = rows[0];

  if (session === undefined) {
    throw new Error("OpenF1 returned no latest session");
  }

  return {
    sessionId: toSessionId(session),
    sessionKey: session.session_key,
    meetingKey: session.meeting_key,
    sessionName: session.session_name,
    sessionType: session.session_type,
    circuitName: session.circuit_short_name,
    countryCode: session.country_code,
  };
};

// 세션의 원본 데이터 묶음 조회 (순차 + rate-limit 대비).
export const fetchOpenF1SessionData = async (
  meta: OpenF1SessionMeta,
  options: OpenF1ClientOptions = {},
): Promise<OpenF1SessionData> => {
  const key = meta.sessionKey;
  const gap = options.retryBaseMs === 0 ? 0 : 600;

  const drivers = await fetchEndpoint<OpenF1Driver>("drivers", "session_key", key, options);
  await sleep(gap);
  const positions = await fetchEndpoint<OpenF1Position>("position", "session_key", key, options);
  await sleep(gap);
  const intervals = await fetchEndpoint<OpenF1Interval>("intervals", "session_key", key, options);
  await sleep(gap);
  const stints = await fetchEndpoint<OpenF1Stint>("stints", "session_key", key, options);
  await sleep(gap);
  const laps = await fetchEndpoint<OpenF1Lap>("laps", "session_key", key, options);
  await sleep(gap);
  const pits = await fetchEndpoint<OpenF1Pit>("pit", "session_key", key, options);
  await sleep(gap);
  const raceControl = await fetchEndpoint<OpenF1RaceControl>("race_control", "session_key", key, options);
  await sleep(gap);
  const weather = await fetchEndpoint<OpenF1Weather>("weather", "session_key", key, options);
  await sleep(gap);
  const overtakes = await fetchEndpoint<OpenF1Overtake>("overtakes", "session_key", key, options);

  return {
    meta,
    drivers,
    positions,
    intervals,
    stints,
    laps,
    pits,
    raceControl,
    weather,
    overtakes,
  };
};
