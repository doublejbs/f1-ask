import { cn } from "@/lib/Utils";
import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "press inline-flex select-none items-center justify-center gap-1.5 rounded-full text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_6px_20px_-8px_hsl(var(--primary)/0.8),inset_0_1px_0_0_hsl(0_0%_100%/0.25)] hover:brightness-110",
        outline:
          "border border-white/12 bg-white/5 text-foreground backdrop-blur-md hover:bg-white/10",
        ghost: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
      },
      size: {
        // HIG: 최소 44pt 터치 타깃 (모바일). 데스크톱에서는 살짝 컴팩트.
        default: "h-11 px-5 sm:h-9 sm:px-4",
        sm: "h-9 px-3.5 sm:h-8 sm:px-3 text-[13px]",
        icon: "h-11 w-11 sm:h-9 sm:w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = ({ className, variant, size, ...props }: ButtonProps) => (
  <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
);
