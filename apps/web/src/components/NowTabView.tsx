"use client";

import { BattlesView } from "@/components/BattlesView";
import { CriticalBannerView } from "@/components/CriticalBannerView";
import { EventFeedView } from "@/components/EventFeedView";
import { RaceSummaryView } from "@/components/RaceSummaryView";
import { WeatherChipView } from "@/components/WeatherChipView";
import { Dictionary } from "@/i18n/Messages";
import { LiveRaceSnapshot, RaceEvent, SupportedLocale } from "@f1/domain";
import { RaceSummaryResponse } from "@f1/schemas";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  snapshot: LiveRaceSnapshot;
  summary: RaceSummaryResponse | null;
  primaryEvents: RaceEvent[];
  allEvents: RaceEvent[];
  onSelectEvent: (event: RaceEvent) => void;
  onSelectBattle: (aheadCode: string, chasingCode: string) => void;
};

// 「지금」 탭: 기본 진입.
// Critical 배너 → (종료 시 요약) → 배틀 위젯 → 이벤트 피드 → 날씨 칩.
export const NowTabView = ({
  dictionary,
  locale,
  snapshot,
  summary,
  primaryEvents,
  allEvents,
  onSelectEvent,
  onSelectBattle,
}: Props) => (
  <div className="flex flex-col gap-4">
    <CriticalBannerView
      dictionary={dictionary}
      locale={locale}
      allEvents={allEvents}
      onSelectEvent={onSelectEvent}
    />

    {summary !== null ? (
      <RaceSummaryView
        dictionary={dictionary}
        summary={summary}
        drivers={snapshot.drivers}
      />
    ) : null}

    <BattlesView
      dictionary={dictionary}
      snapshot={snapshot}
      onSelectBattle={onSelectBattle}
    />

    <EventFeedView
      dictionary={dictionary}
      locale={locale}
      primaryEvents={primaryEvents}
      allEvents={allEvents}
      onSelectEvent={onSelectEvent}
    />

    {snapshot.weather !== undefined ? (
      <WeatherChipView dictionary={dictionary} weather={snapshot.weather} />
    ) : null}
  </div>
);
