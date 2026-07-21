// @f1/domain public API.
// 핵심 도메인 타입과 결정론적 코어 로직을 노출한다.
export { SessionStatus } from "./SessionStatus";
export { TireCompound } from "./TireCompound";
export { RaceEventType } from "./RaceEventType";
export { RaceEventPriority } from "./RaceEventPriority";
export {
  PRIMARY_EVENT_PRIORITIES,
  isPrimaryRaceEvent,
} from "./PrimaryEventPriorities";
// 이벤트 params 에 담기는 값 키 (UI 가 로케일별로 번역한다).
export { RetirementReason } from "./RetirementReason";
export { TrackHazardKind } from "./TrackHazardKind";
export { RaceIncidentReason } from "./RaceIncidentReason";
export { InvestigationStatus } from "./InvestigationStatus";
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
export type { TeamRadioClip } from "./TeamRadioClip";
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
  OpenF1TeamRadio,
  OpenF1SessionMeta,
  OpenF1SessionData,
  OpenF1SessionResult,
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

export {
  filterEventsByDriver,
  matchesDriverEvent,
} from "./DriverEventFilter";

export { RaceEventScope } from "./RaceEventScope";
export {
  RACE_EVENT_SCOPES,
  getRaceEventScope,
} from "./RaceEventScopeMap";
export { SessionStateSeverity } from "./SessionStateSeverity";
export type { ActiveSessionState } from "./SessionStateSelector";
export {
  selectActiveSessionStates,
  getSessionStateSeverity,
} from "./SessionStateSelector";
export { DriverStateMarkerKind } from "./DriverStateMarkerKind";
export type { DriverStateMarker } from "./DriverStateMarkerSelector";
export { selectDriverStateMarkers } from "./DriverStateMarkerSelector";
export {
  selectRecentDriverEvents,
  RECENT_DRIVER_EVENT_TYPES,
  DEFAULT_RECENT_DRIVER_EVENT_WINDOW_MS,
} from "./RecentDriverEventSelector";
export {
  selectLatestPriorityEvents,
  LATEST_PRIORITY_EVENT_LIMIT,
} from "./LatestPriorityEventSelector";
export {
  resolveLatestEventIndex,
  resolveLatestEventCursorId,
  LATEST_EVENT_INDEX,
} from "./LatestEventCursor";

export type { Battle } from "./Battle";
export {
  selectBattles,
  BATTLE_GAP_THRESHOLD_SECONDS,
  OVERRIDE_RANGE_THRESHOLD_SECONDS,
} from "./BattleSelector";

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
export type { AiCommentary, CommentedRaceEvent } from "./ai/AiCommentary";
export {
  attachCommentary,
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

export type { FavoriteDriverDiff } from "./FavoriteDriverSync";
export {
  favoriteDriverPaths,
  isFavoriteDriverNumber,
  toFavoriteDriverDocId,
  parseFavoriteDriverDocId,
  normalizeFavoriteDrivers,
  mergeFavoriteDrivers,
  diffFavoriteDrivers,
} from "./FavoriteDriverSync";

export type {
  LiveRaceReadRepository,
  Unsubscribe,
  EventQueryPlan,
} from "./firestore/LiveRaceRepository";
export {
  firestorePaths,
  LIVE_CURRENT_DOC_ID,
  toLiveSnapshotDoc,
  toSessionDoc,
  eventDocId,
  buildEventQueryPlan,
  FIRESTORE_IN_MAX_VALUES,
} from "./firestore/LiveRaceRepository";
