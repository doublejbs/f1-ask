import {
  ActiveSessionState,
  RaceEventType,
  SupportedLocale,
  TrackHazardKind,
} from "@f1/domain";

// 상단 스트립(SessionStatusStripView)에 쓰는 **짧은 상태 명사구** 사전.
//
// translateRaceEvent 를 재사용하지 않는 이유:
//   translateRaceEvent 는 "세이프티카가 출동했습니다" 같은 **서술문**이다. 그건
//   "방금 무슨 일이 있었나"를 말하는 표현이라 시간순 피드에 맞다. 스트립은
//   "지금 어떤 상태인가"를 말하는 자리이고 칩 폭이 좁아 서술문이 들어가지 않는다.
//   그래서 "SC 전개" 같은 상태 명사구를 별도 키로 둔다.
// (docs/14-event-placement.md "세션 상태 → 상단 스트립")

type LocaleText = Record<SupportedLocale, string>;

const pick = (locale: SupportedLocale, text: LocaleText): string => text[locale];

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

// 트랙 위험물 명사. translateRaceEvent 와 같은 어휘를 쓴다.
const HAZARD_NOUNS: Record<TrackHazardKind, LocaleText> = {
  [TrackHazardKind.RecoveryVehicle]: {
    en: "Recovery vehicle",
    ko: "리커버리 차량",
    ja: "レッカー車",
  },
  [TrackHazardKind.Marshals]: {
    en: "Marshals",
    ko: "마샬",
    ja: "マーシャル",
  },
};

const TRACK_HAZARD_KIND_VALUES: readonly string[] =
  Object.values(TrackHazardKind);

// params.kind 를 TrackHazardKind 로 좁힌다. 모르는 값은 null.
const readHazardKind = (value: unknown): TrackHazardKind | null => {
  if (typeof value !== "string") {
    return null;
  }

  return TRACK_HAZARD_KIND_VALUES.includes(value)
    ? (value as TrackHazardKind)
    : null;
};

// 섹터 옐로 라벨. 섹터를 모르면 트랙 전체 옐로로 표기한다.
const buildSectorYellowLabel = (
  sector: number | null,
  isDouble: boolean,
): LocaleText => {
  if (sector === null) {
    return isDouble
      ? { en: "Double Yellow", ko: "더블 옐로", ja: "ダブルイエロー" }
      : { en: "Yellow Flag", ko: "옐로 플래그", ja: "イエローフラッグ" };
  }

  if (isDouble) {
    return {
      en: `S${sector} Double Yellow`,
      ko: `섹터 ${sector} 더블 옐로`,
      ja: `セクター${sector} ダブルイエロー`,
    };
  }

  return {
    en: `S${sector} Yellow`,
    ko: `섹터 ${sector} 옐로`,
    ja: `セクター${sector} イエロー`,
  };
};

// 강우 확률 라벨. 확률을 모르면 확률 없이 표기한다.
const buildRainRiskLabel = (percent: number | null): LocaleText => {
  if (percent === null) {
    return { en: "Rain Risk", ko: "강우 가능", ja: "降水の可能性" };
  }

  return {
    en: `Rain ${percent}%`,
    ko: `강우 ${percent}%`,
    ja: `降水 ${percent}%`,
  };
};

// 트랙 위험물 라벨. 종류를 모르면 일반 명사로 떨어뜨린다.
const buildTrackHazardLabel = (kind: TrackHazardKind | null): LocaleText => {
  if (kind === null) {
    return { en: "Track Hazard", ko: "트랙 위험물", ja: "コース上の障害" };
  }

  return HAZARD_NOUNS[kind];
};

// 활성 세션 상태 → 칩에 들어갈 짧은 상태 명사구.
// 순수 함수이며 알 수 없는 타입도 raw 값을 노출하지 않는다.
export const translateSessionState = (
  state: ActiveSessionState,
  locale: SupportedLocale,
): string => {
  switch (state.type) {
    case RaceEventType.RedFlag:
      return pick(locale, {
        en: "Red Flag",
        ko: "레드 플래그",
        ja: "レッドフラッグ",
      });
    case RaceEventType.SafetyCar:
      return pick(locale, {
        en: "Safety Car",
        ko: "SC 전개",
        ja: "セーフティカー",
      });
    case RaceEventType.VirtualSafetyCar:
      return pick(locale, {
        en: "VSC",
        ko: "VSC 전개",
        ja: "VSC",
      });
    case RaceEventType.YellowFlag:
      return pick(locale, {
        en: "Yellow Flag",
        ko: "옐로 플래그",
        ja: "イエローフラッグ",
      });
    case RaceEventType.SectorYellow:
      return pick(
        locale,
        buildSectorYellowLabel(state.sector, state.params.double === true),
      );
    case RaceEventType.TrackHazard:
      return pick(
        locale,
        buildTrackHazardLabel(readHazardKind(state.params.kind)),
      );
    case RaceEventType.PitLaneClosed:
      return pick(locale, {
        en: "Pit Lane Closed",
        ko: "피트레인 폐쇄",
        ja: "ピットレーン閉鎖",
      });
    case RaceEventType.OvertakeModeDisabled:
      return pick(locale, {
        en: "Overtake Mode Off",
        ko: "오버테이크 모드 차단",
        ja: "オーバーテイクモード禁止",
      });
    case RaceEventType.RainRisk:
      return pick(locale, buildRainRiskLabel(asNumber(state.params.percent)));
    case RaceEventType.ChequeredFlag:
      return pick(locale, {
        en: "Chequered Flag",
        ko: "체커기",
        ja: "チェッカーフラッグ",
      });
    case RaceEventType.SessionFinished:
      return pick(locale, {
        en: "Session Finished",
        ko: "세션 종료",
        ja: "セッション終了",
      });
    default:
      // 스트립이 여는 타입은 위에서 모두 다룬다. 도메인에 새 지속 상태가 생겨도
      // raw 값 대신 중립 문구를 보여준다.
      return pick(locale, {
        en: "Race Status",
        ko: "경기 상태",
        ja: "レース状況",
      });
  }
};
