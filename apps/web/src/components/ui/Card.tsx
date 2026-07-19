import { cn } from "@/lib/Utils";
import { type HTMLAttributes } from "react";

// 플로팅 글래스 패널. 반투명 + 블러 + 상단 하이라이트 + 앰비언트 섀도로 깊이감을 준다.
export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "glass-panel animate-fade-up rounded-xl text-card-foreground",
      className,
    )}
    {...props}
  />
);

export const CardHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1 p-4 sm:p-5", className)} {...props} />
);

export const CardTitle = ({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={cn(
      "text-[13px] font-bold uppercase tracking-[0.1em] text-foreground/80",
      className,
    )}
    {...props}
  />
);

export const CardContent = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-4 pt-0 sm:p-5 sm:pt-0", className)} {...props} />
);
