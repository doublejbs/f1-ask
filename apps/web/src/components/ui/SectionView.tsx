import { cn } from "@/lib/Utils";
import { type HTMLAttributes, type ReactNode } from "react";

type Props = HTMLAttributes<HTMLElement> & {
  title: string;
  // 제목 우측 슬롯. 필터 토글 등 섹션 단위 액션을 넣는다.
  action?: ReactNode;
};

// 카드 없는 목록 섹션. 작은 대문자 트래킹 제목 + 우측 액션 슬롯 + children.
export const SectionView = ({
  title,
  action,
  className,
  children,
  ...props
}: Props) => (
  <section className={cn("animate-fade-up flex flex-col gap-2", className)} {...props}>
    <header className="flex min-h-[1.75rem] items-center justify-between gap-3 px-1">
      <h2 className="text-label font-bold uppercase text-muted-foreground">
        {title}
      </h2>

      {action}
    </header>

    {children}
  </section>
);
