import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en";
import ml from "./ml";

export const LOCALES = [
  { id: "en", label: "English" },
  { id: "ml", label: "മലയാളം" },
] as const;

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ml: { translation: ml } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React escapes
  returnNull: false,
});

export function setLocale(locale: string) {
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
}

export default i18n;
