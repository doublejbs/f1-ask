"use client";

import { Dictionary } from "@/i18n/Messages";
import {
  translateWatchNowSignal,
  translateWatchNowSignalType,
} from "@/i18n/TranslateWatchNowSignal";
import { cn } from "@/lib/Utils";
import { LaneWatchNowSignal, LiveDriverState } from "@f1/domain";

type Props = {
  dictionary: Dictionary;
  entry: LaneWatchNowSignal;
  // 행 탭으로 열 드라이버. 로스터에 없으면 null 이고 그때는 탭 불가다.
  driver: LiveDriverState | null;
  onSelectDriver: (driver: LiveDriverState) => void;
};

// 행 하나. 터치 타깃 44pt 를 지키기 위해 min-h-[44px] 를 쓴다(iOS HIG).
const ROW_CLASS =
  "flex min-h-[44px] w-full items-center gap-2 px-3 py-1.5 text-left";

// 신호 한 건을 한 줄로 그린다.
//
// 레이아웃: [종류 칩] [순위] [요약 문장] [걸린 포인트]
//
// **드라이버 코드는 요약 문장 안에 있고 잘리지 않는다.** 문장 전체를 truncate 하면
// 3글자 코드가 먼저 사라질 수 있으므로 코드를 앞에 오는 템플릿으로 고정했고(사전),
// 잘리는 것은 항상 뒤쪽 수식어다. 팀명은 이 행에 넣지 않는다 — 넣으면 좁은 폭에서
// 잘림이 불가피하고, 팀은 순위표와 상세 시트에 이미 있다.
export const WatchNowLaneRowView = ({
  dictionary,
  entry,
  driver,
  onSelectDriver,
}: Props) => {
  const texts = dictionary.watchNow;
  const positionText =
    entry.position === null
      ? null
      : texts.position.replace("{position}", String(entry.position));

  const body = (
    <>
      {/* 감지기 종류. 도메인 enum 을 사전이 번역한다 — 문자열 하드코딩 없음. */}
      <span className="shrink-0 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {translateWatchNowSignalType(entry.signal.type, dictionary)}
      </span>

      {positionText === null ? null : (
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {positionText}
        </span>
      )}

      <span className="flex-1 truncate text-[13px] font-semibold leading-snug text-foreground">
        {translateWatchNowSignal(entry, dictionary)}
      </span>

      {/* 걸린 챔피언십 포인트. 0 점이면 정보가 없으므로 자리를 쓰지 않는다. */}
      {entry.pointsAtStake > 0 ? (
        <span
          aria-label={texts.pointsAtStakeLabel.replace(
            "{points}",
            String(entry.pointsAtStake),
          )}
          className="shrink-0 text-[11px] font-semibold tabular-nums text-amber-300/90"
        >
          {texts.pointsAtStake.replace("{points}", String(entry.pointsAtStake))}
        </span>
      ) : null}
    </>
  );

  if (driver === null) {
    return <div className={ROW_CLASS}>{body}</div>;
  }

  const handleSelectDriver = () => {
    onSelectDriver(driver);
  };

  return (
    <button
      type="button"
      onClick={handleSelectDriver}
      aria-label={texts.openDriver.replace("{code}", driver.code)}
      className={cn(
        ROW_CLASS,
        // press(scale) 미사용 — 탭하면 상세 시트가 손가락 아래 깔려 :active 가 굳는다.
        "outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
      )}
    >
      {body}
    </button>
  );
};
