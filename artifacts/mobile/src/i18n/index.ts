import { de } from "./de";
import { en } from "./en";
import { tr } from "./tr";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  CUSTOMER_LOCALE_SELECTION_ENABLED,
  type AppLocale,
  type TranslationTree,
} from "./types";

export type { AppLocale, TranslationTree } from "./types";
export { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, CUSTOMER_LOCALE_SELECTION_ENABLED };

const catalogs: Record<AppLocale, TranslationTree> = { de, en, tr };

let currentLocale: AppLocale = DEFAULT_LOCALE;

function lookup(tree: TranslationTree, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (node != null && typeof node === "object" && part in (node as object)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, tree as unknown);
}

function interpolate(template: string, options?: Record<string, string | number>): string {
  if (!options) return template;
  return template.replace(/%\{(\w+)\}/g, (_, name: string) => String(options[name] ?? `%{${name}}`));
}

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as string[]).includes(value);
}

export function setI18nLocale(locale: AppLocale): void {
  currentLocale = locale;
}

/** Punkt-Notation, z. B. `t("tabs.start")`. Fallback: de, dann Key. */
export function t(scope: string, options?: Record<string, string | number>): string {
  const primary = lookup(catalogs[currentLocale], scope);
  const fallback = lookup(catalogs[DEFAULT_LOCALE], scope);
  const resolved = primary ?? fallback;
  if (typeof resolved === "string") return interpolate(resolved, options);
  return scope;
}

export function languageDisplayName(locale: AppLocale): string {
  return t(`language.names.${locale}`);
}
