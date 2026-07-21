"use client";

import { Dictionary } from "@/i18n/Messages";
import { DashboardTab } from "@/lib/DashboardTab";
import { cn } from "@/lib/Utils";
import { Flag, History, type LucideIcon, Sparkles } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  activeTab: DashboardTab;
  onChangeTab: (tab: DashboardTab) => void;
};

type TabConfig = {
  tab: DashboardTab;
  labelKey: keyof Dictionary["tabs"];
  Icon: LucideIcon;
};

const TAB_CONFIGS: TabConfig[] = [
  { tab: DashboardTab.Race, labelKey: "race", Icon: Flag },
  { tab: DashboardTab.Archive, labelKey: "archive", Icon: History },
  { tab: DashboardTab.Ask, labelKey: "ask", Icon: Sparkles },
];

// 하단 탭바. 경기 / 기록 / AI 3버튼.
// 데스크톱에서도 노출한다 — 「기록」은 2컬럼 레이아웃에 들어가지 않는 전체 폭
// 화면이라, 탭바를 숨기면 데스크톱에서 도달할 방법이 사라진다.
// 바닥에 붙지 않고 좌우 여백을 둔 떠 있는 알약이다 — 콘텐츠가 그 아래로 흘러 비친다.
// 활성 탭은 더 밝은 알약 칩으로 구분한다. 44pt 이상 터치 타깃 + pb-safe.
export const TabBarView = ({ dictionary, activeTab, onChangeTab }: Props) => (
  <nav
    className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-safe"
    aria-label={dictionary.appName}
  >
    <div className="glass-float pointer-events-auto mx-auto flex max-w-md items-stretch gap-1 rounded-full p-1.5">
      {TAB_CONFIGS.map(({ tab, labelKey, Icon }) => {
        const isActive = tab === activeTab;

        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChangeTab(tab)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "press flex min-h-[2.875rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors",
              isActive
                ? "bg-white/[0.16] text-foreground shadow-[inset_0_1px_0_0_hsla(0,0%,100%,0.16)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span>{dictionary.tabs[labelKey]}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
