"use client";

import { AmbientWashView } from "@/components/AmbientWashView";
import { ArchiveTabView } from "@/components/ArchiveTabView";
import { AskAiTabView } from "@/components/AskAiTabView";
import { NewsTabView } from "@/components/NewsTabView";
import { NextRaceView } from "@/components/NextRaceView";
import { OnboardingView } from "@/components/OnboardingView";
import { RaceTabView } from "@/components/RaceTabView";
import { SettingsSheetView } from "@/components/SettingsSheetView";
import { StatusBarView } from "@/components/StatusBarView";
import { TabBarView } from "@/components/TabBarView";
import { useDashboardTabState } from "@/hooks/UseDashboardTabState";
import { useExplanationLevel } from "@/hooks/UseExplanationLevel";
import { useFavoriteDrivers } from "@/hooks/UseFavoriteDrivers";
import { useFavoriteTeam } from "@/hooks/UseFavoriteTeam";
import { useRoster } from "@/hooks/UseRoster";
import { useFirebaseAuth } from "@/hooks/UseFirebaseAuth";
import { useLiveRace } from "@/hooks/UseLiveRace";
import { useNextRace } from "@/hooks/UseNextRace";
import { useRaceCommentary } from "@/hooks/UseRaceCommentary";
import { useRaceSummary } from "@/hooks/UseRaceSummary";
import { getDictionary } from "@/i18n/Messages";
import { DashboardTab } from "@/lib/DashboardTab";
import { LiveRaceStatus } from "@/lib/LiveRaceStatus";
import { cn } from "@/lib/Utils";
import {
  grandPrixTitle,
  LiveDriverState,
  SessionStatus,
  SupportedLocale,
} from "@f1/domain";
import { Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Props = {
  locale: SupportedLocale;
};

// 트랙에서 실제로 무언가 벌어지는 "활성" 세션 상태. 이때만 라이브 대시보드를 보여 주고,
// 그 외(종료·예정·알 수 없음·세션 없음)에는 다음 결승 홈으로 넘어간다(docs 계획 §Phase 2).
// 종료된 스냅샷도 Firestore 에 남으므로 race≠null 만으로는 "경기 중"을 판정할 수 없다.
const ACTIVE_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.Green,
  SessionStatus.Yellow,
  SessionStatus.SafetyCar,
  SessionStatus.VirtualSafetyCar,
];

// 라이브 경기 대시보드 조립 컴포넌트.
// 모바일: 상태바 + 활성 탭(경기 / 기록 / 뉴스) + 하단 탭바. AI 질문은 경기 탭 안에 있다.
// 데스크톱(lg): 경기·AI 는 2컬럼[순위|AI]으로 함께 보이고, 기록·뉴스는 전체 폭을 쓰는
// 별도 화면이라 탭 전환으로만 연다 (docs/28-news-tab.md §3번째 탭을 뉴스로).
// 비활성 탭은 언마운트하지 않고 display 로만 숨겨 AskAiView 대화 상태와
// 기록 탭의 목록·선택 상태를 보존한다.
export const LiveDashboardView = ({ locale }: Props) => {
  const dictionary = getDictionary(locale);
  const { status, race } = useLiveRace();
  // 활성 세션일 때만 라이브 데이터를 든다. 종료·예정 스냅샷은 null 로 접어 다음 결승 홈을 띄운다.
  const liveRace =
    race !== null && ACTIVE_SESSION_STATUSES.includes(race.snapshot.status)
      ? race
      : null;
  const { level: explanationLevel, setLevel: setExplanationLevel } =
    useExplanationLevel();
  const commentary = useRaceCommentary(race, locale, explanationLevel);
  const summary = useRaceSummary(race, locale);
  // 로그인은 선택이다 — 인증 상태와 무관하게 아래 경기 데이터는 그대로 렌더링된다.
  const auth = useFirebaseAuth();
  const { favorites, isFavorite, toggleFavorite } = useFavoriteDrivers(
    auth.user?.uid ?? null,
  );
  const {
    favoriteTeam,
    setFavoriteTeam,
    hasOnboarded,
    markOnboarded,
    isLoaded: isTeamLoaded,
  } = useFavoriteTeam();
  // 최초 진입(온보딩 미완료)일 때만 로스터를 가져와 오버레이를 띄운다.
  const showOnboarding = isTeamLoaded && !hasOnboarded;
  const roster = useRoster(showOnboarding);
  // 활성 세션이 없을 때(종료·예정·세션 없음) 다음 결승을 가져온다(무세션 홈).
  const nextRaceState = useNextRace(liveRace === null);
  const { activeTab, handleChangeTab, askPrefill, switchToAskWithQuestion } =
    useDashboardTabState();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // 모바일 AI 플로팅 패널 열림 상태. 데스크톱(lg)에서는 2컬럼으로 상시 노출되므로 무의미하다.
  const [isAskOpen, setIsAskOpen] = useState(false);

  // 탭투애스크(드라이버·이벤트 탭)로 질문이 자동 제출되면 모바일 패널을 함께 띄운다 —
  // 안 그러면 답이 닫힌 패널 뒤에서 조용히 쌓인다. 데스크톱에선 시각적 효과가 없다.
  useEffect(() => {
    if (askPrefill === undefined) {
      return;
    }

    setIsAskOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askPrefill?.nonce]);

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

  // 경기 탭을 벗어나면 모바일 AI 패널을 닫는다 — 안 그러면 기록·뉴스에서 돌아올 때
  // 패널이 스스로 다시 떠오른다(경기 그리드가 다시 표시되므로).
  const handleTabChange = (tab: DashboardTab) => {
    if (tab !== DashboardTab.Race) {
      setIsAskOpen(false);
    }

    handleChangeTab(tab);
  };

  const handleOpenArchive = () => handleTabChange(DashboardTab.Archive);

  // 온보딩 완료: 응원 팀 저장 + 고른 선수를 즐겨찾기(별)로 등록(기존 경로로 Firestore 동기화).
  const handleOnboardComplete = (teamName: string, driverNumber: number) => {
    setFavoriteTeam(teamName);

    if (!isFavorite(driverNumber)) {
      toggleFavorite(driverNumber);
    }

    markOnboarded();
  };

  // 온보딩은 race 데이터와 무관하다 — 연결 중 화면 위에도 동일하게 덮는다(fixed 오버레이).
  const onboardingOverlay = showOnboarding ? (
    <OnboardingView
      dictionary={dictionary}
      teams={roster.teams}
      isLoading={roster.isLoading}
      onComplete={handleOnboardComplete}
      onSkip={markOnboarded}
    />
  ) : null;

  // 연결 중에만 로딩 문구를 보여 준다. 세션이 없는 상태는 아래에서 설명한다 —
  // 두 상태를 합치면 고장 난 것처럼 보인다 (docs/17-race-archive.md §배경).
  if (status === LiveRaceStatus.Connecting) {
    return (
      <main className="container flex min-h-[100dvh] items-center justify-center py-8">
        {onboardingOverlay}
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
  const isNewsActive = activeTab === DashboardTab.News;

  // 기록·뉴스는 전체 폭을 쓰므로 활성일 때 경기·AI 2컬럼 그리드를 통째로 접는다.
  const isFullWidthTakeover = isArchiveActive || isNewsActive;

  // 모바일 하단 패딩은 떠 있는 탭바(알약 약 64px + pb-safe 24px)에 여유를 더해 확보한다.
  return (
    <main className="container flex flex-col gap-4 pb-[7.5rem] lg:gap-5 lg:pb-8">
      {onboardingOverlay}
      {liveRace === null ? null : (
        <AmbientWashView snapshot={liveRace.snapshot} />
      )}

      {/* 라이브 대문 — 무슨 그랑프리인지 상단에 크게 (docs 계획 §Phase 4). */}
      {liveRace === null ? null : (
        <h1 className="px-1 text-xl font-bold tracking-tight text-foreground lg:text-2xl">
          {grandPrixTitle(liveRace.snapshot.circuitName)}
        </h1>
      )}

      {liveRace === null ? null : (
        <StatusBarView
          dictionary={dictionary}
          snapshot={liveRace.snapshot}
          freshness={liveRace.freshness}
          onOpenSettings={handleOpenSettings}
        />
      )}

      {/* 기록·뉴스는 전체 폭이라 활성일 때 2컬럼 그리드를 통째로 접는다. */}
      {/* lg:grid 는 hidden 을 이기므로 두 상태를 한 분기에서 통째로 고른다. */}
      <div
        className={
          isFullWidthTakeover
            ? "hidden"
            : "block lg:grid lg:grid-cols-2 lg:items-start lg:gap-5"
        }
      >
        <div className={getTabPanelClass(DashboardTab.Race)}>
          {liveRace === null ? (
            <NextRaceView
              dictionary={dictionary}
              nextRace={nextRaceState.nextRace}
              isLoading={nextRaceState.isLoading}
              favoriteTeam={favoriteTeam}
              onOpenArchive={handleOpenArchive}
            />
          ) : (
            <RaceTabView
              dictionary={dictionary}
              locale={locale}
              explanationLevel={explanationLevel}
              snapshot={liveRace.snapshot}
              summary={summary}
              allEvents={liveRace.allEvents}
              commentary={commentary}
              favoriteDriverNumbers={favoriteDriverNumbers}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
              onSelectDriver={handleAskDriver}
            />
          )}
        </div>

        {/* AI 는 경기 탭에 귀속된다(docs/28). 데스크톱(lg)은 2번째 컬럼으로 상시 노출하고,
            모바일은 하단 플로팅 버튼으로 열고 닫는 시트로 띄운다. AskAiView 는 항상
            마운트 상태를 유지한다(translate/display 로만 숨김) — 대화 스레드가 보존된다. */}
        <div
          aria-label={dictionary.askAi.title}
          className={cn(
            // 모바일: 아래에서 떠오르는 플로팅 패널.
            "fixed inset-x-0 bottom-0 z-[70] max-h-[82dvh] overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-1 transition-transform duration-300 ease-out",
            isAskOpen
              ? "pointer-events-auto translate-y-0"
              : "pointer-events-none translate-y-[110%]",
            // 데스크톱: 정적 2번째 컬럼으로 되돌린다.
            "lg:pointer-events-auto lg:static lg:inset-auto lg:bottom-auto lg:z-auto lg:max-h-none lg:translate-y-0 lg:overflow-visible lg:px-0 lg:pb-0 lg:pt-0 lg:transition-none",
          )}
        >
          {/* 모바일 전용 닫기 핸들. 데스크톱 컬럼에선 숨긴다. */}
          <div className="mb-1 flex justify-end lg:hidden">
            <button
              type="button"
              onClick={() => setIsAskOpen(false)}
              aria-label={dictionary.askAi.closePanel}
              className="press rounded-full bg-white/[0.08] p-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {liveRace === null ? (
            // 활성 세션이 없으면 AI 가 근거로 쓸 경기 데이터도 없다.
            <p className="max-w-md py-12 text-sm leading-relaxed text-muted-foreground">
              {dictionary.noSession.askUnavailable}
            </p>
          ) : (
            <AskAiTabView
              dictionary={dictionary}
              locale={locale}
              explanationLevel={explanationLevel}
              snapshot={liveRace.snapshot}
              events={liveRace.allEvents}
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

      {/* 뉴스는 세션 유무와 무관하게 항상 볼 수 있다 (경기 전후 소식이 목적). */}
      <div className={isNewsActive ? "block" : "hidden"}>
        <NewsTabView dictionary={dictionary} locale={locale} />
      </div>

      {/* 모바일 AI 플로팅 버튼 — 경기 탭 + 활성 세션일 때만. 패널이 열려 있으면 숨긴다. */}
      {liveRace !== null && activeTab === DashboardTab.Race && !isAskOpen ? (
        <button
          type="button"
          onClick={() => setIsAskOpen(true)}
          aria-label={dictionary.askAi.openPanel}
          className="press fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40 lg:hidden"
        >
          <Sparkles className="h-6 w-6" aria-hidden />
        </button>
      ) : null}

      {/* 패널 뒤 배경 딤 — 탭하면 닫는다. 탭바(z-40) 위를 덮도록 더 높은 층이다. */}
      {isAskOpen && activeTab === DashboardTab.Race ? (
        <button
          type="button"
          onClick={() => setIsAskOpen(false)}
          aria-label={dictionary.askAi.closePanel}
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <TabBarView
        dictionary={dictionary}
        activeTab={activeTab}
        onChangeTab={handleTabChange}
      />

      {liveRace === null ? null : (
        <SettingsSheetView
          dictionary={dictionary}
          locale={locale}
          snapshot={liveRace.snapshot}
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
