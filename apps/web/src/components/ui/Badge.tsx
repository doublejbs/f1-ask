import { cn } from "@/lib/Utils";
import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";

const badgeVariants = cva(
  // 레퍼런스는 배지를 크게 쓰지 않는다. 작고 은은하게, 대비는 유지한다.
  "inline-flex items-center gap-1 rounded-full px-2 py-px text-[10px] font-semibold uppercase tracking-[0.06em] ring-1 ring-inset",
  {
    variants: {
      variant: {
        default: "bg-white/[0.06] text-foreground/90 ring-white/10",
        outline: "bg-transparent text-muted-foreground ring-white/12",
        live: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20",
        delayed: "bg-amber-500/10 text-amber-300 ring-amber-400/20",
        stale: "bg-red-500/10 text-red-300 ring-red-400/20",
        critical: "bg-red-500/12 text-red-300 ring-red-400/25",
        high: "bg-amber-500/10 text-amber-300 ring-amber-400/20",
        medium: "bg-sky-500/10 text-sky-300 ring-sky-400/20",
        low: "bg-white/[0.05] text-muted-foreground ring-white/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);
