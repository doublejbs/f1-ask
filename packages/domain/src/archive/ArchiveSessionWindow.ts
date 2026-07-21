import { OpenF1SessionData } from "../openf1/OpenF1Types";

// 랩 시각이 하나도 없을 때 쓰는 fallback 세션 길이 (폴러와 같은 값).
export const ARCHIVE_FALLBACK_SESSION_MS = 3_600_000;

export type ArchiveSessionWindow = {
  startMs: number;
  endMs: number;
};

const parseMs = (value: string | null | undefined): number =>
  value === null || value === undefined ? Number.NaN : Date.parse(value);

const collectMs = (values: readonly (string | null | undefined)[]): number[] =>
  values.map(parseMs).filter((ms) => !Number.isNaN(ms));

// 완료된 세션의 이벤트 창을 구한다.
//
// buildOpenF1LiveFrame 은 [startMs, nowMs] 밖의 이벤트를 버리므로, 종료 시각을
// date_end 로만 잡으면 체커드 플래그 뒤에 오는 race_control 페널티 같은 것이
// 통째로 사라진다. 그래서 date_end 와 실제 원본 데이터의 마지막 시각 중
// 늦은 쪽을 끝으로 삼는다.
export const resolveArchiveSessionWindow = (
  data: OpenF1SessionData,
): ArchiveSessionWindow => {
  const lapStarts = collectMs(data.laps.map((lap) => lap.date_start));
  const tailCandidates = [
    ...lapStarts,
    ...collectMs(data.raceControl.map((message) => message.date)),
    ...collectMs(data.pits.map((pit) => pit.date)),
    ...collectMs((data.teamRadio ?? []).map((radio) => radio.date)),
  ];

  const declaredEndMs = parseMs(data.meta.dateEnd);
  const observedEndMs =
    tailCandidates.length > 0 ? Math.max(...tailCandidates) : Number.NaN;
  const declaredStartMs = parseMs(data.meta.dateStart);
  const observedStartMs =
    lapStarts.length > 0 ? Math.min(...lapStarts) : Number.NaN;

  const endMs = Number.isNaN(declaredEndMs)
    ? observedEndMs
    : Number.isNaN(observedEndMs)
      ? declaredEndMs
      : Math.max(declaredEndMs, observedEndMs);

  // 랩이 있으면 첫 랩을 시작으로 본다. 없으면 예정 시각을 쓴다.
  const knownStartMs = !Number.isNaN(observedStartMs)
    ? observedStartMs
    : declaredStartMs;

  // 어느 한쪽만 알면 나머지는 fallback 길이로 연다 — 창을 [x, x] 로 좁히면
  // 포메이션 랩 전후의 이벤트가 통째로 버려진다. 둘 다 모르면 빈 창을 준다.
  if (Number.isNaN(knownStartMs) && Number.isNaN(endMs)) {
    return { startMs: 0, endMs: 0 };
  }

  if (Number.isNaN(endMs)) {
    return {
      startMs: knownStartMs,
      endMs: knownStartMs + ARCHIVE_FALLBACK_SESSION_MS,
    };
  }

  if (Number.isNaN(knownStartMs)) {
    return { startMs: endMs - ARCHIVE_FALLBACK_SESSION_MS, endMs };
  }

  return { startMs: knownStartMs, endMs };
};
