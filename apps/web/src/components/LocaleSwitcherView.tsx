import { Dictionary } from "@/i18n/Messages";
import { SUPPORTED_LOCALES, SupportedLocale } from "@f1/domain";
import Link from "next/link";
import { cn } from "@/lib/Utils";

type Props = {
  dictionary: Dictionary;
  currentLocale: SupportedLocale;
};

// locale 전환. 이벤트는 locale 에 따라 즉시 다시 번역된다.
export const LocaleSwitcherView = ({ dictionary, currentLocale }: Props) => (
  <nav className="flex items-center gap-1" aria-label="Language">
    {SUPPORTED_LOCALES.map((locale) => (
      <Link
        key={locale}
        href={`/${locale}`}
        className={cn(
          "rounded-md px-2 py-1 text-xs font-medium transition-colors",
          locale === currentLocale
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        {dictionary.localeName[locale]}
      </Link>
    ))}
  </nav>
);
