import { LiveRaceSnapshot } from "../../src/LiveRaceSnapshot";
import { RaceEvent } from "../../src/RaceEvent";
import { RaceEventScope } from "../../src/RaceEventScope";
import { getRaceEventScope } from "../../src/RaceEventScopeMap";
import { RaceEventType } from "../../src/RaceEventType";
import { isCommentaryEligible } from "../../src/ai/AiCommentary";
import {
  buildCommentaryContext,
  CommentaryStandingsRow,
} from "../../src/ai/CommentaryContext";
import {
  LlmCommentary,
  LlmCommentaryRequest,
} from "../../src/ai/RaceLlmProvider";
import {
  buildOpenF1Index,
  normalizeOpenF1SnapshotAt,
  OpenF1Index,
} from "../../src/openf1/OpenF1Normalizer";
import { buildEvents } from "../../src/openf1/OpenF1Recording";
import { OpenF1SessionData } from "../../src/openf1/OpenF1Types";
import { toCommentaryDocId } from "../../src/firestore/CommentaryDocument";
import {
  appendCommentaryToRunContext,
  CommentaryRunContext,
  EMPTY_COMMENTARY_RUN_CONTEXT,
  getRecentCommentary,
} from "../../src/worker/CommentaryRunContext";
import {
  CommentaryVariant,
  DEFAULT_COMMENTARY_VARIANTS,
  toCommentaryVariantKey,
} from "../../src/worker/CommentaryVariant";

// 오프라인 해설 튜닝 하네스 (docs/20-commentary-tuning.md).
//
// 존재 이유는 하나다: 기존 리플레이/워커는 한 폴링 창의 모든 이벤트에 **창 끝 스냅샷
// 하나**를 공유해, 오프닝 랩 리타이어 해설에 최종 순위가 붙었다. 이 하네스는 정반대로
// 이벤트마다 `Date.parse(event.timestamp)` 시각의 스냅샷을 새로 만들어 그 이벤트의
// 순위 맥락으로 쓴다. 프롬프트는 이번에 바꾸지 않는다 — 하네스가 서면 다음 단계에서
// 프롬프트를 반복 개선한다.
//
// 네트워크도 프로덕션도 쓰지 않는다. 픽스처(BelgianGp2026.json)만으로 이벤트와 시점
// 스냅샷을 모두 재구성한다.

// 기본 호출 상한. 레이스 하나의 해설 대상이 수십 건이라 한 변형이면 완주가 이 안에
// 들어온다. 보수적으로 잡아 두고 필요할 때만 환경변수로 올린다.
export const DEFAULT_TUNING_CALL_CAP = 60;

export enum TuningOutcome {
  // 실제 LLM 문장을 받은 건.
  Generated = "generated",
  // LLM 예외 · 빈 응답.
  Failed = "failed",
  // provider 가 mock 으로 떨어진 건. 품질 판단에 쓸 수 없어 러닝 컨텍스트에 넣지 않는다.
  MockDropped = "mockDropped",
}

// 하네스에 넣을 입력 한 벌. 픽스처를 도메인 형태로 되돌린 뒤 시점 스냅샷을 만들 인덱스와
// 시간순으로 정렬한 해설 대상 이벤트를 함께 담는다.
export type TuningInput = {
  data: OpenF1SessionData;
  index: OpenF1Index;
  startMs: number;
  endMs: number;
  // 전체 이벤트 수(관측용). 해설 대상은 eligibleEvents 다.
  totalEvents: number;
  // 해설 대상 이벤트, 발생 시각 오름차순.
  eligibleEvents: RaceEvent[];
};

// 생성 기록 한 건. 사람이 시점 정합을 눈으로 확인하고, before/after 를 비교하는 단위다.
export type TuningEntry = {
  eventId: string;
  timestamp: string;
  eventType: RaceEventType;
  scope: RaceEventScope;
  variantKey: string;
  driverCode: string | null;
  // 이 이벤트가 받은 **시점 스냅샷**의 랩. 최종 랩이 아니라 그 순간의 랩이어야 한다.
  snapshotCurrentLap: number | null;
  // 시점 스냅샷의 순위 맥락. 어떤 순위·갭을 보고 해설했는지 눈으로 확인한다.
  standings: CommentaryStandingsRow[] | null;
  // 이 호출에 프롬프트로 들어간 직전 해설(러닝 컨텍스트). 반복 제거 관찰용.
  recentCommentaryUsed: string[];
  outcome: TuningOutcome;
  text: string | null;
  failureReason: string | null;
};

// 상한을 적용한 실행 계획. 실행 **전에** 예상 호출 수를 알리는 데 쓴다.
export type TuningPlan = {
  totalEvents: number;
  eligibleEvents: number;
  variantCount: number;
  // 상한이 없었다면 부를 횟수.
  plannedCalls: number;
  // 상한을 적용해 실제로 시도할 횟수.
  acceptedCalls: number;
  skippedByCallCap: number;
  callCap: number;
  isCallCapReached: boolean;
  // 이번에 생성 루프로 넘길 이벤트 id (이벤트 경계로 자른다).
  acceptedEventIds: ReadonlySet<string>;
};

export type TuningReport = {
  plan: TuningPlan;
  entries: TuningEntry[];
  generated: number;
  failed: number;
  mockDropped: number;
  // 실제로 provider 를 부른 횟수. 계획과 어긋나면 그 자체가 보고할 사실이다.
  llmCalls: number;
};

export type TuningDeps = {
  generate: (request: LlmCommentaryRequest) => Promise<LlmCommentary>;
};

const parseMs = (date: string | null): number =>
  date === null ? Number.NaN : Date.parse(date);

// 레이스 구간(첫 랩 시작 ~ 마지막 랩 시작). 그리드 대기 구간은 제외한다.
const resolveRaceWindow = (
  data: OpenF1SessionData,
): { startMs: number; endMs: number } => {
  const lapStarts = data.laps
    .map((lap) => parseMs(lap.date_start))
    .filter((ms) => !Number.isNaN(ms));

  if (lapStarts.length === 0) {
    throw new Error("픽스처에 랩 시작 시각이 하나도 없다");
  }

  return { startMs: Math.min(...lapStarts), endMs: Math.max(...lapStarts) };
};

// 파싱 불가 timestamp 는 맨 뒤로 몰아 id 로 가른다 (CommentaryGeneration 과 같은 결정론 규칙).
const UNPARSEABLE_TIMESTAMP_MS = Number.MAX_SAFE_INTEGER;

const toSortableMs = (timestamp: string): number => {
  const ms = Date.parse(timestamp);

  if (Number.isNaN(ms)) {
    return UNPARSEABLE_TIMESTAMP_MS;
  }

  return ms;
};

// 해설 대상을 발생 시각 오름차순으로 늘어놓는다. 순서가 뒤집히면 러닝 컨텍스트가
// 시간 순으로 쌓이지 않아 시점 정합·반복 제거 관찰이 모두 무의미해진다.
const orderEventsByTime = (events: readonly RaceEvent[]): RaceEvent[] =>
  [...events].sort((a, b) => {
    const diff = toSortableMs(a.timestamp) - toSortableMs(b.timestamp);

    if (diff !== 0) {
      return diff;
    }

    return a.id.localeCompare(b.id);
  });

// 픽스처 도메인 데이터에서 하네스 입력을 만든다. buildEvents 로 이벤트를 재생성하고
// 해설 대상만 시간순으로 골라 둔다.
export const buildTuningInput = (data: OpenF1SessionData): TuningInput => {
  const { startMs, endMs } = resolveRaceWindow(data);
  const index = buildOpenF1Index(data);
  const allEvents = buildEvents(data, startMs, endMs).map((timed) => timed.event);
  const eligibleEvents = orderEventsByTime(
    allEvents.filter((event) => isCommentaryEligible(event)),
  );

  return {
    data,
    index,
    startMs,
    endMs,
    totalEvents: allEvents.length,
    eligibleEvents,
  };
};

// 한 이벤트가 발생한 **그 순간**의 스냅샷. 이 함수가 이 하네스의 핵심이다 — 단일 최종
// 스냅샷 공유를 버리고 이벤트마다 시점 스냅샷을 만든다.
export const snapshotAtEvent = (
  index: OpenF1Index,
  event: RaceEvent,
  version: number,
): LiveRaceSnapshot => {
  const atMs = Date.parse(event.timestamp);

  if (Number.isNaN(atMs)) {
    throw new Error(`이벤트 timestamp 를 파싱할 수 없다: ${event.timestamp}`);
  }

  return normalizeOpenF1SnapshotAt(index, atMs, version);
};

// 상한 안에 들어오는 이벤트만 이벤트 경계로 자른다. 하네스는 항상 빈 러닝 컨텍스트에서
// 시작하므로(재실행 간 상태를 잇지 않는다) 모든 해설 대상이 "미생성" 상태다.
export const planTuning = (
  input: TuningInput,
  variants: readonly CommentaryVariant[],
  callCap: number,
): TuningPlan => {
  const variantCount = variants.length;
  const plannedCalls = input.eligibleEvents.length * variantCount;
  const acceptedEventIds = new Set<string>();
  let acceptedCalls = 0;

  for (const event of input.eligibleEvents) {
    if (acceptedCalls + variantCount > callCap) {
      break;
    }

    acceptedEventIds.add(event.id);
    acceptedCalls += variantCount;
  }

  return {
    totalEvents: input.totalEvents,
    eligibleEvents: input.eligibleEvents.length,
    variantCount,
    plannedCalls,
    acceptedCalls,
    skippedByCallCap: plannedCalls - acceptedCalls,
    callCap,
    isCallCapReached: acceptedCalls < plannedCalls,
    acceptedEventIds,
  };
};

export type RunTuningOptions = {
  input: TuningInput;
  variants: readonly CommentaryVariant[];
  callCap: number;
};

// 시점 스냅샷 + 러닝 컨텍스트 시뮬레이션으로 해설을 생성한다.
//
// 워커(generateCommentaryForEvents)와 **의도적으로 다른** 지점은 스냅샷뿐이다. 워커는
// 창 하나에 스냅샷 하나를 넘기지만, 여기서는 이벤트마다 snapshotAtEvent 로 시점 스냅샷을
// 만들어 넘긴다. 러닝 컨텍스트 누적은 워커와 같은 순수 함수(appendCommentaryToRunContext ·
// getRecentCommentary)로 메모리에서만 굴린다 — Firestore 없이 반복 제거 효과를 관찰한다.
export const runTuning = async (
  options: RunTuningOptions,
  deps: TuningDeps,
): Promise<TuningReport> => {
  const plan = planTuning(options.input, options.variants, options.callCap);
  const entries: TuningEntry[] = [];
  let context: CommentaryRunContext = EMPTY_COMMENTARY_RUN_CONTEXT;
  let llmCalls = 0;
  let generated = 0;
  let failed = 0;
  let mockDropped = 0;
  let version = 0;

  for (const event of options.input.eligibleEvents) {
    if (!plan.acceptedEventIds.has(event.id)) {
      continue;
    }

    // 이벤트마다 새 시점 스냅샷. version 은 스냅샷 식별용으로만 증가시킨다.
    const snapshot = snapshotAtEvent(options.input.index, event, version);

    version += 1;

    for (const variant of options.variants) {
      const variantKey = toCommentaryVariantKey(variant);
      const docId = toCommentaryDocId(
        event.id,
        variant.locale,
        variant.explanationLevel,
      );
      const recentCommentary = getRecentCommentary(context, variantKey);
      // 출력용 순위 맥락. provider 내부의 buildCommentaryPrompt 가 쓰는 것과 **같은 입력**
      // (event, snapshot, recentCommentary)으로 만들어, LLM 이 실제로 본 순위를 그대로 기록한다.
      const capturedContext = buildCommentaryContext(
        event,
        snapshot,
        recentCommentary,
      );

      const baseEntry = {
        eventId: event.id,
        timestamp: event.timestamp,
        eventType: event.type,
        scope: getRaceEventScope(event.type),
        variantKey,
        driverCode: capturedContext.event.driverCode,
        snapshotCurrentLap: snapshot.currentLap,
        standings: capturedContext.standings ?? null,
        recentCommentaryUsed: recentCommentary,
      };

      llmCalls += 1;

      let commentary: LlmCommentary;

      try {
        commentary = await deps.generate({
          event,
          locale: variant.locale,
          explanationLevel: variant.explanationLevel,
          snapshot,
          recentCommentary,
        });
      } catch (error) {
        failed += 1;
        entries.push({
          ...baseEntry,
          outcome: TuningOutcome.Failed,
          text: null,
          failureReason:
            error instanceof Error ? error.message : "알 수 없는 오류",
        });

        continue;
      }

      // mock 은 실제 LLM 이 실패해 폴백한 것이다. 품질 판단에 쓸 수 없으므로 러닝
      // 컨텍스트에 넣지 않는다(넣으면 다음 프롬프트에 가짜 문장이 섞인다).
      if (commentary.isMock === true) {
        mockDropped += 1;
        entries.push({
          ...baseEntry,
          outcome: TuningOutcome.MockDropped,
          text: null,
          failureReason: "실제 LLM 이 실패해 mock 으로 폴백했다",
        });

        continue;
      }

      const text = commentary.text.trim();

      if (text.length === 0) {
        failed += 1;
        entries.push({
          ...baseEntry,
          outcome: TuningOutcome.Failed,
          text: null,
          failureReason: "해설 텍스트가 비어 있다",
        });

        continue;
      }

      // 워커와 같은 방식으로 직전 해설을 누적한다.
      context = appendCommentaryToRunContext(context, variantKey, docId, text);
      generated += 1;
      entries.push({
        ...baseEntry,
        outcome: TuningOutcome.Generated,
        text,
        failureReason: null,
      });
    }
  }

  return {
    plan,
    entries,
    generated,
    failed,
    mockDropped,
    llmCalls,
  };
};

// ── 사람이 읽을 출력 / before-after 비교 ──

const OUTCOME_LABELS: Record<TuningOutcome, string> = {
  [TuningOutcome.Generated]: "OK  ",
  [TuningOutcome.Failed]: "FAIL",
  [TuningOutcome.MockDropped]: "MOCK",
};

// 순위 슬라이스 한 줄을 "P1 ANT(+0.0)" 형태로 압축한다.
const formatStandingsRow = (row: CommentaryStandingsRow): string => {
  const gap =
    row.gapToLeaderSeconds === null
      ? "리더"
      : `+${row.gapToLeaderSeconds.toFixed(1)}`;

  return `P${row.position} ${row.code}(${gap})`;
};

// 실행 전에 알릴 계획. 예상 호출 수를 모르고 시작하면 상한이 사후 통보가 된다.
export const formatTuningPlan = (plan: TuningPlan): string[] => {
  const lines = [
    `해설 튜닝 계획: 이벤트 ${plan.totalEvents}건 중 해설 대상 ${plan.eligibleEvents}건 × 변형 ${plan.variantCount} = 예상 LLM 호출 ${plan.plannedCalls}회 (상한 ${plan.callCap}회)`,
  ];

  if (plan.isCallCapReached) {
    lines.push(
      `  호출 상한에 걸려 ${plan.skippedByCallCap}회는 이번 실행에서 생성하지 않는다. 상한을 올리려면 TUNING_CALL_CAP 을 조정한다`,
    );
  }

  return lines;
};

// 기록 한 건을 세 줄로 편다: 헤더 / 시점 순위 맥락 / 생성 문장.
// 둘째 줄(시점 순위)이 이 하네스의 관전 포인트다 — 오프닝 랩 리타이어가 최종 순위가
// 아니라 그 시점 순위를 보고 있는지 눈으로 확인한다.
export const formatTuningEntry = (
  entry: TuningEntry,
  index: number,
): string => {
  const order = String(index + 1).padStart(3, " ");
  const lap = entry.snapshotCurrentLap === null ? "?" : entry.snapshotCurrentLap;
  const head = `[${order}] ${OUTCOME_LABELS[entry.outcome]} ${entry.timestamp} L${lap} ${entry.eventType} (${entry.scope}) ${entry.variantKey}`;
  const standings =
    entry.standings === null || entry.standings.length === 0
      ? "        순위: (Session 범위 — 순위 맥락 없음)"
      : `        순위: ${entry.standings.map(formatStandingsRow).join("  ")}`;
  const body =
    entry.text === null
      ? `        실패: ${entry.failureReason ?? "사유 없음"}`
      : `        해설: ${entry.text}`;

  return [head, standings, body].join("\n");
};

export const formatTuningSummary = (report: TuningReport): string[] => {
  const lines = [
    "── 해설 튜닝 요약 ──",
    `총 이벤트 ${report.plan.totalEvents}건 · 해설 대상 ${report.plan.eligibleEvents}건 · 예상 호출 ${report.plan.plannedCalls}회`,
    `성공 ${report.generated} · 실패 ${report.failed} · mock 폐기 ${report.mockDropped}`,
    `실제 LLM 호출 ${report.llmCalls}회 (상한 ${report.plan.callCap}회)`,
  ];

  if (report.plan.isCallCapReached) {
    lines.push(
      `호출 상한에 도달해 ${report.plan.skippedByCallCap}회는 생성하지 않았다. 나머지를 보려면 상한을 올리고 다시 실행한다`,
    );
  }

  return lines;
};

// before/after 비교용 직렬화 형태. eventId 로 두 실행을 맞춰 문장 변화를 본다.
// 프롬프트를 바꾼 뒤 재실행하면 무엇이 달라졌는지 이 구조로 diff 한다.
export type TuningRunSnapshot = {
  label: string;
  // eventId → 그 이벤트의 생성 결과.
  byEventId: Record<
    string,
    {
      timestamp: string;
      eventType: RaceEventType;
      snapshotCurrentLap: number | null;
      standingsLeaderCode: string | null;
      text: string | null;
    }
  >;
};

export const toTuningRunSnapshot = (
  report: TuningReport,
  label: string,
): TuningRunSnapshot => {
  const byEventId: TuningRunSnapshot["byEventId"] = {};

  for (const entry of report.entries) {
    const leader = entry.standings?.[0]?.code ?? null;

    byEventId[entry.eventId] = {
      timestamp: entry.timestamp,
      eventType: entry.eventType,
      snapshotCurrentLap: entry.snapshotCurrentLap,
      standingsLeaderCode: leader,
      text: entry.text,
    };
  }

  return { label, byEventId };
};

// 두 실행을 이벤트 시간순으로 나란히 비교한다. 문장이 바뀐 이벤트만 표시한다.
export const diffTuningRuns = (
  before: TuningRunSnapshot,
  after: TuningRunSnapshot,
): string[] => {
  const eventIds = [
    ...new Set([
      ...Object.keys(before.byEventId),
      ...Object.keys(after.byEventId),
    ]),
  ].sort((a, b) => {
    const at = before.byEventId[a] ?? after.byEventId[a];
    const bt = before.byEventId[b] ?? after.byEventId[b];

    return toSortableMs(at?.timestamp ?? "") - toSortableMs(bt?.timestamp ?? "");
  });

  const lines = [
    `── before/after 비교 (${before.label} → ${after.label}) ──`,
  ];
  let changed = 0;

  for (const eventId of eventIds) {
    const b = before.byEventId[eventId];
    const a = after.byEventId[eventId];
    const beforeText = b?.text ?? null;
    const afterText = a?.text ?? null;

    if (beforeText === afterText) {
      continue;
    }

    changed += 1;
    const meta = a ?? b;
    const lap =
      meta?.snapshotCurrentLap === null || meta?.snapshotCurrentLap === undefined
        ? "?"
        : meta.snapshotCurrentLap;

    lines.push(
      `  ${meta?.timestamp ?? "?"} L${lap} ${meta?.eventType ?? "?"}`,
      `    - ${beforeText ?? "(없음)"}`,
      `    + ${afterText ?? "(없음)"}`,
    );
  }

  if (changed === 0) {
    lines.push("  (문장 변화 없음)");
  } else {
    lines.push(`  변경된 해설 ${changed}건`);
  }

  return lines;
};

// 검증 단계 기본 변형. 딱 한 조합(ko:standard)이다.
export const DEFAULT_TUNING_VARIANTS = DEFAULT_COMMENTARY_VARIANTS;
