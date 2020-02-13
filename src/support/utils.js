const { defaultLocale } = require('./config');

const pad = {
  depth: 0,
  increase() {
    this.depth++;
  },
  decrease() {
    this.depth--;
  },
  log(msg) {
    const prefix = '  '.repeat(this.depth);
    console.log(`${prefix}${msg}`);
  }
};

const localeMap = {
  de: 'de-DE',
  en: 'en-GB',
  'en-gb': 'en-GB',
  es: 'es-ES',
  fi: 'fi-FI',
  fr: 'fr-FR',
  it: 'it-IT',
  lv: 'lv-LV',
  nl: 'nl-NL',
  pl: 'pl-PL',
  ro: 'ro-RO',
  sl: 'sl-SI',
  sv: 'sv-SE'
};

class LangMap {
  constructor(value, locale = defaultLocale.contentful) {
    if (value) this[locale] = value;
  }

  isEmpty() {
    return Object.keys(this).length === 0;
  }
}

module.exports = {
  LangMap,
  localeMap,
  pad
};
