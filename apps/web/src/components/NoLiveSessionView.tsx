"use client";

import { Button } from "@/components/ui/Button";
import { Dictionary } from "@/i18n/Messages";
import { History } from "lucide-react";

type Props = {
  dictionary: Dictionary;
  onOpenArchive: () => void;
};

// 세션이 없을 때의 「경기」 탭 (docs/17-race-archive.md §화면).
// 예전에는 연결 중과 세션 없음을 구분하지 않고 문구 하나를 무한히 펄스시켜
// 고장 난 것처럼 보였다. 이제 상태를 설명하고 「기록」 탭으로 유도한다.
export const NoLiveSessionView = ({ dictionary, onOpenArchive }: Props) => (
  <div className="flex flex-col items-start gap-4 py-12">
    <History className="h-8 w-8 text-muted-foreground" aria-hidden />

    <div className="flex flex-col gap-2">
      <h2 className="text-2xl font-bold tracking-tight">
        {dictionary.noSession.title}
      </h2>

      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {dictionary.noSession.description}
      </p>
    </div>

    <Button onClick={onOpenArchive}>{dictionary.noSession.action}</Button>
  </div>
);
