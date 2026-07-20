"use client";

import { AskAiPrefill } from "@/components/AskAiView";
import { DashboardTab } from "@/lib/DashboardTab";
import { useCallback, useState } from "react";

export type DashboardTabController = {
  activeTab: DashboardTab;
  handleChangeTab: (tab: DashboardTab) => void;
  // AI 탭으로 전환하며 AskAiView 에 넘길 프리필 신호. nonce 변화로 자동 제출을 트리거한다.
  askPrefill: AskAiPrefill | undefined;
  switchToAskWithQuestion: (text: string) => void;
};

// 하단 탭 상태 + 탭투애스크 전환. 탭 전환은 CSS(display) 로만 처리하므로
// 여기서는 활성 탭 값과 프리필 신호만 관리한다(컴포넌트 언마운트 없음).
export const useDashboardTabState = (): DashboardTabController => {
  const [activeTab, setActiveTab] = useState<DashboardTab>(DashboardTab.Now);
  const [askPrefill, setAskPrefill] = useState<AskAiPrefill | undefined>();

  const handleChangeTab = useCallback((tab: DashboardTab) => {
    setActiveTab(tab);
  }, []);

  // 순위 시트·이벤트 피드의 탭투애스크가 경유하는 진입점.
  // AI 탭으로 전환하며 nonce 를 증가시켜 AskAiView 자동 제출을 유발한다.
  const switchToAskWithQuestion = useCallback((text: string) => {
    setActiveTab(DashboardTab.Ask);
    setAskPrefill((prev) => ({
      text,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }, []);

  return { activeTab, handleChangeTab, askPrefill, switchToAskWithQuestion };
};
