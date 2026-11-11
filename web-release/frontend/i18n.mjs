import { isLanguage, languageKey, translate, translateDirection } from './shared/i18n.mjs';

let language = 'es';
export const t = (spanish, english) => translate(language, spanish, english);
export const direction = (value) => translateDirection(language, value);

export function message(element, spanish, english) {
  element.dataset.es = spanish;
  element.dataset.en = english;
  element.textContent = t(spanish, english);
}

export function setLanguage(value, persist = false) {
  language = isLanguage(value) ? value : 'es';
  document.documentElement.lang = language;
  document.title = t('Rato al Sol — Explora la luz en Madrid y Barcelona', 'Rato al Sol — Explore the light in Madrid and Barcelona');
  for (const element of document.querySelectorAll('[data-en]')) {
    if (!('es' in element.dataset)) element.dataset.es = element.textContent;
    element.textContent = t(element.dataset.es, element.dataset.en);
  }
  for (const attribute of ['aria-label', 'placeholder', 'content']) {
    for (const element of document.querySelectorAll(`[data-en-${attribute}]`)) {
      const english = element.getAttribute(`data-en-${attribute}`);
      const spanishKey = `data-es-${attribute}`;
      if (!element.hasAttribute(spanishKey)) element.setAttribute(spanishKey, element.getAttribute(attribute));
      element.setAttribute(attribute, t(element.getAttribute(spanishKey), english));
    }
  }
  document.getElementById('language').value = language;
  if (persist) try { localStorage.setItem(languageKey, language); } catch { /* Preference is optional. */ }
}

export function savedLanguage() {
  try { return isLanguage(localStorage.getItem(languageKey)) ? localStorage.getItem(languageKey) : 'es'; }
  catch { return 'es'; }
}
