"use client";

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
};

// 「지금」 탭: 기본 진입.
// Critical 배너 → (종료 시 요약) → 이벤트 피드 → 날씨 칩.
// 배틀은 인접 순위의 관계라 별도 위젯 대신 「순위」 탭 목록 인라인으로 표시한다.
export const NowTabView = ({
  dictionary,
  locale,
  snapshot,
  summary,
  primaryEvents,
  allEvents,
  onSelectEvent,
}: Props) => (
  <div className="flex flex-col gap-6">
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
