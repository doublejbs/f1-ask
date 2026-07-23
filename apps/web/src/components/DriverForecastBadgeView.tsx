"use client";

import { Dictionary } from "@/i18n/Messages";
import { OvertakeForecast } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  forecast: OvertakeForecast;
  // 배지에 보이는 앞차 코드. 로스터는 UI 에만 있어 호출부가 번호→코드를 풀어 넘긴다.
  targetCode: string;
  // title/스크린리더 설명("{code}, {laps}랩 후 …")에 쓰는 이 행(chaser)의 코드.
  chaserCode: string;
};

// 순위 행의 추월 예측 배지 (docs/24 §행 인라인 배지). chaser 행의 갭 열, 선두 갭 아래에
// "{laps}랩 후 {target}" 한 줄로 붙는다.
//
// 시각 언어: 배틀 칩(text-[10px] · 갭 열)과 같은 크기·자리를 쓰되, 현재 진행 중인
// 배틀(앰버)과 구분되는 예측 톤으로 muted-foreground + 점선 밑줄을 쓴다 — 새 색이나
// 새 컴포넌트 언어를 만들지 않고 기존 토큰 안에서 "확정 아님"을 표현한다.
// 테두리 칩(glass-chip)을 쓰지 않는 이유: 갭 열은 68px 인데 en 최장 표기
// "{target} in 10 laps" 가 텍스트만으로 열 폭에 딱 차서 패딩·보더 몫이 없다.
export const DriverForecastBadgeView = ({
  dictionary,
  forecast,
  targetCode,
  chaserCode,
}: Props) => {
  const singular = forecast.predictedLapsToBattle === 1;
  const laps = String(forecast.predictedLapsToBattle);

  const text = (
    singular ? dictionary.rowMarker.forecastSingular : dictionary.rowMarker.forecast
  )
    .replace("{laps}", laps)
    .replace("{target}", targetCode);

  // 짧은 배지만으로는 "예측"이라는 뜻이 전달되지 않으므로, title/스크린리더에는
  // 카드용 긴 문구를 재사용해 온전한 문장을 싣는다.
  const description = (
    singular
      ? dictionary.watchNow.overtakeForecastSingular
      : dictionary.watchNow.overtakeForecast
  )
    .replace("{code}", chaserCode)
    .replace("{rival}", targetCode)
    .replace("{laps}", laps);

  return (
    <span title={description} className="leading-tight">
      <span className="sr-only">{description}</span>

      <span
        aria-hidden
        className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-muted-foreground underline decoration-muted-foreground/40 decoration-dashed underline-offset-2"
      >
        {text}
      </span>
    </span>
  );
};
