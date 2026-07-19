import { cn } from "@/lib/Utils";
import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset",
  {
    variants: {
      variant: {
        default: "bg-white/8 text-foreground ring-white/10",
        outline: "bg-transparent text-muted-foreground ring-white/15",
        live: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/25",
        delayed: "bg-amber-500/15 text-amber-300 ring-amber-400/25",
        stale: "bg-red-500/15 text-red-300 ring-red-400/25",
        critical: "bg-red-500/20 text-red-200 ring-red-400/30",
        high: "bg-amber-500/15 text-amber-200 ring-amber-400/25",
        medium: "bg-sky-500/15 text-sky-200 ring-sky-400/25",
        low: "bg-slate-500/15 text-slate-300 ring-slate-400/20",
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
