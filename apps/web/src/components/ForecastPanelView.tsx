"use client";

import { Dictionary } from "@/i18n/Messages";
import { teamColorHex } from "@/lib/Format";
import { LiveDriverState, OvertakeForecast } from "@f1/domain";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

type Props = {
  dictionary: Dictionary;
  // selectImminentOvertakeForecasts 가 이미 임박순·상한으로 골라 준 목록.
  // 정렬·상한 판단은 도메인에 있고 이 뷰는 그리기만 한다.
  forecasts: OvertakeForecast[];
  drivers: LiveDriverState[];
};

// 순위표 바로 위 전용 추월 예측 패널 (docs/24 §개정: 전용 예측 패널).
//
// 행 인라인 배지(10px 보조색)는 실사용에서 찾지도 못해 폐기됐다. 예측은 이 제품의
// 핵심 차별 정보라 "지금 볼 것"과 같은 글래스 카드 언어로 자기 자리를 갖는다.
// 행 형식: "NOR → PIA · 3랩" — chaser 팀컬러 액센트 바(순위 행과 같은 문법)로
// 누가 쫓는지 색으로도 잇는다. 행은 정보 표시만 한다 — 탭 액션은 이번 범위 밖.
export const ForecastPanelView = ({ dictionary, forecasts, drivers }: Props) => {
  const texts = dictionary.forecastPanel;

  // 예측에는 드라이버 번호만 있고 코드·팀컬러는 로스터(UI)에만 있다.
  const driversByNumber = useMemo(() => {
    const map = new Map<number, LiveDriverState>();

    for (const driver of drivers) {
      map.set(driver.driverNumber, driver);
    }

    return map;
  }, [drivers]);

  // 로스터에서 양쪽 드라이버를 못 찾은 예측은 코드 없이 그릴 수 없어 버린다.
  const rows = forecasts.flatMap((forecast) => {
    const chaser = driversByNumber.get(forecast.chaserNumber);
    const target = driversByNumber.get(forecast.targetNumber);

    if (chaser === undefined || target === undefined) {
      return [];
    }

    return [{ forecast, chaser, target }];
  });

  // 활성 예측이 없으면 패널 자체를 그리지 않는다 (docs/24 — 빈 껍데기 금지).
  if (rows.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={texts.title}
      className="glass-float animate-fade-up overflow-hidden rounded-2xl"
    >
      <div className="border-b border-white/[0.08] px-3 py-2">
        <h2 className="text-[12px] font-semibold text-foreground">
          {texts.title}
        </h2>
      </div>

      <div className="divide-y divide-white/[0.06]">
        {rows.map(({ forecast, chaser, target }) => {
          const singular = forecast.predictedLapsToBattle === 1;
          const laps = String(forecast.predictedLapsToBattle);

          const lapsText = (singular ? texts.lapsSingular : texts.laps).replace(
            "{laps}",
            laps,
          );

          // "NOR → PIA · 3랩"만으로는 "예측"이라는 뜻이 전달되지 않으므로
          // 스크린리더에는 카드용 온전한 문장(watchNow 키 유지분)을 싣는다.
          const description = (
            singular
              ? dictionary.watchNow.overtakeForecastSingular
              : dictionary.watchNow.overtakeForecast
          )
            .replace("{code}", chaser.code)
            .replace("{rival}", target.code)
            .replace("{laps}", laps);

          const accent = teamColorHex(chaser.teamColour);

          return (
            <div
              key={`${forecast.chaserNumber}:${forecast.targetNumber}`}
              className="flex items-center gap-2 px-3 py-2"
            >
              <span className="sr-only">{description}</span>

              {/* chaser 팀컬러 액센트 바 — 순위 행의 팀 액센트와 같은 문법. */}
              <span
                aria-hidden
                className="h-4 w-[3px] shrink-0 rounded-full"
                style={{ backgroundColor: accent ?? "hsl(var(--border))" }}
              />

              <span
                aria-hidden
                className="flex items-center gap-1.5 text-sm font-bold tracking-tight"
              >
                {chaser.code}

                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />

                {target.code}
              </span>

              <span
                aria-hidden
                className="text-sm font-semibold tabular-nums text-muted-foreground"
              >
                · {lapsText}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
