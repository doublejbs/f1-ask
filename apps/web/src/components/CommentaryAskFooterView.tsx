"use client";

import { Button } from "@/components/ui/Button";
import { Dictionary } from "@/i18n/Messages";
import { type FormEvent } from "react";

type Props = {
  dictionary: Dictionary;
  value: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

// 상세 시트 하단 고정 질문 입력. 답변 스레드는 본문에 누적되고, 입력은 스크롤 밖에
// 항상 닿게 둔다(드라이버 시트의 "AI에게 질문" footer 와 같은 자리).
export const CommentaryAskFooterView = ({
  dictionary,
  value,
  isLoading,
  onChange,
  onSubmit,
}: Props) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={dictionary.commentarySheet.placeholder}
        aria-label={dictionary.commentarySheet.placeholder}
        className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Button type="submit" disabled={isLoading || value.trim() === ""}>
        {isLoading ? dictionary.askAi.thinking : dictionary.commentarySheet.ask}
      </Button>
    </form>
  );
};
