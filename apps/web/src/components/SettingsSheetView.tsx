"use client";

import { AccountSectionView } from "@/components/AccountSectionView";
import { BottomSheetView } from "@/components/BottomSheetView";
import { ExplanationLevelSwitcherView } from "@/components/ExplanationLevelSwitcherView";
import { LocaleSwitcherView } from "@/components/LocaleSwitcherView";
import { type FirebaseAuthController } from "@/hooks/UseFirebaseAuth";
import { Dictionary } from "@/i18n/Messages";
import { cn } from "@/lib/Utils";
import { ExplanationLevel, LiveRaceSnapshot, SupportedLocale } from "@f1/domain";
import type { ReactNode } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  // 활성 세션이 없으면 null — 세션·서킷 행을 감춘다(무세션 홈에서도 설정을 연다).
  snapshot: LiveRaceSnapshot | null;
  explanationLevel: ExplanationLevel;
  onChangeExplanationLevel: (level: ExplanationLevel) => void;
  // 응원 팀(없으면 null) + 변경(온보딩 재실행).
  favoriteTeam: string | null;
  onChangeTeam: () => void;
  auth: FirebaseAuthController;
  isOpen: boolean;
  onClose: () => void;
};

type RowProps = {
  label: string;
  // 마지막 행은 헤어라인 구분선을 생략한다.
  isLast?: boolean;
  children: ReactNode;
};

// 설정 행. 카드 없이 헤어라인 구분선만으로 나눈다(마지막 행에는 붙이지 않는다).
const Row = ({ label, isLast = false, children }: RowProps) => (
  <div
    className={cn(
      "flex min-h-[3rem] items-center justify-between gap-4 py-2.5",
      isLast ? "" : "hairline",
    )}
  >
    <span className="text-[13px] font-semibold text-muted-foreground">
      {label}
    </span>
    {children}
  </div>
);

// 설정 바텀 시트. 로케일·설명수준 스위처와 세션 상세를 담는다.
// 오버레이·닫기·스크롤 잠금·포커스는 공유 BottomSheetView 가 담당한다.
export const SettingsSheetView = ({
  dictionary,
  locale,
  snapshot,
  explanationLevel,
  onChangeExplanationLevel,
  favoriteTeam,
  onChangeTeam,
  auth,
  isOpen,
  onClose,
}: Props) => (
  <BottomSheetView
    isOpen={isOpen}
    onClose={onClose}
    titleId="settings-sheet-title"
    closeLabel={dictionary.settings.close}
  >
    <div className="mb-1 pr-11">
      <h2
        id="settings-sheet-title"
        className="text-[13px] font-bold uppercase tracking-[0.1em] text-foreground/80"
      >
        {dictionary.settings.title}
      </h2>
    </div>

    <div className="flex flex-col">
      <AccountSectionView dictionary={dictionary} auth={auth} />

      <Row label={dictionary.localeName[locale]}>
        <LocaleSwitcherView dictionary={dictionary} currentLocale={locale} />
      </Row>

      <Row label={dictionary.explanationLevel.label}>
        <ExplanationLevelSwitcherView
          dictionary={dictionary}
          level={explanationLevel}
          onChangeLevel={onChangeExplanationLevel}
        />
      </Row>

      {/* 응원 팀 — 온보딩을 다시 열어 팀·선수를 바꾼다. */}
      <Row label={dictionary.settings.favoriteTeam} isLast={snapshot === null}>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">
            {favoriteTeam ?? dictionary.settings.noTeam}
          </span>
          <button
            type="button"
            onClick={onChangeTeam}
            className="press rounded-full bg-white/[0.08] px-2.5 py-1 text-[12px] font-semibold text-foreground hover:bg-white/[0.14]"
          >
            {dictionary.settings.changeTeam}
          </button>
        </div>
      </Row>

      {snapshot !== null ? (
        <Row label={dictionary.header.session}>
          <span className="truncate text-sm font-semibold">
            {snapshot.sessionName}
          </span>
        </Row>
      ) : null}

      {snapshot !== null ? (
        <Row label={dictionary.settings.circuit} isLast>
          <span className="truncate text-sm font-semibold">
            {snapshot.circuitName} · {snapshot.countryCode}
          </span>
        </Row>
      ) : null}
    </div>
  </BottomSheetView>
);
