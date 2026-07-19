// 지원 locale (docs/01-project-overview.md §Goal 4)
export enum SupportedLocale {
  En = "en",
  Ko = "ko",
  Ja = "ja",
}

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
  SupportedLocale.En,
  SupportedLocale.Ko,
  SupportedLocale.Ja,
];

export const DEFAULT_LOCALE: SupportedLocale = SupportedLocale.En;

export const isSupportedLocale = (value: string): value is SupportedLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value);
