"use client";

import { ArchiveEventTimelineView } from "@/components/ArchiveEventTimelineView";
import { ArchiveResultsView } from "@/components/ArchiveResultsView";
import { RaceSummaryView } from "@/components/RaceSummaryView";
import { Button } from "@/components/ui/Button";
import { Dictionary } from "@/i18n/Messages";
import { formatRaceDate } from "@/lib/Format";
import { ArchiveRaceDetail, SupportedLocale } from "@f1/domain";
import { ChevronLeft } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  locale: SupportedLocale;
  detail: ArchiveRaceDetail;
  onBack: () => void;
};

// 상세 — 최종 순위 + 경기 요약 + 주요 이벤트 타임라인.
// 별도 라우트가 아니라 「기록」 탭 안의 화면 전환이다. 앱이 단일 페이지 + 탭
// 구조라 라우트를 새로 파면 라이브 구독과 AI 대화 상태가 통째로 언마운트된다.
export const ArchiveRaceDetailView = ({
  dictionary,
  locale,
  detail,
  onBack,
}: Props) => {
  // 요약 뷰는 코드 조회에 드라이버 목록만 쓴다. 스냅샷 없이 순위 행으로 채운다.
  const summaryDrivers = detail.results.map((row) => ({
    driverNumber: row.driverNumber,
    code: row.driverCode,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Button variant="chip" onClick={onBack} className="w-fit pl-3.5">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {dictionary.archive.back}
        </Button>

        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">
            {detail.session.meetingName}
          </h2>

          <p className="text-xs text-muted-foreground">
            {detail.session.round > 0
              ? `${dictionary.archive.round.replace(
                  "{round}",
                  String(detail.session.round).padStart(2, "0"),
                )} · `
              : ""}
            {detail.session.circuitName} ·{" "}
            {formatRaceDate(detail.session.dateEnd, locale)}
          </p>
        </div>
      </div>

      {/* 경기 요약은 도메인이 계산한 사실만 쓴다 — 아카이브는 LLM 을 태우지 않는다. */}
      <RaceSummaryView
        dictionary={dictionary}
        data={detail.summary}
        narrative={null}
        drivers={summaryDrivers}
      />

      <ArchiveResultsView dictionary={dictionary} results={detail.results} />

      <ArchiveEventTimelineView
        dictionary={dictionary}
        locale={locale}
        events={detail.events}
      />
    </div>
  );
};
