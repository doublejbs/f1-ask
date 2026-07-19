import { RaceEvent, RaceEventType, SupportedLocale } from "@f1/domain";

// 이벤트는 type + params 로 저장되고, UI 가 locale 에 따라 번역한다.
// (docs/02-architecture.md §39.3) 지원되지 않는 event type 도 raw JSON 을
// 노출하지 않고 fallback 메시지를 사용한다.

type LocaleText = Record<SupportedLocale, string>;

const pick = (locale: SupportedLocale, text: LocaleText): string => text[locale];

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

// 90.771 → "1:30.771"
const formatLapTime = (seconds: number | null): string => {
  if (seconds === null) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  const restText = rest.toFixed(3).padStart(6, "0");

  return `${minutes}:${restText}`;
};

export const translateRaceEvent = (
  event: RaceEvent,
  locale: SupportedLocale,
): string => {
  const driver = asString(event.params.driverCode, "");
  const target = asString(event.params.targetDriverCode, "");
  const compound = asString(event.params.compound, "");
  const lap = formatLapTime(asNumber(event.params.lapTimeSeconds));

  switch (event.type) {
    case RaceEventType.SessionStarted:
      return pick(locale, {
        en: "Session started — green flag.",
        ko: "세션이 시작되었습니다 — 그린 플래그.",
        ja: "セッション開始 — グリーンフラッグ。",
      });
    case RaceEventType.SessionRestarted:
      return pick(locale, {
        en: "Race restarted — back to green.",
        ko: "경기가 재시작되었습니다 — 그린 플래그.",
        ja: "レース再開 — グリーンフラッグ。",
      });
    case RaceEventType.SessionFinished:
      return pick(locale, {
        en: "Session finished.",
        ko: "세션이 종료되었습니다.",
        ja: "セッション終了。",
      });
    case RaceEventType.PositionChange:
      return pick(locale, {
        en: `${driver} changed position.`,
        ko: `${driver} 순위 변동.`,
        ja: `${driver} 順位変動。`,
      });
    case RaceEventType.Overtake:
      return pick(locale, {
        en: `${driver} overtook ${target}.`,
        ko: `${driver}가 ${target}를 추월했습니다.`,
        ja: `${driver} が ${target} をオーバーテイク。`,
      });
    case RaceEventType.PitStop:
      return pick(locale, {
        en: `${driver} pitted for ${compound} tires.`,
        ko: `${driver}가 ${compound} 타이어로 피트인했습니다.`,
        ja: `${driver} が ${compound} タイヤでピットイン。`,
      });
    case RaceEventType.FastestLap:
      return pick(locale, {
        en: `${driver} set the fastest lap (${lap}).`,
        ko: `${driver}가 패스티스트 랩을 기록했습니다 (${lap}).`,
        ja: `${driver} がファステストラップを記録 (${lap})。`,
      });
    case RaceEventType.PersonalBestLap:
      return pick(locale, {
        en: `${driver} set a personal best (${lap}).`,
        ko: `${driver}가 개인 최고 랩을 기록했습니다 (${lap}).`,
        ja: `${driver} が自己ベストを記録 (${lap})。`,
      });
    case RaceEventType.GapClosing:
      return pick(locale, {
        en: `${driver} is closing the gap ahead.`,
        ko: `${driver}가 앞차와의 간격을 좁히고 있습니다.`,
        ja: `${driver} が前車との差を詰めています。`,
      });
    case RaceEventType.GapIncreasing:
      return pick(locale, {
        en: `${driver} is losing ground.`,
        ko: `${driver}가 간격이 벌어지고 있습니다.`,
        ja: `${driver} が差を広げられています。`,
      });
    case RaceEventType.DrsRangeEntered:
      return pick(locale, {
        en: `${driver} is within DRS range of ${target}.`,
        ko: `${driver}가 ${target}에 대해 DRS 범위에 진입했습니다.`,
        ja: `${driver} が ${target} に対しDRS圏内に入りました。`,
      });
    case RaceEventType.YellowFlag:
      return pick(locale, {
        en: "Yellow flag on track.",
        ko: "트랙에 옐로 플래그가 발동되었습니다.",
        ja: "コースにイエローフラッグ。",
      });
    case RaceEventType.GreenFlag:
      return pick(locale, {
        en: "Green flag.",
        ko: "그린 플래그.",
        ja: "グリーンフラッグ。",
      });
    case RaceEventType.SafetyCar:
      return pick(locale, {
        en: "Safety Car deployed.",
        ko: "세이프티카가 출동했습니다.",
        ja: "セーフティカー導入。",
      });
    case RaceEventType.VirtualSafetyCar:
      return pick(locale, {
        en: "Virtual Safety Car deployed.",
        ko: "버추얼 세이프티카가 발동되었습니다.",
        ja: "バーチャルセーフティカー導入。",
      });
    case RaceEventType.RedFlag:
      return pick(locale, {
        en: "Red flag — session stopped.",
        ko: "레드 플래그 — 세션이 중단되었습니다.",
        ja: "レッドフラッグ — セッション中断。",
      });
    case RaceEventType.Retirement:
      return pick(locale, {
        en: `${driver} has retired.`,
        ko: `${driver}가 리타이어했습니다.`,
        ja: `${driver} がリタイア。`,
      });
    case RaceEventType.StrategyNote:
      return pick(locale, {
        en: `Strategy note: ${driver} may have an undercut window.`,
        ko: `전략 노트: ${driver}에게 언더컷 기회가 있을 수 있습니다.`,
        ja: `戦略メモ: ${driver} にアンダーカットのチャンスがあるかもしれません。`,
      });
    default:
      // 알 수 없는 이벤트 — raw JSON 대신 fallback.
      return pick(locale, {
        en: "Race update.",
        ko: "경기 업데이트.",
        ja: "レース更新。",
      });
  }
};
