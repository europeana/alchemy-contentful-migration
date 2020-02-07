const { turndownService, defaultLocale, maxLengthShort, maxLengthLong } = require('./config');

const wrapLocale = (value, options = {}) => {
  const truncated = (typeof value === 'string' && options.max) ? value.slice(0, options.max) : value;

  return {
    [options.locale || defaultLocale]: truncated
  };
};

const shortText = (value, options = {}) => {
  return wrapLocale(value, { ...options, ...{ max: maxLengthShort } });
};

const longText = (value, options = {}) => {
  return wrapLocale(value, { ...options, ...{ max: maxLengthLong } });
};

const markdownTextField = (text, name) => {
  let markdown = turndownService.turndown(text);

  switch (name) {
    case 'quote':
      markdown = `> ${markdown}`;
      break;
    case 'quotee':
      markdown = `<cite>${markdown}</cite>`;
      break;
  }

  return markdown;
};

const padLog = (msg, depth = 0) => {
  const pad = '  '.repeat(depth);
  console.log(`${pad}${msg}`);
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

const licenseMap = {
  public: 'https://creativecommons.org/publicdomain/mark/1.0/',
  'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC_BY': 'https://creativecommons.org/licenses/by/1.0',
  'CC_BY_SA': 'https://creativecommons.org/licenses/by-sa/1.0',
  'CC_BY_ND': 'https://creativecommons.org/licenses/by-nc-nd/1.0',
  'CC_BY_NC': 'https://creativecommons.org/licenses/by-nc/1.0',
  'CC_BY_NC_SA': 'https://creativecommons.org/licenses/by-nc-sa/1.0',
  'CC_BY_NC_ND': 'https://creativecommons.org/licenses/by-nc-nd/1.0',
  'RS_INC_EDU': 'http://rightsstatements.org/vocab/InC-EDU/1.0/',
  'RS_NOC_OKLR': 'http://rightsstatements.org/vocab/NoC-OKLR/1.0/',
  'RS_INC': 'http://rightsstatements.org/vocab/InC/1.0/',
  'RS_NOC_NC': 'http://rightsstatements.org/vocab/NoC-NC/1.0/',
  'RS_INC_OW_EU': 'http://rightsstatements.org/vocab/InC-OW-EU/1.0/',
  'RS_CNE': 'http://rightsstatements.org/vocab/CNE/1.0/'
};

module.exports = {
  padLog,
  localeMap,
  licenseMap,
  wrapLocale,
  shortText,
  longText,
  markdownTextField
};
