import { Dictionary } from "@/i18n/Messages";
import { SUPPORTED_LOCALES, SupportedLocale } from "@f1/domain";
import Link from "next/link";
import { cn } from "@/lib/Utils";

type Props = {
  dictionary: Dictionary;
  currentLocale: SupportedLocale;
};

// 헤더 공간 절약을 위한 컴팩트 2글자 코드.
const LOCALE_SHORT: Record<SupportedLocale, string> = {
  [SupportedLocale.En]: "EN",
  [SupportedLocale.Ko]: "KO",
  [SupportedLocale.Ja]: "JA",
};

// locale 전환. 이벤트는 locale 에 따라 즉시 다시 번역된다.
export const LocaleSwitcherView = ({ dictionary, currentLocale }: Props) => (
  <nav
    className="flex shrink-0 items-center rounded-full border border-white/10 bg-black/20 p-0.5 backdrop-blur-md"
    aria-label="Language"
  >
    {SUPPORTED_LOCALES.map((locale) => (
      <Link
        key={locale}
        href={`/${locale}`}
        aria-current={locale === currentLocale ? "true" : undefined}
        aria-label={dictionary.localeName[locale]}
        className={cn(
          "press rounded-full px-3 py-1 text-[13px] font-bold tracking-wide transition-colors",
          locale === currentLocale
            ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {LOCALE_SHORT[locale]}
      </Link>
    ))}
  </nav>
);
