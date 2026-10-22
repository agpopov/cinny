import i18n from 'i18next';
import Backend, { HttpBackendOptions } from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';
import dayjs from 'dayjs';
import ru from '../../public/locales/ru.json';
import 'dayjs/locale/ru';
import { trimTrailingSlash } from './utils/common';

dayjs.locale('ru');

i18n
  // i18next-http-backend
  // loads translations from your server
  // https://github.com/i18next/i18next-http-backend
  .use(Backend)
  // detect user language
  // learn more: https://github.com/i18next/i18next-browser-languageDetector
  // pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // init i18next
  // for all options read: https://www.i18next.com/overview/configuration-options
  .init<HttpBackendOptions>({
    debug: false,
    lng: 'ru',
    fallbackLng: 'ru',
    resources: { ru: { translation: ru } },
    partialBundledLanguages: true,
    keySeparator: false,
    nsSeparator: false,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    load: 'languageOnly',
    backend: {
      loadPath: `${trimTrailingSlash(import.meta.env.BASE_URL)}/public/locales/{{lng}}.json`,
    },
  });

export default i18n;
