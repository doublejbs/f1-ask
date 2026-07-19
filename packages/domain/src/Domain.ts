// @f1/domain public API.
// 핵심 도메인 타입과 결정론적 코어 로직을 노출한다.
export { SessionStatus } from "./SessionStatus";
export { TireCompound } from "./TireCompound";
export { RaceEventType } from "./RaceEventType";
export { RaceEventPriority } from "./RaceEventPriority";
export { DataFreshnessStatus } from "./DataFreshnessStatus";
export { DataMode } from "./DataMode";
export {
  ExplanationLevel,
  EXPLANATION_LEVELS,
  DEFAULT_EXPLANATION_LEVEL,
  isExplanationLevel,
} from "./ExplanationLevel";
export {
  SupportedLocale,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  isSupportedLocale,
} from "./SupportedLocale";

export type { WeatherState } from "./WeatherState";
export type { LiveDriverState } from "./LiveDriverState";
export type { LiveRaceSnapshot } from "./LiveRaceSnapshot";
export type {
  RaceEvent,
  RaceEventParams,
  RaceEventParamValue,
} from "./RaceEvent";

export type { Clock } from "./Clock";
export { SystemClock, VirtualClock } from "./Clock";

export type {
  RaceDataProvider,
  ExternalSession,
  ExternalDriver,
  ExternalInterval,
  ExternalLap,
  ExternalStint,
  ExternalPitStop,
  ExternalRaceControlMessage,
} from "./RaceDataProvider";

export {
  getFreshness,
  getFreshnessFromTimestamp,
  FRESHNESS_LIVE_MAX_MS,
  FRESHNESS_DELAYED_MAX_MS,
} from "./Freshness";

export type { DriverSeed } from "./mock/DriverSeed";
export { MOCK_DRIVER_SEEDS } from "./mock/DriverSeed";
export type { MockScenario, MockScenarioStep } from "./mock/MockScenario";
export { DEFAULT_MOCK_SCENARIO } from "./mock/MockScenario";
export type { RaceDataSource, RaceFrame } from "./RaceDataSource";
export type { MockSnapshotResult } from "./mock/MockRaceEngine";
export { MockRaceEngine } from "./mock/MockRaceEngine";

export type { RecordedRaceFrame, RaceRecording } from "./ReplayRaceSource";
export {
  recordRace,
  ReplayRaceSource,
  DEFAULT_RECORD_INTERVAL_SECONDS,
} from "./ReplayRaceSource";

export type {
  OpenF1Driver,
  OpenF1Position,
  OpenF1Interval,
  OpenF1Stint,
  OpenF1Lap,
  OpenF1Pit,
  OpenF1RaceControl,
  OpenF1Weather,
  OpenF1Overtake,
  OpenF1SessionMeta,
  OpenF1SessionData,
} from "./openf1/OpenF1Types";
export { scheduledRaceLaps } from "./openf1/RaceLapCounts";
export type { OpenF1Index } from "./openf1/OpenF1Normalizer";
export {
  buildOpenF1Index,
  normalizeOpenF1SnapshotAt,
  deriveOpenF1Status,
  mapCompound,
} from "./openf1/OpenF1Normalizer";
export type {
  OpenF1Recording,
  OpenF1RecordingFrame,
  OpenF1TimedEvent,
  BuildRecordingOptions,
} from "./openf1/OpenF1Recording";
export {
  buildOpenF1Recording,
  buildOpenF1LiveFrame,
  OpenF1ReplaySource,
} from "./openf1/OpenF1Recording";
export type {
  OpenF1LiveFrame,
  BuildLiveFrameOptions,
} from "./openf1/OpenF1Recording";
export type {
  OpenF1FetchImpl,
  OpenF1ClientOptions,
  OpenF1Credentials,
  OpenF1AuthOptions,
} from "./openf1/OpenF1Client";
export {
  fetchLatestOpenF1Meta,
  fetchOpenF1SessionData,
  fetchOpenF1Token,
  OpenF1Auth,
  toSessionId,
} from "./openf1/OpenF1Client";

export type { FavoriteDriverDetail } from "./FavoriteDriverDetail";
export {
  selectFavoriteDriverDetail,
  selectFavoriteDriverEvents,
  DEFAULT_FAVORITE_EVENT_LIMIT,
} from "./FavoriteDriverDetail";

export { AiConfidence } from "./ai/AiConfidence";
export { LlmChatRole } from "./ai/LlmChatRole";
export type {
  RaceLlmProvider,
  LlmQuestionRequest,
  LlmChatMessage,
  LlmAnswer,
  LlmCommentaryRequest,
  LlmCommentary,
  LlmSummaryRequest,
  LlmSummary,
} from "./ai/RaceLlmProvider";
export { MockLlmProvider } from "./ai/MockLlmProvider";
export { OpenAiProvider } from "./ai/OpenAiProvider";
export type {
  OpenAiFetch,
  OpenAiProviderOptions,
} from "./ai/OpenAiProvider";
export { ClaudeProvider } from "./ai/ClaudeProvider";
export type {
  ClaudeFetch,
  ClaudeProviderOptions,
} from "./ai/ClaudeProvider";
export { FallbackLlmProvider } from "./ai/FallbackLlmProvider";
export type { LlmFailureHandler } from "./ai/FallbackLlmProvider";
export type { AiCommentary } from "./ai/AiCommentary";
export {
  isCommentaryEligible,
  selectCommentaryEvents,
  toAiCommentary,
  DEFAULT_COMMENTARY_LIMIT,
} from "./ai/AiCommentary";

export type { RaceSummaryData } from "./RaceSummary";
export {
  selectRaceSummaryData,
  DEFAULT_KEY_MOMENT_LIMIT,
} from "./RaceSummary";

export type {
  LiveRaceReadRepository,
  Unsubscribe,
} from "./firestore/LiveRaceRepository";
export {
  firestorePaths,
  LIVE_CURRENT_DOC_ID,
  toLiveSnapshotDoc,
  toSessionDoc,
  eventDocId,
} from "./firestore/LiveRaceRepository";
