"use client";

import { AskAiTabView } from "@/components/AskAiTabView";
import { NowTabView } from "@/components/NowTabView";
import { SettingsSheetView } from "@/components/SettingsSheetView";
import { StandingsTabView } from "@/components/StandingsTabView";
import { StatusBarView } from "@/components/StatusBarView";
import { TabBarView } from "@/components/TabBarView";
import { useDashboardTabState } from "@/hooks/UseDashboardTabState";
import { useExplanationLevel } from "@/hooks/UseExplanationLevel";
import { useFavoriteDrivers } from "@/hooks/UseFavoriteDrivers";
import { useLiveRace } from "@/hooks/UseLiveRace";
import { useRaceCommentary } from "@/hooks/UseRaceCommentary";
import { useRaceSummary } from "@/hooks/UseRaceSummary";
import { getDictionary } from "@/i18n/Messages";
import { DashboardTab } from "@/lib/DashboardTab";
import { cn } from "@/lib/Utils";
import { LiveDriverState, RaceEvent, SupportedLocale } from "@f1/domain";
import { useState } from "react";

type Props = {
  locale: SupportedLocale;
};

// 라이브 경기 대시보드 조립 컴포넌트.
// 모바일: 상태바 + 활성 탭 + 하단 탭바. 데스크톱(lg): 탭바 없이 3컬럼[순위|지금|AI].
// 비활성 탭은 언마운트하지 않고 display 로만 숨겨 AskAiView 대화 상태를 보존한다.
export const LiveDashboardView = ({ locale }: Props) => {
  const dictionary = getDictionary(locale);
  const race = useLiveRace();
  const { level: explanationLevel, setLevel: setExplanationLevel } =
    useExplanationLevel();
  const commentary = useRaceCommentary(race, locale, explanationLevel);
  const summary = useRaceSummary(race, locale);
  const { favorites, isFavorite, toggleFavorite } = useFavoriteDrivers();
  const { activeTab, handleChangeTab, askPrefill, switchToAskWithQuestion } =
    useDashboardTabState();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 탭투애스크: 드라이버/이벤트를 탭하면 AI 탭으로 전환하며 질문을 자동 제출한다.
  const handleAskCode = (code: string) => {
    switchToAskWithQuestion(
      dictionary.askAi.driverTapQuestion.replace("{code}", code),
    );
  };

  const handleAskDriver = (driver: LiveDriverState) => handleAskCode(driver.code);

  const handleAskEvent = (event: RaceEvent) => {
    const code = event.params.driverCode;

    if (typeof code === "string" && code.length > 0) {
      handleAskCode(code);
    }
  };

  const handleAskBattle = (aheadCode: string, chasingCode: string) => {
    switchToAskWithQuestion(
      dictionary.battles.tapQuestion
        .replace("{ahead}", aheadCode)
        .replace("{chasing}", chasingCode),
    );
  };

  if (race === null) {
    return (
      <main className="container flex min-h-[100dvh] items-center justify-center py-8">
        <p className="animate-pulse text-sm text-muted-foreground">
          {dictionary.tagline}…
        </p>
      </main>
    );
  }

  const handleOpenSettings = () => setIsSettingsOpen(true);
  const handleCloseSettings = () => setIsSettingsOpen(false);

  // 각 탭 래퍼 클래스. 모바일에서는 활성 탭만, 데스크톱(lg)에서는 항상 표시한다.
  const getTabPanelClass = (tab: DashboardTab): string =>
    cn(activeTab === tab ? "block" : "hidden", "lg:block");

  return (
    <main className="container flex flex-col gap-4 pb-[6rem] lg:gap-5 lg:pb-8">
      <StatusBarView
        dictionary={dictionary}
        snapshot={race.snapshot}
        freshness={race.freshness}
        onOpenSettings={handleOpenSettings}
      />

      <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-5">
        <div className={getTabPanelClass(DashboardTab.Standings)}>
          <StandingsTabView
            dictionary={dictionary}
            snapshot={race.snapshot}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onSelectDriver={handleAskDriver}
          />
        </div>

        <div className={getTabPanelClass(DashboardTab.Now)}>
          <NowTabView
            dictionary={dictionary}
            locale={locale}
            snapshot={race.snapshot}
            summary={summary}
            primaryEvents={race.primaryEvents}
            allEvents={race.allEvents}
            onSelectEvent={handleAskEvent}
            onSelectBattle={handleAskBattle}
          />
        </div>

        <div className={getTabPanelClass(DashboardTab.Ask)}>
          <AskAiTabView
            dictionary={dictionary}
            locale={locale}
            explanationLevel={explanationLevel}
            snapshot={race.snapshot}
            events={race.allEvents}
            commentary={commentary}
            favoriteDriverNumbers={Array.from(favorites)}
            prefill={askPrefill}
          />
        </div>
      </div>

      <TabBarView
        dictionary={dictionary}
        activeTab={activeTab}
        onChangeTab={handleChangeTab}
      />

      <SettingsSheetView
        dictionary={dictionary}
        locale={locale}
        snapshot={race.snapshot}
        explanationLevel={explanationLevel}
        onChangeExplanationLevel={setExplanationLevel}
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
      />
    </main>
  );
};
