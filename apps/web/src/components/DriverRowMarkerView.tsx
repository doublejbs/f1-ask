"use client";

import { Dictionary } from "@/i18n/Messages";
import {
  translateWatchNowSignal,
  translateWatchNowSignalType,
} from "@/i18n/TranslateWatchNowSignal";
import { cn } from "@/lib/Utils";
import {
  DriverStateMarker,
  DriverStateMarkerKind,
  LaneWatchNowSignal,
  RaceEvent,
  RaceEventType,
} from "@f1/domain";
import {
  ChevronsUp,
  ClipboardList,
  Flag,
  Ruler,
  Timer,
  Wrench,
} from "lucide-react";

type Props = {
  dictionary: Dictionary;
  // 이 드라이버의 지속 마커. 도메인이 페널티를 먼저, 조사를 나중에 담아 주므로
  // 슬롯이 하나인 여기서는 첫 번째만 쓴다(페널티가 조사보다 중요하다).
  marker: DriverStateMarker | null;
  // 경기 시계 기준 창 안의 최신 순간 이벤트. 없으면 null.
  recentEvent: RaceEvent | null;
  // 이 드라이버의 "지금 볼 것" 신호 중 **칸에 올라가지 못한 것들**(docs/19 수용 기준 7).
  // 칸에 이미 뜬 신호는 도메인이 overflow 에서 제외하므로 여기 들어오지 않는다 —
  // 같은 신호를 칸과 행에 두 번 보여주지 않는다.
  watchNowSignals: LaneWatchNowSignal[];
};

// 슬롯 고정 폭. **항상 렌더**되므로 마커가 있든 없든 행 레이아웃이 동일하다.
// 36px 은 가장 긴 칩(`+15s`)이 들어가는 최소 폭이다.
// (docs/14-event-placement.md "행 밀도 — 가장 큰 리스크")
//
// `relative` 는 아래 "지금 볼 것" 점의 기준이다. 점은 absolute 라 이 슬롯의 36×20 을
// 한 톨도 쓰지 않는다 — 고정 열 폭 계산(DriverListView 의 152px 역산)이 그대로 유효하다.
const SLOT_CLASS =
  "relative flex h-5 w-9 shrink-0 items-center justify-center";

const ICON_CLASS = "h-4 w-4";

// 여러 신호를 한 문장으로 잇는 구분자. 화면에 나가지 않고 title/aria-label 안에만 있다.
const WATCH_NOW_SIGNAL_SEPARATOR = " · ";

// 페널티 초 표기. 정수면 소수점을 붙이지 않는다(칩 폭이 좁다).
const formatPenaltySeconds = (seconds: number): string =>
  Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);

// 순간 이벤트 아이콘. 슬롯을 차지하지 않는 타입은 null 을 돌려준다.
//
// 색만으로 의미를 전달하지 않도록 호출부가 title/aria-label 을 함께 붙인다.
const renderInstantIcon = (
  dictionary: Dictionary,
  type: RaceEventType,
): { icon: React.ReactNode; label: string } | null => {
  switch (type) {
    case RaceEventType.PitStop:
      return {
        icon: <Wrench className={cn(ICON_CLASS, "text-sky-300")} />,
        label: dictionary.rowMarker.pitStop,
      };
    case RaceEventType.FastestLap:
      return {
        icon: <Timer className={cn(ICON_CLASS, "text-purple-300")} />,
        label: dictionary.rowMarker.fastestLap,
      };
    case RaceEventType.PersonalBestLap:
      return {
        icon: <Timer className={cn(ICON_CLASS, "text-emerald-300")} />,
        label: dictionary.rowMarker.personalBestLap,
      };
    case RaceEventType.Overtake:
      return {
        icon: <ChevronsUp className={cn(ICON_CLASS, "text-emerald-300")} />,
        label: dictionary.rowMarker.overtake,
      };
    case RaceEventType.TrackLimits:
      return {
        icon: <Ruler className={cn(ICON_CLASS, "text-amber-300")} />,
        label: dictionary.rowMarker.trackLimits,
      };
    case RaceEventType.StrategyNote:
      return {
        icon: <ClipboardList className={cn(ICON_CLASS, "text-slate-300")} />,
        label: dictionary.rowMarker.strategyNote,
      };
    case RaceEventType.BlueFlag:
      return {
        icon: <Flag className={cn(ICON_CLASS, "text-sky-400")} />,
        label: dictionary.rowMarker.blueFlag,
      };
    default:
      return null;
  }
};

// 페널티 칩의 표시 글자와 접근성 문구.
//
// 누적 표시 판단: **칩에는 합산 초만** 보이고 건수는 title/aria-label 로 넘긴다.
// 행에서 가장 부족한 자원이 가로 폭이라 `+10s×2` 같은 표기는 팀명을 잠식한다.
// 그리고 실제로 알아야 할 값은 합산 초다 — F1 에서 5초 페널티 두 건은 완주 시간에
// 10초로 더해지고, "몇 건인가"는 그 숫자를 설명하는 부가 정보다.
const buildPenaltyChip = (
  dictionary: Dictionary,
  marker: DriverStateMarker,
): { text: string; description: string } => {
  if (marker.penaltySeconds === null) {
    return {
      text: "PEN",
      description: dictionary.rowMarker.penaltyUnknown,
    };
  }

  const seconds = formatPenaltySeconds(marker.penaltySeconds);
  const description =
    marker.penaltyCount > 1
      ? dictionary.rowMarker.penaltyMultiple
          .replace("{count}", String(marker.penaltyCount))
          .replace("{seconds}", seconds)
      : dictionary.rowMarker.penalty.replace("{seconds}", seconds);

  return { text: `+${seconds}s`, description };
};

// "지금 볼 것" 행 표시의 접근성 문구.
//
// **한 드라이버에 신호가 여러 건이면 점은 그대로 하나다.** 점을 늘리면 좁은 슬롯에서
// 개수를 세게 만들 뿐이고, 애초에 이 표시의 뜻은 "여기도 뭔가 있다" 이지 "몇 건 있다"가
// 아니다. 대신 문구에는 전부 싣는다 — 점이 하나여도 정보는 잃지 않는다. 순서는 도메인이
// 이미 정렬해 준 순서(걸린 포인트 → 최신)를 그대로 따른다.
const buildWatchNowDescription = (
  dictionary: Dictionary,
  signals: LaneWatchNowSignal[],
): string =>
  dictionary.rowMarker.watchNow.replace(
    "{signals}",
    signals
      .map(
        (entry) =>
          `${translateWatchNowSignalType(entry.signal.type, dictionary)}: ${translateWatchNowSignal(entry, dictionary)}`,
      )
      .join(WATCH_NOW_SIGNAL_SEPARATOR),
  );

// 칸에 못 올라간 신호가 있다는 **조용한** 점.
//
// 왜 이 형태인가(docs/19 §화면 "나머지 감지 결과는 순위표 행에 조용히 표시한다"):
//   - 칸은 "지금 볼 것", 행 표시는 "보고 싶으면 봐라" 다. 시각적 무게가 칸보다 확실히
//     가벼워야 하므로 글자 · 아이콘이 아니라 6px 점 하나다.
//   - `absolute` 라 슬롯의 36×20 을 쓰지 않는다. **행 높이(h-14 고정)와 고정 열 폭이
//     둘 다 그대로다** — 순위표가 이 표시 때문에 한 픽셀도 밀리지 않는다.
//   - 칩(rounded-full)의 모서리 바깥 여백에 앉으므로 페널티 칩이 슬롯을 거의 다 채우는
//     최악 케이스에서도 글자를 가리지 않는다.
//   - `ring-background` 로 아래 내용과 분리해 아이콘 위에 겹쳐도 점으로 읽힌다.
//
// 색은 muted-foreground 다. 팀색 · 페널티 빨강 · 조사 앰버 · 배틀 앰버 어느 것과도
// 겹치지 않으면서 이 팔레트에서 가장 조용한 값이라, 훑을 때는 안 보이고 찾으면 보인다.
const WatchNowDotView = ({
  dictionary,
  signals,
}: {
  dictionary: Dictionary;
  signals: LaneWatchNowSignal[];
}) => {
  if (signals.length === 0) {
    return null;
  }

  const description = buildWatchNowDescription(dictionary, signals);

  return (
    <span
      title={description}
      aria-label={description}
      role="img"
      // pointer-events 를 죽이지 않는다 — 죽이면 `title` 툴팁이 뜨지 않아 점이
      // 뜻을 전달할 유일한 경로가 막힌다. 행 클릭은 그대로 상위로 버블링되므로
      // 상세 시트를 여는 동작과 충돌하지 않는다(페널티 칩도 같은 방식이다).
      className="absolute -top-0.5 right-0 h-1.5 w-1.5 rounded-full bg-muted-foreground/70 ring-2 ring-background"
    />
  );
};

// 순위 행의 마커 슬롯 (docs/14-event-placement.md "행 밀도").
//
// 지속 마커와 순간 아이콘이 **같은 슬롯 하나**를 공유한다. 둘 다 있으면 지속 마커가
// 이긴다 — 페널티가 추월보다 중요하다. 슬롯은 비어 있을 때도 렌더되어 폭을 유지한다.
//
// "지금 볼 것" 점은 그 경쟁에 끼지 않는다. 슬롯 위에 얹히는 별도 층이라 **어떤 마커가
// 이기든 항상 함께 보인다.** 슬롯 하나를 두고 겨루게 했다면 페널티 · 피트인 · 개인 최고
// 랩처럼 흔한 마커가 있는 행에서 신호가 조용히 사라졌을 것이고, 그러면 "칸에서 밀린 것도
// 볼 수 있다"는 약속이 다시 거짓이 된다.
export const DriverRowMarkerView = ({
  dictionary,
  marker,
  recentEvent,
  watchNowSignals,
}: Props) => {
  const watchNowDot = (
    <WatchNowDotView dictionary={dictionary} signals={watchNowSignals} />
  );

  if (marker !== null && marker.kind === DriverStateMarkerKind.Penalty) {
    const chip = buildPenaltyChip(dictionary, marker);

    return (
      <span className={SLOT_CLASS}>
        <span
          title={chip.description}
          aria-label={chip.description}
          // px-1 → px-0.5. 슬롯이 36px 인데 "+15s" 는 px-1 에서 36.3px 이라 0.3px
          // 넘쳤다(칩에 truncate 가 없어 조용히 삐져나온다). 패딩만 줄이면 "+15s" 32.3,
          // 방어적으로 처리하는 소수 페널티 "+2.5s" 도 35.9 라 슬롯 안에 들어온다.
          className="rounded-full border border-red-500/40 bg-red-500/20 px-0.5 text-[10px] font-bold leading-4 tabular-nums text-red-200"
        >
          {chip.text}
        </span>

        {watchNowDot}
      </span>
    );
  }

  if (marker !== null && marker.kind === DriverStateMarkerKind.Investigation) {
    return (
      <span className={SLOT_CLASS}>
        <span
          title={dictionary.rowMarker.investigation}
          aria-label={dictionary.rowMarker.investigation}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/20 text-[11px] font-bold leading-none text-amber-200"
        >
          ?
        </span>

        {watchNowDot}
      </span>
    );
  }

  const instant =
    recentEvent === null
      ? null
      : renderInstantIcon(dictionary, recentEvent.type);

  return (
    <span className={SLOT_CLASS}>
      {instant !== null ? (
        <span
          title={instant.label}
          aria-label={instant.label}
          role="img"
          className="flex items-center justify-center"
        >
          {instant.icon}
        </span>
      ) : null}

      {watchNowDot}
    </span>
  );
};
