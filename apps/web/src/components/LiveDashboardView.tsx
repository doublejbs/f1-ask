"use client";

import { AmbientWashView } from "@/components/AmbientWashView";
import { ArchiveTabView } from "@/components/ArchiveTabView";
import { AskAiTabView } from "@/components/AskAiTabView";
import { NoLiveSessionView } from "@/components/NoLiveSessionView";
import { RaceTabView } from "@/components/RaceTabView";
import { SettingsSheetView } from "@/components/SettingsSheetView";
import { StatusBarView } from "@/components/StatusBarView";
import { TabBarView } from "@/components/TabBarView";
import { useDashboardTabState } from "@/hooks/UseDashboardTabState";
import { useExplanationLevel } from "@/hooks/UseExplanationLevel";
import { useFavoriteDrivers } from "@/hooks/UseFavoriteDrivers";
import { useFirebaseAuth } from "@/hooks/UseFirebaseAuth";
import { useLiveRace } from "@/hooks/UseLiveRace";
import { useRaceCommentary } from "@/hooks/UseRaceCommentary";
import { useRaceSummary } from "@/hooks/UseRaceSummary";
import { getDictionary } from "@/i18n/Messages";
import { DashboardTab } from "@/lib/DashboardTab";
import { LiveRaceStatus } from "@/lib/LiveRaceStatus";
import { cn } from "@/lib/Utils";
import { LiveDriverState, SupportedLocale } from "@f1/domain";
import { useMemo, useState } from "react";

type Props = {
  locale: SupportedLocale;
};

// 라이브 경기 대시보드 조립 컴포넌트.
// 모바일: 상태바 + 활성 탭(경기 / 기록 / AI) + 하단 탭바.
// 데스크톱(lg): 경기·AI 는 2컬럼[순위|AI]으로 함께 보이고, 기록은 전체 폭을 쓰는
// 별도 화면이라 탭 전환으로만 연다. 가운데 이벤트 피드 컬럼은 피드를 분해하며
// 사라졌다 (docs/14-event-placement.md).
// 비활성 탭은 언마운트하지 않고 display 로만 숨겨 AskAiView 대화 상태와
// 기록 탭의 목록·선택 상태를 보존한다.
export const LiveDashboardView = ({ locale }: Props) => {
  const dictionary = getDictionary(locale);
  const { status, race } = useLiveRace();
  const { level: explanationLevel, setLevel: setExplanationLevel } =
    useExplanationLevel();
  const commentary = useRaceCommentary(race, locale, explanationLevel);
  const summary = useRaceSummary(race, locale);
  // 로그인은 선택이다 — 인증 상태와 무관하게 아래 경기 데이터는 그대로 렌더링된다.
  const auth = useFirebaseAuth();
  const { favorites, isFavorite, toggleFavorite } = useFavoriteDrivers(
    auth.user?.uid ?? null,
  );
  const { activeTab, handleChangeTab, askPrefill, switchToAskWithQuestion } =
    useDashboardTabState();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Set 을 배열로 편 값. 소비자가 둘이고 둘 다 의존성으로 쓰므로 identity 를 고정한다 —
  // 매 렌더 새 배열을 만들면 "지금 볼 것" 칸이 프레임과 무관하게 재계산된다.
  const favoriteDriverNumbers = useMemo(() => Array.from(favorites), [favorites]);

  // 탭투애스크: 드라이버/이벤트를 탭하면 AI 탭으로 전환하며 질문을 자동 제출한다.
  const handleAskCode = (code: string) => {
    switchToAskWithQuestion(
      dictionary.askAi.driverTapQuestion.replace("{code}", code),
    );
  };

  const handleAskDriver = (driver: LiveDriverState) => handleAskCode(driver.code);

  const handleOpenArchive = () => handleChangeTab(DashboardTab.Archive);

  // 연결 중에만 로딩 문구를 보여 준다. 세션이 없는 상태는 아래에서 설명한다 —
  // 두 상태를 합치면 고장 난 것처럼 보인다 (docs/17-race-archive.md §배경).
  if (status === LiveRaceStatus.Connecting) {
    return (
      <main className="container flex min-h-[100dvh] items-center justify-center py-8">
        <p className="animate-pulse text-sm text-muted-foreground">
          {dictionary.noSession.connecting}
        </p>
      </main>
    );
  }

  const handleOpenSettings = () => setIsSettingsOpen(true);
  const handleCloseSettings = () => setIsSettingsOpen(false);

  // 경기·AI 탭 래퍼 클래스. 모바일에서는 활성 탭만, 데스크톱(lg)에서는 항상 표시한다.
  const getTabPanelClass = (tab: DashboardTab): string =>
    cn(activeTab === tab ? "block" : "hidden", "lg:block");

  const isArchiveActive = activeTab === DashboardTab.Archive;

  // 모바일 하단 패딩은 떠 있는 탭바(알약 약 64px + pb-safe 24px)에 여유를 더해 확보한다.
  return (
    <main className="container flex flex-col gap-4 pb-[7.5rem] lg:gap-5 lg:pb-8">
      {race === null ? null : <AmbientWashView snapshot={race.snapshot} />}

      {race === null ? null : (
        <StatusBarView
          dictionary={dictionary}
          snapshot={race.snapshot}
          freshness={race.freshness}
          onOpenSettings={handleOpenSettings}
        />
      )}

      {/* 기록은 전체 폭을 쓰므로 활성일 때 2컬럼 그리드를 통째로 접는다. */}
      {/* lg:grid 는 hidden 을 이기므로 두 상태를 한 분기에서 통째로 고른다. */}
      <div
        className={
          isArchiveActive
            ? "hidden"
            : "block lg:grid lg:grid-cols-2 lg:items-start lg:gap-5"
        }
      >
        <div className={getTabPanelClass(DashboardTab.Race)}>
          {race === null ? (
            <NoLiveSessionView
              dictionary={dictionary}
              onOpenArchive={handleOpenArchive}
            />
          ) : (
            <RaceTabView
              dictionary={dictionary}
              locale={locale}
              explanationLevel={explanationLevel}
              snapshot={race.snapshot}
              summary={summary}
              allEvents={race.allEvents}
              commentary={commentary}
              favoriteDriverNumbers={favoriteDriverNumbers}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
              onSelectDriver={handleAskDriver}
            />
          )}
        </div>

        <div className={getTabPanelClass(DashboardTab.Ask)}>
          {race === null ? (
            // 세션이 없으면 AI 가 근거로 쓸 경기 데이터도 없다.
            <p className="max-w-md py-12 text-sm leading-relaxed text-muted-foreground">
              {dictionary.noSession.askUnavailable}
            </p>
          ) : (
            <AskAiTabView
              dictionary={dictionary}
              locale={locale}
              explanationLevel={explanationLevel}
              snapshot={race.snapshot}
              events={race.allEvents}
              favoriteDriverNumbers={favoriteDriverNumbers}
              prefill={askPrefill}
            />
          )}
        </div>
      </div>

      <div className={isArchiveActive ? "block" : "hidden"}>
        <ArchiveTabView
          dictionary={dictionary}
          locale={locale}
          isActive={isArchiveActive}
        />
      </div>

      <TabBarView
        dictionary={dictionary}
        activeTab={activeTab}
        onChangeTab={handleChangeTab}
      />

      {race === null ? null : (
        <SettingsSheetView
          dictionary={dictionary}
          locale={locale}
          snapshot={race.snapshot}
          explanationLevel={explanationLevel}
          onChangeExplanationLevel={setExplanationLevel}
          auth={auth}
          isOpen={isSettingsOpen}
          onClose={handleCloseSettings}
        />
      )}
    </main>
  );
};
