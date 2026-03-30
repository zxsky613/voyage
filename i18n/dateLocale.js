/** Utilisé par `formatDate` dans App.jsx (évite une dépendance circulaire avec le contexte). */
let currentTag = "fr-FR";

const LOCALE_TO_TAG = {
  fr: "fr-FR",
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
  it: "it-IT",
  zh: "zh-CN",
};

export function setAppDateLocale(languageCode) {
  currentTag = LOCALE_TO_TAG[languageCode] || "fr-FR";
}

export function getAppDateLocale() {
  return currentTag;
}
