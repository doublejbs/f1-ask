"use client";

import { AiCommentaryView } from "@/components/AiCommentaryView";
import { AskAiView, type AskAiPrefill } from "@/components/AskAiView";
import { DriverTableView } from "@/components/DriverTableView";
import { EventFeedView } from "@/components/EventFeedView";
import { FavoriteDriversSectionView } from "@/components/FavoriteDriversSectionView";
import { RaceSummaryView } from "@/components/RaceSummaryView";
import { SessionHeaderView } from "@/components/SessionHeaderView";
import { TeamRadioView } from "@/components/TeamRadioView";
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
  LiveDriverState,
  RaceEvent,
  selectFavoriteDriverDetail,
  SupportedLocale,
} from "@f1/domain";
import { useMemo, useState } from "react";

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
  const [askPrefill, setAskPrefill] = useState<AskAiPrefill | undefined>();

  // 탭투애스크: 드라이버 행을 탭하면 해당 드라이버 질문을 Ask AI 로 자동 제출한다.
  const askAboutCode = (code: string) => {
    setAskPrefill((prev) => ({
      text: dictionary.askAi.driverTapQuestion.replace("{code}", code),
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  };

  const askAboutDriver = (driver: LiveDriverState) => askAboutCode(driver.code);

  // 이벤트 탭: 연관 드라이버 코드로 질문을 자동 제출한다.
  const askAboutEvent = (event: RaceEvent) => {
    const code = event.params.driverCode;

    if (typeof code === "string" && code.length > 0) {
      askAboutCode(code);
    }
  };

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
        prefill={askPrefill}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <DriverTableView
          dictionary={dictionary}
          drivers={race.snapshot.drivers}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
          onSelectDriver={askAboutDriver}
        />
        <div className="flex flex-col gap-4">
          <FavoriteDriversSectionView
            dictionary={dictionary}
            locale={locale}
            details={favoriteDetails}
            onRemove={toggleFavorite}
          />
          <AiCommentaryView dictionary={dictionary} commentary={commentary} />
          {race.snapshot.teamRadios !== undefined &&
          race.snapshot.teamRadios.length > 0 ? (
            <TeamRadioView
              dictionary={dictionary}
              clips={race.snapshot.teamRadios}
              drivers={race.snapshot.drivers}
            />
          ) : null}
          <EventFeedView
            dictionary={dictionary}
            locale={locale}
            events={race.events}
            onSelectEvent={askAboutEvent}
          />
        </div>
      </div>
    </main>
  );
};
