import { Dictionary } from "@/i18n/Messages";
import { LaneWatchNowSignal, WatchNowSignalType } from "@f1/domain";

// "지금 볼 것" 신호를 한 줄 문장으로 옮긴다.
//
// **LLM 을 쓰지 않는다.** 숫자는 전부 스냅샷에 이미 있는 실측값이고 문장은 사전의
// 템플릿이다(docs/19-watch-now.md §원칙: 결정론적 코어). 감지기 종류 이름도 여기서
// 하드코딩하지 않고 `dictionary.watchNow.signalType` 을 통해 enum 을 번역한다 —
// TranslateRaceEvent 가 event type 을 다루는 방식과 같다.

// 알 수 없는 값 자리. 감지기가 채워 준 필드가 비는 경우는 없어야 하지만, 비어도
// "undefined" 같은 문자열이 화면에 나가지 않도록 막는다.
const UNKNOWN_TEXT = "—";

const fill = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );

const formatNumber = (value: number | null, fractionDigits = 0): string => {
  if (value === null) {
    return UNKNOWN_TEXT;
  }

  return value.toFixed(fractionDigits);
};

// 감지기 종류 이름(칩에 들어가는 짧은 라벨).
export const translateWatchNowSignalType = (
  type: WatchNowSignalType,
  dictionary: Dictionary,
): string => dictionary.watchNow.signalType[type];

// 신호 한 건의 요약 문장.
export const translateWatchNowSignal = (
  entry: LaneWatchNowSignal,
  dictionary: Dictionary,
): string => {
  const { signal } = entry;
  const texts = dictionary.watchNow;
  const code = signal.driverCode;

  if (signal.type === WatchNowSignalType.TireAge) {
    return fill(texts.tireAge, {
      code,
      laps: formatNumber(signal.tireAgeLaps),
    });
  }

  if (signal.type === WatchNowSignalType.GapConvergence) {
    // 간격은 소수 첫째 자리까지 — 임계가 1.0초라 정수로 반올림하면 전부 "1초"가 된다.
    return fill(texts.gapConvergence, {
      code,
      gap: formatNumber(signal.gapSeconds, 1),
    });
  }

  if (signal.type === WatchNowSignalType.UndercutThreat) {
    return fill(texts.undercutThreat, {
      code,
      rival: signal.rivalDriverCode ?? UNKNOWN_TEXT,
    });
  }

  if (signal.type === WatchNowSignalType.OvertakeForecast) {
    // 예측 랩이 1이면 단수 템플릿을 쓴다 — en "1 lap". 워커가 실은 값이라 정수다.
    const template =
      signal.predictedLapsToBattle === 1
        ? texts.overtakeForecastSingular
        : texts.overtakeForecast;

    return fill(template, {
      code,
      rival: signal.rivalDriverCode ?? UNKNOWN_TEXT,
      laps: formatNumber(signal.predictedLapsToBattle),
    });
  }

  return fill(texts.positionSwing, {
    code,
    from: formatNumber(signal.positionFrom),
    to: formatNumber(signal.positionTo),
  });
};
