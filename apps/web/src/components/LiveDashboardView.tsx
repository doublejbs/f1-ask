"use client";

import { AiCommentaryView } from "@/components/AiCommentaryView";
import { AskAiView } from "@/components/AskAiView";
import { DriverTableView } from "@/components/DriverTableView";
import { EventFeedView } from "@/components/EventFeedView";
import { FavoriteDriversSectionView } from "@/components/FavoriteDriversSectionView";
import { RaceSummaryView } from "@/components/RaceSummaryView";
import { SessionHeaderView } from "@/components/SessionHeaderView";
import { WeatherView } from "@/components/WeatherView";
import { useExplanationLevel } from "@/hooks/UseExplanationLevel";
import { useFavoriteDrivers } from "@/hooks/UseFavoriteDrivers";
import { useLiveRace } from "@/hooks/UseLiveRace";
import { useRaceCommentary } from "@/hooks/UseRaceCommentary";
import { useRaceSummary } from "@/hooks/UseRaceSummary";
import { getDictionary } from "@/i18n/Messages";
import { getDataMode } from "@/lib/Env";
import {
  FavoriteDriverDetail,
  selectFavoriteDriverDetail,
  SupportedLocale,
} from "@f1/domain";
import { useMemo } from "react";

type Props = {
  locale: SupportedLocale;
};

// 라이브 경기 대시보드 조립 컴포넌트.
// 데이터 소스(Mock)와 표시(View)를 연결한다. 상태 계산은 하지 않는다.
export const LiveDashboardView = ({ locale }: Props) => {
  const dictionary = getDictionary(locale);
  const dataMode = getDataMode();
  const race = useLiveRace();
  const { level: explanationLevel, setLevel: setExplanationLevel } =
    useExplanationLevel();
  const commentary = useRaceCommentary(race, locale, explanationLevel);
  const summary = useRaceSummary(race, locale);
  const { favorites, isFavorite, toggleFavorite } = useFavoriteDrivers();

  const favoriteDetails = useMemo<FavoriteDriverDetail[]>(() => {
    if (race === null) {
      return [];
    }

    return Array.from(favorites)
      .map((driverNumber) =>
        selectFavoriteDriverDetail(race.snapshot, race.events, driverNumber),
      )
      .filter((detail): detail is FavoriteDriverDetail => detail !== null)
      .sort(
        (a, b) => (a.currentPosition ?? Infinity) - (b.currentPosition ?? Infinity),
      );
  }, [race, favorites]);

  if (race === null) {
    return (
      <main className="container flex min-h-screen items-center justify-center py-8">
        <p className="animate-pulse text-sm text-muted-foreground">
          {dictionary.tagline}…
        </p>
      </main>
    );
  }

  return (
    <main className="container flex flex-col gap-4 py-4 md:py-6">
      <SessionHeaderView
        dictionary={dictionary}
        locale={locale}
        snapshot={race.snapshot}
        dataMode={dataMode}
        freshness={race.freshness}
        explanationLevel={explanationLevel}
        onChangeExplanationLevel={setExplanationLevel}
      />

      {race.snapshot.weather !== undefined ? (
        <WeatherView dictionary={dictionary} weather={race.snapshot.weather} />
      ) : null}

      {summary !== null ? (
        <RaceSummaryView
          dictionary={dictionary}
          summary={summary}
          drivers={race.snapshot.drivers}
        />
      ) : null}

      <AskAiView
        dictionary={dictionary}
        locale={locale}
        explanationLevel={explanationLevel}
        snapshot={race.snapshot}
        events={race.events}
        favoriteDriverNumbers={Array.from(favorites)}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <DriverTableView
          dictionary={dictionary}
          drivers={race.snapshot.drivers}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
        />
        <div className="flex flex-col gap-4">
          <FavoriteDriversSectionView
            dictionary={dictionary}
            locale={locale}
            details={favoriteDetails}
            onRemove={toggleFavorite}
          />
          <AiCommentaryView dictionary={dictionary} commentary={commentary} />
          <EventFeedView
            dictionary={dictionary}
            locale={locale}
            events={race.events}
          />
        </div>
      </div>
    </main>
  );
};
