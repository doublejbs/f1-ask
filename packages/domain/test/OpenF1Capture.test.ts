import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenF1Recording } from "../src/openf1/OpenF1Recording";
import { OpenF1SessionData } from "../src/openf1/OpenF1Types";

// 실제 OpenF1 데이터를 1회 캡처해 web fixture 로 저장한다.
// 네트워크가 필요하므로 기본 test 실행에서는 skip 되고, CAPTURE_OPENF1=1 일 때만 실행한다.
//   CAPTURE_OPENF1=1 pnpm exec vitest run packages/domain/test/OpenF1Capture.test.ts
const SESSION_KEY = 9165; // 2023 Singapore GP — Race
const shouldRun = process.env.CAPTURE_OPENF1 === "1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 429(rate limit)에 대비해 순차 요청 + 지수 백오프 재시도.
const fetchJson = async <T>(endpoint: string): Promise<T[]> => {
  const url = `https://api.openf1.org/v1/${endpoint}?session_key=${SESSION_KEY}`;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url);

    if (response.ok) {
      return (await response.json()) as T[];
    }

    if (response.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }

    throw new Error(`OpenF1 ${endpoint} failed: ${response.status}`);
  }

  throw new Error(`OpenF1 ${endpoint} failed after retries (429)`);
};

describe("OpenF1 capture", () => {
  (shouldRun ? it : it.skip)(
    "captures the 2023 Singapore GP into a compact recording fixture",
    async () => {
      const cachePath = resolve(
        process.env.OPENF1_CACHE ??
          "/private/tmp/openf1-singapore-2023-raw.json",
      );

      let raw: Omit<OpenF1SessionData, "meta">;

      if (existsSync(cachePath)) {
        raw = JSON.parse(readFileSync(cachePath, "utf8"));
      } else {
        // 순차 요청 (rate limit 회피).
        const drivers = await fetchJson<OpenF1SessionData["drivers"][number]>("drivers");
        await sleep(800);
        const positions = await fetchJson<OpenF1SessionData["positions"][number]>("position");
        await sleep(800);
        const intervals = await fetchJson<OpenF1SessionData["intervals"][number]>("intervals");
        await sleep(800);
        const stints = await fetchJson<OpenF1SessionData["stints"][number]>("stints");
        await sleep(800);
        const laps = await fetchJson<OpenF1SessionData["laps"][number]>("laps");
        await sleep(800);
        const pits = await fetchJson<OpenF1SessionData["pits"][number]>("pit");
        await sleep(800);
        const raceControl = await fetchJson<OpenF1SessionData["raceControl"][number]>("race_control");

        raw = { drivers, positions, intervals, stints, laps, pits, raceControl };
        mkdirSync(dirname(cachePath), { recursive: true });
        writeFileSync(cachePath, JSON.stringify(raw));
      }

      const data: OpenF1SessionData = {
        meta: {
          sessionId: "2023-singapore-race",
          sessionKey: SESSION_KEY,
          meetingKey: 1219,
          sessionName: "Singapore GP — Race",
          sessionType: "Race",
          circuitName: "Marina Bay",
          countryCode: "SGP",
        },
        ...raw,
      };

      // 실제 레이스 스타트(첫 랩 타이밍 시작) ~ 체커드 구간.
      // "GREEN LIGHT - PIT EXIT OPEN" 은 레이스 스타트보다 훨씬 이르므로 쓰지 않는다.
      const parse = (d: string | null) => (d === null ? NaN : Date.parse(d));
      const lapStarts = data.laps
        .map((l) => parse(l.date_start))
        .filter((n) => !Number.isNaN(n));
      const chequered = data.raceControl
        .filter((m) => m.flag === "CHEQUERED")
        .map((m) => parse(m.date))
        .sort((a, b) => a - b)[0];

      const posDates = data.positions.map((p) => parse(p.date)).filter((n) => !Number.isNaN(n));
      const startMs = lapStarts.length > 0 ? Math.min(...lapStarts) : Math.min(...posDates);
      const endMs = chequered ?? Math.max(...posDates);

      // 약 90프레임 목표로 cadence 자동 산정 (최소 30초) — fixture 크기 관리.
      const durationSec = (endMs - startMs) / 1000;
      const cadenceMs = Math.max(30_000, Math.round((durationSec / 90) / 5) * 5 * 1000);

      const recording = buildOpenF1Recording(data, { startMs, endMs, cadenceMs });

      const outPath = resolve(
        dirname(new URL(import.meta.url).pathname),
        "../../../apps/web/public/openf1-singapore-2023.json",
      );
      mkdirSync(dirname(outPath), { recursive: true });
      // 숫자를 3자리로 반올림해 크기를 줄인다.
      const serialized = JSON.stringify(recording, (_key, value) =>
        typeof value === "number" ? Number(value.toFixed(3)) : value,
      );
      writeFileSync(outPath, serialized);

      const bytes = serialized.length;
      // eslint-disable-next-line no-console
      console.log(
        `OpenF1 recording: ${recording.frames.length} frames, ${recording.events.length} events, cadence ${cadenceMs / 1000}s, ${(bytes / 1024).toFixed(0)}KB -> ${outPath}`,
      );

      expect(recording.frames.length).toBeGreaterThan(20);
      expect(recording.events.length).toBeGreaterThan(0);
    },
    120_000,
  );
});
