"use client";

import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import {
  DriverStateMarker,
  DriverStateMarkerKind,
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
};

// 슬롯 고정 폭. **항상 렌더**되므로 마커가 있든 없든 행 레이아웃이 동일하다.
// 36px 은 가장 긴 칩(`+15s`)이 들어가는 최소 폭이다.
// (docs/14-event-placement.md "행 밀도 — 가장 큰 리스크")
const SLOT_CLASS = "flex h-5 w-9 shrink-0 items-center justify-center";

const ICON_CLASS = "h-4 w-4";

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

// 순위 행의 마커 슬롯 (docs/14-event-placement.md "행 밀도").
//
// 지속 마커와 순간 아이콘이 **같은 슬롯 하나**를 공유한다. 둘 다 있으면 지속 마커가
// 이긴다 — 페널티가 추월보다 중요하다. 슬롯은 비어 있을 때도 렌더되어 폭을 유지한다.
export const DriverRowMarkerView = ({
  dictionary,
  marker,
  recentEvent,
}: Props) => {
  if (marker !== null && marker.kind === DriverStateMarkerKind.Penalty) {
    const chip = buildPenaltyChip(dictionary, marker);

    return (
      <span className={SLOT_CLASS}>
        <span
          title={chip.description}
          aria-label={chip.description}
          className="rounded-full border border-red-500/40 bg-red-500/20 px-1 text-[10px] font-bold leading-4 tabular-nums text-red-200"
        >
          {chip.text}
        </span>
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
    </span>
  );
};
