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
  OpenF1Session,
  OpenF1Meeting,
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
export { classifySafetyCarMessage } from "./openf1/OpenF1SafetyCarClassification";
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
  fetchOpenF1SessionByKey,
  fetchOpenF1RaceSessions,
  fetchOpenF1Meetings,
  fetchOpenF1PodiumResults,
  fetchOpenF1SeasonDrivers,
  fetchOpenF1Token,
  OpenF1Auth,
  toSessionId,
  toOpenF1SessionMeta,
} from "./openf1/OpenF1Client";

// 지난 레이스 기록 (docs/17-race-archive.md).
export { ArchiveResultStatus } from "./archive/ArchiveResultStatus";
export type {
  ArchiveRaceSession,
  ArchivePodiumEntry,
  ArchiveRaceListItem,
  ArchiveResultRow,
  ArchiveRaceDetail,
} from "./archive/ArchiveRaceTypes";
export {
  ARCHIVE_RACE_SESSION_TYPE,
  ARCHIVE_SETTLE_MARGIN_MS,
  buildMeetingRounds,
  selectCompletedRaceSessions,
  isArchivableSession,
} from "./archive/ArchiveSessionSelector";
export {
  ARCHIVE_PODIUM_SIZE,
  resolveArchiveResultStatus,
  buildArchiveResultRows,
  selectArchivePodium,
} from "./archive/ArchiveResultBuilder";
export type { ArchiveSessionWindow } from "./archive/ArchiveSessionWindow";
export {
  resolveArchiveSessionWindow,
  ARCHIVE_FALLBACK_SESSION_MS,
} from "./archive/ArchiveSessionWindow";
export type {
  ArchiveLoadOptions,
  ArchiveDetailLoadOptions,
} from "./archive/ArchiveLoader";
export {
  loadArchiveRaceList,
  loadArchiveRaceDetail,
  selectArchiveTimelineEvents,
  ARCHIVE_TIMELINE_EVENT_LIMIT,
  ARCHIVE_TIMELINE_EXCLUDED_TYPES,
  ARCHIVE_KEY_MOMENT_LIMIT,
} from "./archive/ArchiveLoader";

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
  LlmQuestionFocus,
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
export { GeminiProvider } from "./ai/GeminiProvider";
export type {
  GeminiFetch,
  GeminiProviderOptions,
} from "./ai/GeminiProvider";
export { GeminiChatRole } from "./ai/GeminiChatRole";
export { FallbackLlmProvider } from "./ai/FallbackLlmProvider";
export type { LlmFailureHandler } from "./ai/FallbackLlmProvider";
export type {
  LlmEnvReader,
  SelectedLlmProvider,
} from "./ai/LlmProviderSelection";
export {
  createRaceLlmProvider,
  createProcessEnvReader,
  selectPrimaryLlmProvider,
  normalizeEnvValue,
  MOCK_LLM_PROVIDER_NAME,
} from "./ai/LlmProviderSelection";
export type { AiCommentary, CommentedRaceEvent } from "./ai/AiCommentary";
export {
  attachCommentary,
  isCommentaryEligible,
  selectCommentaryEvents,
  selectKeyMomentEvents,
  toAiCommentary,
  AI_COMMENTARY_ID_PREFIX,
  DEFAULT_COMMENTARY_LIMIT,
} from "./ai/AiCommentary";
export {
  COMMENTARY_ELIGIBLE_EVENT_TYPES,
  isCommentaryEligibleType,
} from "./ai/CommentaryEventAllowlist";
export {
  QUESTION_CONTEXT_ELIGIBLE_EVENT_TYPES,
  QUESTION_CONTEXT_EVENT_TYPE_ADDITIONS,
  isQuestionContextEligibleType,
} from "./ai/QuestionEventAllowlist";
export {
  selectQuestionEvents,
  RECENT_QUESTION_EVENT_LIMIT,
} from "./ai/QuestionEventSelection";
export type {
  CommentaryContext,
  CommentaryStandingsRow,
} from "./ai/CommentaryContext";
export {
  buildCommentaryContext,
  RECENT_COMMENTARY_LIMIT,
} from "./ai/CommentaryContext";
export { buildLlmQuestionFocus } from "./ai/QuestionFocus";
export { buildCommentarySystemRules } from "./ai/CommentaryPrompt";
export type { QuestionPrompt } from "./ai/QuestionPrompt";
export { buildQuestionPrompt } from "./ai/QuestionPrompt";
export type { LlmRequestTimeoutOptions } from "./ai/LlmRequestTimeout";
export {
  withLlmRequestTimeout,
  LLM_REQUEST_TIMEOUT_MS,
  LLM_TIMEOUT_ERROR_PREFIX,
} from "./ai/LlmRequestTimeout";

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
  CommentaryReadRepository,
  Unsubscribe,
  EventQueryPlan,
  CommentaryQueryPlan,
} from "./firestore/LiveRaceRepository";
export {
  firestorePaths,
  LIVE_CURRENT_DOC_ID,
  EVENT_CURSOR_DOC_ID,
  COMMENTARY_CONTEXT_DOC_ID,
  toLiveSnapshotDoc,
  toSessionDoc,
  eventDocId,
  buildEventQueryPlan,
  buildCommentaryQueryPlan,
  FIRESTORE_IN_MAX_VALUES,
} from "./firestore/LiveRaceRepository";

export type { CommentaryDocument } from "./firestore/CommentaryDocument";
export {
  toCommentaryDocId,
  toCommentaryDocument,
  toAiCommentaryFromDocument,
  COMMENTARY_SCHEMA_VERSION,
  MAX_FIRESTORE_DOC_ID_BYTES,
} from "./firestore/CommentaryDocument";

// 폴러 워커 (docs/16-poller-worker.md). Cloud Functions 번들이 사용한다.
export { SessionActivityReason } from "./worker/SessionActivityReason";
export type {
  SessionActivity,
  SessionActivityOptions,
} from "./worker/SessionActivity";
export {
  resolveSessionActivity,
  SESSION_PRE_ROLL_MS,
  SESSION_GRACE_MS,
  SESSION_MAX_DURATION_MS,
} from "./worker/SessionActivity";
export type {
  EventWriteCursor,
  UnwrittenEventSelection,
} from "./worker/EventWriteCursor";
export {
  selectUnwrittenEvents,
  parseEventWriteCursor,
  EMPTY_EVENT_WRITE_CURSOR,
  MAX_TRACKED_EVENT_KEYS,
} from "./worker/EventWriteCursor";
export type { WorkerLease } from "./worker/WorkerLease";
export {
  buildWorkerLease,
  parseWorkerLease,
  isLeaseHeld,
  isLeaseOwnedBy,
  WORKER_LEASE_TTL_MS,
} from "./worker/WorkerLease";
export type {
  PublishState,
  PublishDecision,
  PublishDecisionOptions,
} from "./worker/PublishDecision";
export {
  decidePublish,
  EMPTY_PUBLISH_STATE,
  SNAPSHOT_HEARTBEAT_MS,
} from "./worker/PublishDecision";

// 워커의 AI 해설 생성 (docs/18-ai-commentary-worker.md).
export type { CommentaryVariant } from "./worker/CommentaryVariant";
export {
  parseCommentaryVariants,
  toCommentaryVariantKey,
  DEFAULT_COMMENTARY_VARIANTS,
} from "./worker/CommentaryVariant";
export type { CommentaryRunContext } from "./worker/CommentaryRunContext";
export {
  parseCommentaryRunContext,
  appendCommentaryToRunContext,
  recordCommentaryFailure,
  getRecentCommentary,
  hasGeneratedCommentary,
  hasExhaustedCommentaryRetries,
  EMPTY_COMMENTARY_RUN_CONTEXT,
  MAX_TRACKED_COMMENTARY_KEYS,
  MAX_COMMENTARY_ATTEMPTS,
} from "./worker/CommentaryRunContext";
export type {
  CommentaryTask,
  CommentaryTaskSelection,
  CommentaryGenerationDeps,
  CommentaryGenerationOptions,
  CommentaryGenerationResult,
} from "./worker/CommentaryGeneration";
export {
  generateCommentaryForEvents,
  selectPendingCommentaryTasks,
} from "./worker/CommentaryGeneration";

// "지금 볼 것" 결정론적 감지기 (docs/19-watch-now.md).
export { WatchNowSignalType } from "./watchnow/WatchNowSignalType";
export type { WatchNowSignal } from "./watchnow/WatchNowSignal";
export type { WatchNowDetectorConfig } from "./watchnow/WatchNowDetectorConfig";
export {
  DEFAULT_WATCH_NOW_DETECTOR_CONFIG,
  DEFAULT_TIRE_AGE_THRESHOLD_LAPS,
  DEFAULT_GAP_THRESHOLD_SECONDS,
  DEFAULT_GAP_CONSECUTIVE_SAMPLES,
  DEFAULT_GAP_REARM_MULTIPLIER,
  DEFAULT_UNDERCUT_POSITION_GAP,
  DEFAULT_POSITION_SWING_THRESHOLD,
} from "./watchnow/WatchNowDetectorConfig";
export { WatchNowDetector } from "./watchnow/WatchNowDetector";
// 역할이 고정된 칸 3개. 점수 랭킹(감지기 기본 점수 · 스테이크 등급 · 희소성 · 즐겨찾기
// 가산점 · 선두권 감점)은 근거 없는 값이라 폐기했다 — WatchNowLaneConfig.ts 머리말 참고.
export { WatchNowLane } from "./watchnow/WatchNowLane";
export {
  F1_RACE_POINTS_BY_POSITION,
  resolveChampionshipPoints,
  resolvePointsBetweenPositions,
} from "./watchnow/WatchNowChampionshipPoints";
export type { WatchNowLaneConfig } from "./watchnow/WatchNowLaneConfig";
export {
  DEFAULT_WATCH_NOW_LANE_CONFIG,
  WATCH_NOW_LEADER_LANE_MAX_POSITION,
  WATCH_NOW_CANDIDATE_WINDOW_MS,
  WATCH_NOW_MAX_ENTRIES_PER_LANE,
} from "./watchnow/WatchNowLaneConfig";
export type {
  LaneWatchNowSignal,
  WatchNowLaneGroup,
  WatchNowLanes,
  BuildWatchNowLanesOptions,
} from "./watchnow/WatchNowLaneBuilder";
export {
  buildWatchNowLanes,
  selectWatchNowCandidates,
} from "./watchnow/WatchNowLaneBuilder";
// 감지 → 후보 축적 → 칸 구성을 묶은 클라이언트용 파이프라인. React 훅이 상태 기계가
// 되지 않도록 상태를 전부 여기로 올렸다(테스트 가능성).
export type { WatchNowFeedOptions } from "./watchnow/WatchNowFeed";
export { WatchNowFeed } from "./watchnow/WatchNowFeed";
