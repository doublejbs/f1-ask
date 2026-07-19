import { cn } from "@/lib/Utils";
import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        outline: "border border-border text-foreground",
        live: "bg-emerald-500/15 text-emerald-400",
        delayed: "bg-amber-500/15 text-amber-400",
        stale: "bg-red-500/15 text-red-400",
        critical: "bg-red-500/20 text-red-300",
        high: "bg-amber-500/15 text-amber-300",
        medium: "bg-sky-500/15 text-sky-300",
        low: "bg-slate-500/15 text-slate-300",
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
