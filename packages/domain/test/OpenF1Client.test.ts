import { describe, expect, it } from "vitest";
import {
  fetchLatestOpenF1Meta,
  fetchOpenF1SessionData,
  fetchOpenF1Token,
  OpenF1Auth,
  OpenF1FetchImpl,
} from "../src/openf1/OpenF1Client";
import { buildOpenF1LiveFrame } from "../src/openf1/OpenF1Recording";
import { OpenF1SessionData, OpenF1SessionMeta } from "../src/openf1/OpenF1Types";

// 엔드포인트별 응답을 돌려주는 fake fetch + 호출 기록.
const makeFetch = (
  byEndpoint: Record<string, unknown[]>,
): { fetchImpl: OpenF1FetchImpl; calls: { url: string; auth?: string }[] } => {
  const calls: { url: string; auth?: string }[] = [];

  const fetchImpl: OpenF1FetchImpl = async (url, init) => {
    calls.push({ url, auth: init?.headers?.Authorization });

    const endpoint =
      Object.keys(byEndpoint).find((name) => url.includes(`/${name}?`)) ?? "";

    return {
      ok: true,
      status: 200,
      json: async () => byEndpoint[endpoint] ?? [],
    };
  };

  return { fetchImpl, calls };
};

describe("OpenF1Client", () => {
  it("최신 세션 메타를 조회하고 안정적인 sessionId 를 만든다", async () => {
    const { fetchImpl } = makeFetch({
      sessions: [
        {
          session_key: 9999,
          meeting_key: 1300,
          session_name: "Race",
          session_type: "Race",
          circuit_short_name: "Marina Bay",
          country_code: "SGP",
          year: 2026,
        },
      ],
    });

    const meta = await fetchLatestOpenF1Meta({ fetchImpl });

    expect(meta.sessionKey).toBe(9999);
    expect(meta.sessionId).toBe("2026-sgp-race");
    expect(meta.circuitName).toBe("Marina Bay");
  });

  it("API 키가 있으면 Bearer 인증 헤더를 보낸다", async () => {
    const { fetchImpl, calls } = makeFetch({ sessions: [] });

    await expect(
      fetchLatestOpenF1Meta({ fetchImpl, apiKey: "secret-token" }),
    ).rejects.toThrow(); // 빈 세션 → throw, 하지만 요청은 나갔다

    expect(calls[0]?.auth).toBe("Bearer secret-token");
  });

  it("7개 엔드포인트를 모아 OpenF1SessionData 를 구성한다", async () => {
    const meta: OpenF1SessionMeta = {
      sessionId: "2026-sgp-race",
      sessionKey: 9999,
      meetingKey: 1300,
      sessionName: "Race",
      sessionType: "Race",
      circuitName: "Marina Bay",
      countryCode: "SGP",
    };
    const { fetchImpl } = makeFetch({
      drivers: [
        { driver_number: 1, name_acronym: "VER", full_name: "Max Verstappen", team_name: "Red Bull Racing" },
      ],
      position: [{ date: "2026-07-19T12:00:00Z", driver_number: 1, position: 1 }],
      intervals: [],
      stints: [],
      laps: [],
      pit: [],
      race_control: [],
    });

    const data = await fetchOpenF1SessionData(meta, { fetchImpl, retryBaseMs: 0 });

    expect(data.drivers).toHaveLength(1);
    expect(data.positions).toHaveLength(1);
    expect(data.meta.sessionId).toBe("2026-sgp-race");
  });
});

describe("OpenF1 token auth", () => {
  it("username/password 로 form-urlencoded 토큰 요청을 보낸다", async () => {
    const calls: { url: string; method?: string; body?: string }[] = [];
    const fetchImpl: OpenF1FetchImpl = async (url, init) => {
      calls.push({ url, method: init?.method, body: init?.body });
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "tok-123", expires_in: "3600" }),
      };
    };

    const result = await fetchOpenF1Token(
      { username: "alice@example.com", password: "p@ss word" },
      { fetchImpl },
    );

    expect(result.accessToken).toBe("tok-123");
    expect(result.expiresInSec).toBe(3600);
    expect(calls[0]?.url).toContain("/token");
    expect(calls[0]?.method).toBe("POST");
    // 특수문자는 URL 인코딩된다.
    expect(calls[0]?.body).toBe(
      "username=alice%40example.com&password=p%40ss%20word",
    );
  });

  it("만료 전에는 캐시된 토큰을 재사용하고, 만료 후 갱신한다", async () => {
    let issued = 0;
    let clock = 0;
    const fetchImpl: OpenF1FetchImpl = async () => {
      issued += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: `tok-${issued}`, expires_in: "3600" }),
      };
    };
    const auth = new OpenF1Auth(
      { username: "u", password: "p" },
      { fetchImpl, nowMs: () => clock, refreshMarginMs: 60_000 },
    );

    expect(await auth.getToken()).toBe("tok-1");
    expect(await auth.getToken()).toBe("tok-1"); // 캐시
    expect(issued).toBe(1);

    clock = 3_600_000; // 1시간 경과 → 만료
    expect(await auth.getToken()).toBe("tok-2"); // 갱신
    expect(issued).toBe(2);
  });

  it("401 시 토큰을 강제 갱신하고 재시도한다", async () => {
    let issued = 0;
    let firstDataCall = true;
    const fetchImpl: OpenF1FetchImpl = async (url) => {
      if (url.includes("/token")) {
        issued += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: `tok-${issued}`, expires_in: "3600" }),
        };
      }
      // 첫 데이터 요청은 401(만료), 그 다음은 성공.
      if (firstDataCall) {
        firstDataCall = false;
        return { ok: false, status: 401, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            session_key: 1,
            meeting_key: 2,
            session_name: "Race",
            session_type: "Race",
            circuit_short_name: "Spa-Francorchamps",
            country_code: "BEL",
            year: 2026,
          },
        ],
      };
    };

    const auth = new OpenF1Auth(
      { username: "u", password: "p" },
      { fetchImpl, nowMs: () => 0 },
    );
    const rows = await fetchLatestOpenF1Meta({ auth, fetchImpl });

    expect(rows.sessionKey).toBe(1);
    expect(issued).toBe(2); // 최초 발급 + 401 후 강제 갱신
  });
});

describe("buildOpenF1LiveFrame", () => {
  it("최신 데이터에서 현재 스냅샷과 이벤트를 만든다", () => {
    const startMs = Date.parse("2026-07-19T12:00:00Z");
    const nowMs = startMs + 60_000;

    const data: OpenF1SessionData = {
      meta: {
        sessionId: "openf1-live",
        sessionKey: 9999,
        meetingKey: 1300,
        sessionName: "Race",
        sessionType: "Race",
        circuitName: "Marina Bay",
        countryCode: "SGP",
      },
      drivers: [
        { driver_number: 1, name_acronym: "VER", full_name: "Max Verstappen", team_name: "Red Bull Racing" },
        { driver_number: 4, name_acronym: "NOR", full_name: "Lando Norris", team_name: "McLaren" },
      ],
      positions: [
        { date: "2026-07-19T12:00:30Z", driver_number: 1, position: 1 },
        { date: "2026-07-19T12:00:30Z", driver_number: 4, position: 2 },
      ],
      intervals: [
        { date: "2026-07-19T12:00:30Z", driver_number: 4, gap_to_leader: 1.2, interval: 1.2 },
      ],
      stints: [
        { driver_number: 1, lap_start: 1, lap_end: 20, compound: "SOFT", tyre_age_at_start: 0 },
      ],
      laps: [
        { driver_number: 1, lap_number: 1, date_start: "2026-07-19T12:00:00Z", lap_duration: 92.5 },
      ],
      pits: [],
      raceControl: [
        { date: "2026-07-19T12:00:00Z", category: "Flag", flag: "GREEN", scope: "Track", message: "GREEN" },
      ],
    };

    const frame = buildOpenF1LiveFrame(data, { startMs, nowMs });

    expect(frame.snapshot.drivers.length).toBe(2);
    expect(frame.snapshot.sessionId).toBe("openf1-live");
    const leader = frame.snapshot.drivers.find((d) => d.position === 1);
    expect(leader?.code).toBe("VER");
    expect(frame.events.length).toBeGreaterThan(0);
  });
});
