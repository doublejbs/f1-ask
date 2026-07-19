import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn/ui 표준 className 병합 유틸.
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
