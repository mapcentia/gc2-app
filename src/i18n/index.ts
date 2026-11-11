import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from 'antd/es/locale';
import daDK from 'antd/locale/da_DK';
import enUS from 'antd/locale/en_US';
import { detectLanguage, type Lang } from './detectLanguage';
import en from './locales/en.json';
import da from './locales/da.json';

export type { Lang };

export const lang: Lang = detectLanguage(typeof navigator === 'undefined' ? undefined : navigator.languages);

if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const antdLocale: Locale = lang === 'da' ? daDK : enUS;

i18n.use(initReactI18next).init({
  lng: lang,
  fallbackLng: 'en',
  resources: { en: { translation: en }, da: { translation: da } },
  interpolation: { escapeValue: false, skipOnVariables: true },
  returnNull: false,
  initAsync: false,
});

export function formatNumber(n: number, l: Lang = lang): string {
  return new Intl.NumberFormat(l).format(n);
}

export function formatTime(d: Date, l: Lang = lang): string {
  return new Intl.DateTimeFormat(l, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d);
}

export default i18n;
