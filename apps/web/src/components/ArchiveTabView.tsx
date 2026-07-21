"use client";

import { ArchiveRaceDetailView } from "@/components/ArchiveRaceDetailView";
import { ArchiveRaceListView } from "@/components/ArchiveRaceListView";
import { Button } from "@/components/ui/Button";
import { useArchiveRaceDetail } from "@/hooks/UseArchiveRaceDetail";
import { useArchiveRaces } from "@/hooks/UseArchiveRaces";
import { Dictionary } from "@/i18n/Messages";
import { SupportedLocale } from "@f1/domain";
import { useState } from "react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  // 탭이 활성일 때만 조회한다. 라이브 대시보드를 여는 것만으로 OpenF1 을
  // 때리지 않도록 지연 로딩한다.
  isActive: boolean;
};

type MessageProps = {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
};

const ArchiveMessage = ({ text, actionLabel, onAction }: MessageProps) => (
  <div className="flex flex-col items-start gap-3 py-8">
    <p className="text-sm text-muted-foreground">{text}</p>

    {actionLabel === undefined || onAction === undefined ? null : (
      <Button variant="outline" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </div>
);

// 「기록」 탭 — 목록 ⇄ 상세를 탭 안에서 전환한다 (docs/17-race-archive.md).
export const ArchiveTabView = ({ dictionary, locale, isActive }: Props) => {
  const [selectedSessionKey, setSelectedSessionKey] = useState<number | null>(
    null,
  );
  const list = useArchiveRaces(isActive);
  const detail = useArchiveRaceDetail(selectedSessionKey);

  const handleSelectRace = (sessionKey: number) => {
    setSelectedSessionKey(sessionKey);
  };

  const handleBack = () => {
    setSelectedSessionKey(null);
  };

  // 상세 화면. 목록 오류와 독립적으로 자기 로딩·오류 상태를 갖는다.
  if (selectedSessionKey !== null) {
    if (detail.detail !== null) {
      return (
        <ArchiveRaceDetailView
          dictionary={dictionary}
          locale={locale}
          detail={detail.detail}
          onBack={handleBack}
        />
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <Button variant="outline" onClick={handleBack} className="w-fit">
          {dictionary.archive.back}
        </Button>

        {detail.hasError ? (
          <ArchiveMessage
            text={dictionary.archive.detailError}
            actionLabel={dictionary.archive.retry}
            onAction={detail.retry}
          />
        ) : (
          <ArchiveMessage text={dictionary.archive.loading} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">
          {dictionary.archive.title}
        </h2>
        <p className="text-xs text-muted-foreground">
          {dictionary.archive.description}
        </p>
      </div>

      {list.hasError ? (
        <ArchiveMessage
          text={dictionary.archive.listError}
          actionLabel={dictionary.archive.retry}
          onAction={list.retry}
        />
      ) : list.isLoading ? (
        <ArchiveMessage text={dictionary.archive.loading} />
      ) : list.races.length === 0 ? (
        <ArchiveMessage text={dictionary.archive.empty} />
      ) : (
        <ArchiveRaceListView
          dictionary={dictionary}
          locale={locale}
          races={list.races}
          onSelectRace={handleSelectRace}
        />
      )}
    </div>
  );
};
