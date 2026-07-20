import { CardVariant } from "@/components/ui/CardVariant";
import { cn } from "@/lib/Utils";
import { type HTMLAttributes } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
};

// glass: 반투명 + 블러 + 상단 하이라이트로 떠 있는 표면. plain: 배경·보더·섀도 없이 패딩만.
export const Card = ({
  className,
  variant = CardVariant.Glass,
  ...props
}: CardProps) => (
  <div
    className={cn(
      "animate-fade-up text-card-foreground",
      variant === CardVariant.Glass && "glass-panel rounded-xl",
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
