import { OpenF1SessionMeta } from "../openf1/OpenF1Types";
import { SessionActivityReason } from "./SessionActivityReason";

// 세션 활성 판정 (docs/16-poller-worker.md §비활성 시 즉시 종료).
//
// F1 세션은 드물다. 레이스가 없는 동안 24시간 폴링하면 OpenF1 API 와 Firestore 를
// 헛되이 두드린다. 워커는 기동하자마자 이 판정을 먼저 하고, 비활성이면 Firestore 를
// 한 번도 건드리지 않고 끝낸다 (쓰기 0, 리스 취득도 하지 않는다).

// 세션 시작 전 미리 붙는 여유. 포메이션 랩·그리드 데이터가 date_start 직전에
// 들어오기 시작하므로 조금 일찍 깨어 있는다.
export const SESSION_PRE_ROLL_MS = 10 * 60 * 1000;
// 세션 종료 후 남기는 여유. session_result 와 늦게 올라오는 team_radio 가
// 체커기 이후에 도착하므로 바로 끊으면 마지막 데이터가 잘린다.
export const SESSION_GRACE_MS = 20 * 60 * 1000;
// date_end 가 없을 때 가정하는 최대 세션 길이. date_start 만으로도 판정할 수 있게 한다.
export const SESSION_MAX_DURATION_MS = 4 * 60 * 60 * 1000;

export type SessionActivity = {
  isActive: boolean;
  reason: SessionActivityReason;
  // 판정에 실제로 쓴 창 (로그·테스트용). 시각을 모르면 null.
  windowStartMs: number | null;
  windowEndMs: number | null;
};

export type SessionActivityOptions = {
  nowMs: number;
  preRollMs?: number;
  graceMs?: number;
  maxDurationMs?: number;
};

const parseMs = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? null : parsed;
};

// 세션 메타의 date_start / date_end 로 "지금 폴링해야 하는가"를 판정한다.
export const resolveSessionActivity = (
  meta: Pick<OpenF1SessionMeta, "dateStart" | "dateEnd">,
  options: SessionActivityOptions,
): SessionActivity => {
  const preRollMs = options.preRollMs ?? SESSION_PRE_ROLL_MS;
  const graceMs = options.graceMs ?? SESSION_GRACE_MS;
  const maxDurationMs = options.maxDurationMs ?? SESSION_MAX_DURATION_MS;
  const startMs = parseMs(meta.dateStart);

  // 시작 시각조차 모르면 창을 만들 수 없다. 비용 가드 쪽으로 닫는다.
  if (startMs === null) {
    return {
      isActive: false,
      reason: SessionActivityReason.UnknownSchedule,
      windowStartMs: null,
      windowEndMs: null,
    };
  }

  // date_end 가 비어 있어도 시작 시각은 있으므로 최대 길이를 가정해 판정을 이어간다.
  const endMs = parseMs(meta.dateEnd) ?? startMs + maxDurationMs;
  const windowStartMs = startMs - preRollMs;
  const windowEndMs = endMs + graceMs;

  if (options.nowMs < windowStartMs) {
    return {
      isActive: false,
      reason: SessionActivityReason.BeforeStart,
      windowStartMs,
      windowEndMs,
    };
  }

  if (options.nowMs > windowEndMs) {
    return {
      isActive: false,
      reason: SessionActivityReason.AfterEnd,
      windowStartMs,
      windowEndMs,
    };
  }

  return {
    isActive: true,
    reason: SessionActivityReason.Active,
    windowStartMs,
    windowEndMs,
  };
};
