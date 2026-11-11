export const languageKey = 'rato-al-sol-language';
export const isLanguage = (value) => value === 'es' || value === 'en';
export const translate = (language, spanish, english) => language === 'en' ? english : spanish;

const directions = {
  norte: 'north', noreste: 'northeast', este: 'east', sureste: 'southeast',
  sur: 'south', suroeste: 'southwest', oeste: 'west', noroeste: 'northwest',
};

export function translateDirection(language, value) {
  if (language !== 'en') return value;
  const translated = directions[value.toLocaleLowerCase('es')] || value;
  return value[0] === value[0]?.toLocaleUpperCase('es') ? translated[0].toUpperCase() + translated.slice(1) : translated;
}
