import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RaceEventType } from "../src/RaceEventType";
import {
  createProcessEnvReader,
  createRaceLlmProvider,
  MOCK_LLM_PROVIDER_NAME,
} from "../src/ai/LlmProviderSelection";
import {
  LlmCommentary,
  LlmCommentaryRequest,
} from "../src/ai/RaceLlmProvider";
import { parseCommentaryVariants } from "../src/worker/CommentaryVariant";
import { normalizeOpenF1SnapshotAt } from "../src/openf1/OpenF1Normalizer";
import { loadBelgianGpSessionData } from "./fixtures/BelgianGpFixture";
import {
  buildTuningInput,
  DEFAULT_TUNING_CALL_CAP,
  DEFAULT_TUNING_VARIANTS,
  diffTuningRuns,
  formatTuningEntry,
  formatTuningPlan,
  formatTuningSummary,
  planTuning,
  runTuning,
  snapshotAtEvent,
  toTuningRunSnapshot,
  TuningOutcome,
} from "./support/CommentaryTuningHarness";

// 오프라인 해설 튜닝 하네스 (docs/20-commentary-tuning.md).
//
// 두 부분이다.
//   1. 배선 검증 (항상 실행) — 주입한 가짜 LLM 으로 하네스의 계약을 고정한다:
//      이벤트별 시점 스냅샷 · 리타이어 포함 · 러닝 컨텍스트 누적 · 호출 상한.
//      GEMINI_API_KEY 없이 · 비용 없이 도는 순수 단위 테스트다.
//   2. 실제 실행 (env 게이트, 기본 skip) — 실제 provider 로 문장을 생성하고 before/after
//      비교를 출력한다. LLM 비용이 나가므로 TUNING_GENERATE=1 을 줘야만 켜진다.

// 가짜 LLM. 호출마다 유일한 문장을 돌려주고, 받은 요청을 기록해 배선을 검증한다.
const createFakeLlm = (): {
  requests: LlmCommentaryRequest[];
  generate: (request: LlmCommentaryRequest) => Promise<LlmCommentary>;
} => {
  const requests: LlmCommentaryRequest[] = [];

  const generate = async (
    request: LlmCommentaryRequest,
  ): Promise<LlmCommentary> => {
    requests.push(request);

    return {
      sourceEventId: request.event.id,
      // 호출 순서를 문장에 실어 러닝 컨텍스트 누적을 눈으로도 추적할 수 있게 한다.
      text: `fake#${requests.length} ${request.event.type} ${request.event.params.driverCode ?? "?"}`,
    };
  };

  return { requests, generate };
};

describe("해설 튜닝 하네스 — 배선 검증", () => {
  it("리타이어가 픽스처에서 재생성돼 해설 대상에 포함된다 (수용 기준 3)", () => {
    const input = buildTuningInput(loadBelgianGpSessionData());
    const retirements = input.eligibleEvents.filter(
      (event) => event.type === RaceEventType.Retirement,
    );
    const codes = retirements
      .map((event) => String(event.params.driverCode ?? ""))
      .sort();

    // 실측 3건: RUS(오프닝랩) · PER(13랩) · STR(25랩).
    expect(codes).toEqual(["PER", "RUS", "STR"]);
  });

  it("각 이벤트가 그 시점의 스냅샷으로 순위 맥락을 받는다 — 단일 최종 스냅샷이 아니다 (수용 기준 2)", async () => {
    const input = buildTuningInput(loadBelgianGpSessionData());
    const fake = createFakeLlm();
    const report = await runTuning(
      { input, variants: DEFAULT_TUNING_VARIANTS, callCap: DEFAULT_TUNING_CALL_CAP },
      fake,
    );

    const rus = report.entries.find(
      (entry) =>
        entry.eventType === RaceEventType.Retirement &&
        entry.driverCode === "RUS",
    );
    const str = report.entries.find(
      (entry) =>
        entry.eventType === RaceEventType.Retirement &&
        entry.driverCode === "STR",
    );

    expect(rus).toBeDefined();
    expect(str).toBeDefined();

    // 오프닝 랩 리타이어(RUS)는 오프닝 랩 순위를 봐야 한다.
    expect(rus?.snapshotCurrentLap).toBe(1);

    // 이벤트마다 다른 시점 스냅샷을 쓴다는 증거: 26랩쯤 리타이어한 STR 은 훨씬 뒤 랩을 본다.
    expect(str?.snapshotCurrentLap).toBeGreaterThan(20);
    expect(str?.snapshotCurrentLap).not.toBe(rus?.snapshotCurrentLap);

    // 근본 버그의 안티 회귀: RUS 가 받은 스냅샷은 **최종 스냅샷이 아니다.**
    // 예전 하네스는 창 끝 스냅샷 하나를 모든 이벤트에 공유해 여기에 최종 랩이 붙었다.
    const finalSnapshot = normalizeOpenF1SnapshotAt(input.index, input.endMs, 0);

    expect(rus?.snapshotCurrentLap).not.toBe(finalSnapshot.currentLap);

    // 하네스가 쓴 시점 스냅샷이 독립 계산한 시점 스냅샷과 일치하는지 확인한다.
    const rusEvent = input.eligibleEvents.find(
      (event) =>
        event.type === RaceEventType.Retirement &&
        event.params.driverCode === "RUS",
    );

    expect(rusEvent).toBeDefined();

    if (rusEvent !== undefined) {
      const independent = snapshotAtEvent(input.index, rusEvent, 0);

      expect(rus?.snapshotCurrentLap).toBe(independent.currentLap);
      // 그 순간의 실제 요청에도 시점 스냅샷이 실렸는지 본다(provider 가 보는 것).
      const rusRequest = fake.requests.find(
        (request) => request.event.id === rusEvent.id,
      );

      expect(rusRequest?.snapshot.currentLap).toBe(independent.currentLap);
    }
  });

  it("러닝 컨텍스트를 워커와 같은 방식으로 누적한다 (수용 기준 6 기반)", async () => {
    const input = buildTuningInput(loadBelgianGpSessionData());
    const fake = createFakeLlm();
    const report = await runTuning(
      { input, variants: DEFAULT_TUNING_VARIANTS, callCap: 5 },
      fake,
    );
    const generated = report.entries.filter(
      (entry) => entry.outcome === TuningOutcome.Generated,
    );

    expect(generated.length).toBeGreaterThanOrEqual(3);

    // 첫 해설은 이전 문장이 없다.
    expect(generated[0]?.recentCommentaryUsed).toEqual([]);

    // 두 번째 해설의 프롬프트에는 첫 해설이 직전 문맥으로 들어간다.
    expect(generated[1]?.recentCommentaryUsed).toContain(generated[0]?.text);

    // 세 번째는 앞선 둘을 시간순으로 담는다.
    expect(generated[2]?.recentCommentaryUsed).toEqual([
      generated[0]?.text,
      generated[1]?.text,
    ]);
  });

  it("호출 상한이 비용을 제한한다 — 이벤트 경계로 자른다 (수용 기준 5)", async () => {
    const input = buildTuningInput(loadBelgianGpSessionData());
    const fake = createFakeLlm();
    const callCap = 2;
    const report = await runTuning(
      { input, variants: DEFAULT_TUNING_VARIANTS, callCap },
      fake,
    );

    // 단일 변형이라 상한 2 = 이벤트 2건만 호출한다.
    expect(fake.requests).toHaveLength(2);
    expect(report.llmCalls).toBe(2);
    expect(report.entries).toHaveLength(2);
    expect(report.plan.acceptedCalls).toBe(2);
    expect(report.plan.isCallCapReached).toBe(true);
    expect(report.plan.skippedByCallCap).toBe(
      report.plan.plannedCalls - 2,
    );
  });

  it("계획이 실행 전에 예상 호출 수를 알린다 (수용 기준 5)", () => {
    const input = buildTuningInput(loadBelgianGpSessionData());
    const plan = planTuning(input, DEFAULT_TUNING_VARIANTS, DEFAULT_TUNING_CALL_CAP);

    expect(plan.plannedCalls).toBe(input.eligibleEvents.length);
    expect(plan.variantCount).toBe(1);

    const lines = formatTuningPlan(plan);

    expect(lines[0]).toContain("예상 LLM 호출");
  });

  it("before/after diff 가 문장 변화를 이벤트 시간순으로 짚는다 (수용 기준 4)", async () => {
    const input = buildTuningInput(loadBelgianGpSessionData());
    const before = toTuningRunSnapshot(
      await runTuning(
        { input, variants: DEFAULT_TUNING_VARIANTS, callCap: 3 },
        createFakeLlm(),
      ),
      "before",
    );

    // "프롬프트를 바꾼" 두 번째 실행을 흉내 낸다: 같은 이벤트에 다른 문장.
    const afterLlm = {
      generate: async (
        request: LlmCommentaryRequest,
      ): Promise<LlmCommentary> => ({
        sourceEventId: request.event.id,
        text: `CHANGED ${request.event.type}`,
      }),
    };
    const after = toTuningRunSnapshot(
      await runTuning(
        { input, variants: DEFAULT_TUNING_VARIANTS, callCap: 3 },
        afterLlm,
      ),
      "after",
    );

    const diff = diffTuningRuns(before, after);

    expect(diff.join("\n")).toContain("변경된 해설 3건");
  });

  it("실패와 mock 폴백을 저장 대상에서 가른다", async () => {
    const input = buildTuningInput(loadBelgianGpSessionData());
    let call = 0;
    const flakyLlm = {
      generate: async (
        request: LlmCommentaryRequest,
      ): Promise<LlmCommentary> => {
        call += 1;

        if (call === 1) {
          throw new Error("주입한 LLM 실패");
        }

        if (call === 2) {
          return { sourceEventId: request.event.id, text: "mock", isMock: true };
        }

        return { sourceEventId: request.event.id, text: "진짜 해설" };
      },
    };
    const report = await runTuning(
      { input, variants: DEFAULT_TUNING_VARIANTS, callCap: 3 },
      flakyLlm,
    );

    expect(report.failed).toBe(1);
    expect(report.mockDropped).toBe(1);
    expect(report.generated).toBe(1);
    // mock/실패 해설은 러닝 컨텍스트에 남지 않는다: 세 번째 호출의 직전 문맥이 비어 있다.
    const third = report.entries[2];

    expect(third?.recentCommentaryUsed).toEqual([]);
  });
});

// ── 실제 provider 로 생성 + before/after 비교 (env 게이트, 기본 skip) ──
//
//   GEMINI_API_KEY=... TUNING_GENERATE=1 \
//     pnpm exec vitest run packages/domain/test/CommentaryTuningHarness.test.ts
//
// 재실행이 쉬워야 하므로 두 파일 경로를 받는다.
//   TUNING_OUT      — 이번 실행 결과를 저장할 경로 (다음 비교의 기준선이 된다)
//   TUNING_BASELINE — 직전 실행 결과 경로. 있으면 문장 diff 를 출력한다
//   TUNING_LABEL    — 이번 실행에 붙일 라벨 (프롬프트 버전 등)
//   TUNING_CALL_CAP — 호출 상한 (기본 60)
//   TUNING_VARIANTS — 변형 (기본 ko:standard). "ko:standard,en:beginner" 형태
const SHOULD_GENERATE = process.env.TUNING_GENERATE === "1";

describe("해설 튜닝 하네스 — 실제 생성", () => {
  (SHOULD_GENERATE ? it : it.skip)(
    "실제 provider 로 해설을 생성하고 시점 순위 맥락과 함께 출력한다",
    async () => {
      const callCap = Number(
        process.env.TUNING_CALL_CAP ?? String(DEFAULT_TUNING_CALL_CAP),
      );
      const variants = parseCommentaryVariants(process.env.TUNING_VARIANTS);
      const label = process.env.TUNING_LABEL ?? "run";

      // provider 선택은 워커·웹과 같은 경로다. 키가 없으면 mock 이 돌아온다.
      const llm = createRaceLlmProvider(
        createProcessEnvReader(process.env),
        (error) => {
          // 키 값은 어떤 경로로도 남기지 않는다. 사유만 남긴다.
          // eslint-disable-next-line no-console
          console.log(
            `  LLM 호출 실패 → mock 폴백: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
          );
        },
      );

      // mock 으로 조용히 도는 것이 이 하네스에서 가장 위험하다. 그럴듯한 문장이 찍혀
      // "잘 됐다" 고 오해하게 만든다. 실제 provider 가 아니면 아예 생성하지 않는다.
      if (llm.name === MOCK_LLM_PROVIDER_NAME) {
        // eslint-disable-next-line no-console
        console.log(
          [
            "",
            "해설 생성을 건너뛴다: LLM API 키가 없다.",
            "  GEMINI_API_KEY 를 셸 환경에 넣고 다시 실행할 것 (값은 문서·로그에 남기지 않는다).",
            "    export GEMINI_API_KEY=...",
            "  키 없이 도는 mock 문장은 품질 판단에 쓸 수 없으므로 생성도 저장도 하지 않는다.",
          ].join("\n"),
        );
        expect(true).toBe(true);

        return;
      }

      const input = buildTuningInput(loadBelgianGpSessionData());
      const plan = planTuning(input, variants, callCap);

      // 실행 전에 예상 호출 수를 먼저 알린다 (비용 가드).
      // eslint-disable-next-line no-console
      console.log(
        [
          "",
          `해설 provider: ${llm.name} (${llm.model})`,
          ...formatTuningPlan(plan),
        ].join("\n"),
      );

      const report = await runTuning(
        { input, variants, callCap },
        { generate: (request) => llm.provider.generateCommentary(request) },
      );

      // 생성 결과를 시간순으로 찍는다. 각 해설이 쓴 시점 순위 맥락도 함께 나온다 —
      // 오프닝 랩 리타이어가 최종 순위가 아니라 그 시점 순위를 보고 있는지 눈으로 확인한다.
      // eslint-disable-next-line no-console
      console.log(
        [
          "",
          "── 생성된 해설 (이벤트 시간순) ──",
          ...report.entries.map((entry, index) =>
            formatTuningEntry(entry, index),
          ),
          "",
          ...formatTuningSummary(report),
        ].join("\n"),
      );

      const current = toTuningRunSnapshot(report, label);
      const baselinePath = process.env.TUNING_BASELINE;

      // 기준선이 있으면 before/after diff 를 출력한다 (프롬프트 변경 효과 관찰).
      if (baselinePath !== undefined && existsSync(baselinePath)) {
        const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

        // eslint-disable-next-line no-console
        console.log(["", ...diffTuningRuns(baseline, current)].join("\n"));
      }

      const outPath = process.env.TUNING_OUT;

      // 이번 실행을 저장해 두면 다음 실행의 TUNING_BASELINE 으로 쓸 수 있다.
      if (outPath !== undefined) {
        writeFileSync(outPath, JSON.stringify(current, null, 2));
        // eslint-disable-next-line no-console
        console.log(`\n이번 실행을 ${outPath} 에 저장했다 (다음 비교의 기준선).`);
      }

      expect(report.llmCalls).toBeLessThanOrEqual(callCap);
    },
    // 실제 LLM 생성은 오래 걸린다. 호출 상한 × 요청 타임아웃 여유를 준다.
    600_000,
  );
});
