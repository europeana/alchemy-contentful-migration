const {
  contentfulManagement, turndownService, maxLengthShort, maxLengthLong
} = require('./config');
const { pad, licenseMap, LangMap } = require('./utils');

class Entry {
  constructor() {
    this.sys = {};
  }

  static mutateLangMapValues(value, mutation) {
    const langMap = (value instanceof LangMap) ? value : new LangMap(value);
    const mutated = new LangMap;

    for (const locale in langMap) {
      if (Array.isArray(langMap[locale])) {
        mutated[locale] = langMap[locale].map((element) => mutation(element, locale));
      } else {
        mutated[locale] = mutation(langMap[locale], locale);
      }
    }

    return mutated;
  }

  async createAndPublish() {
    pad.log(`- createAndPublish ${this.constructor.contentTypeId}`);
    const entry = await contentfulManagement.environment.createEntry(this.constructor.contentTypeId, { fields: this.fields });
    try {
      await entry.publish();
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      process.exit(1);
    }
    this.sys = entry.sys;
  }

  getField(fieldName) {
    return this.fields[fieldName];
  }

  dateField(langMap) {
    return this.constructor.mutateLangMapValues(langMap, (value) =>
      new Date(value)
    );
  }

  linkField(langMap, type = 'Entry') {
    return this.constructor.mutateLangMapValues(langMap, (value) => {
      return {
        sys: {
          type: 'Link',
          linkType: type,
          id: value
        }
      };
    });
  }

  textField(langMap, options = {}) {
    return this.constructor.mutateLangMapValues(langMap, (value) =>
      // TODO: append ellipsis if truncated
      (typeof value === 'string' && options.max) ? value.slice(0, options.max) : value
    );
  }

  shortTextField(langMap, options = {}) {
    return this.textField(langMap, { ...options, ...{ max: maxLengthShort } });
  }

  longTextField(langMap, options = {}) {
    return this.textField(langMap, { ...options, ...{ max: maxLengthLong } });
  }

  licenseField(langMap) {
    return this.constructor.mutateLangMapValues(langMap, (value) => licenseMap[value]);
  }

  trimField(langMap) {
    return this.constructor.mutateLangMapValues(langMap, (value) =>
      typeof value === 'string' ? value.trim() : value
    );
  }

  // TODO: replace any h1 elements with h2?
  markdownTextField(langMap) {
    return this.constructor.mutateLangMapValues(langMap, (value) => {
      return turndownService.turndown(value);
    });
  }

  appendToField(fieldName, appendix, appender) {
    this[fieldName] = this.constructor.mutateLangMapValues(appendix, (value, locale) => {
      let fieldValue = this[fieldName][locale] || '';
      if (value) fieldValue = fieldValue + (appender ? appender(value) : value);
      return fieldValue;
    });
  }

  get fields() {
    return {};
  }
}

module.exports = Entry;
