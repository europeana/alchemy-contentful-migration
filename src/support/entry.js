const {
  contentfulManagement, turndownService, maxLengthShort, maxLengthLong
} = require('./config');
const { pad, LangMap } = require('./utils');

class ContentfulEntry {
  constructor() {
    this.sys = {};
  }

  async createAndPublish() {
    // console.log('createAndPublish', this.constructor.contentTypeId, JSON.stringify(this.fields, null, 2));
    pad.log(`- createAndPublish ${this.constructor.contentTypeId}`);
    // const entry = await contentfulManagement.environment.createEntry(this.constructor.contentTypeId, { fields: this.fields });
    // await entry.publish();
    // this.sys = entry.sys;
  }

  getField(fieldName) {
    return this.fields[fieldName];
  }

  dateField(langMap) {
    return this.mutateLangMapValues(langMap, (value) =>
      new Date(value)
    );
  }

  linkField(langMap, type = 'Entry') {
    return this.mutateLangMapValues(langMap, (value) => {
      return {
        sys: {
          type: 'Link',
          linkType: type,
          id: value
        }
      };
    });
  }

  mutateLangMapValues(value, mutation) {
    const langMap = (value instanceof LangMap) ? value : new LangMap(value);
    const mutated = {};
    for (const locale in langMap) {
      if (Array.isArray(langMap[locale])) {
        mutated[locale] = langMap[locale].map((element) => mutation(element));
      } else {
        mutated[locale] = mutation(langMap[locale]);
      }
    }
    return mutated;
  }

  textField(langMap, options = {}) {
    return this.mutateLangMapValues(langMap, (value) =>
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
    return this.mutateLangMapValues(langMap, (value) =>
      licenseMap[value]
    );
  }

  // TODO: replace any h1 elements with h2
  markdownTextField(langMap) {
    return this.mutateLangMapValues(langMap, (value) => {
      let markdown = turndownService.turndown(value);

      // FIXME: consider whether this still belongs here given the essence handlers in create.js
      // switch (name) {
      //   case 'quote':
      //     markdown = `> ${markdown}`;
      //     break;
      //   case 'quotee':
      //     markdown = `<cite>${markdown}</cite>`;
      //     break;
      // }

      return markdown;
    });
  }

  get fields() {
    return {};
  }
}

class ExhibitionPageEntry extends ContentfulEntry {
  static get contentTypeId() {
    return 'exhibitionPage';
  }

  constructor() {
    super();
    this.hasPart = [];
  }

  get fields() {
    return {
      name: this.shortTextField(this.name),
      identifier: this.shortTextField(this.identifier),
      headline: this.shortTextField(this.headline),
      description: this.shortTextField(this.description),
      text: this.longTextField(this.markdownTextField(this.text)),
      primaryImageOfPage: this.linkField(this.primaryImageOfPage),
      datePublished: this.dateField(this.datePublished),
      hasPart: this.linkField(this.hasPart),
      credits: this.longTextField(this.credits)
    };
  }
}

class ExhibitionChapterPageEntry extends ContentfulEntry {
  static get contentTypeId() {
    return 'exhibitionChapterPage';
  }

  constructor() {
    super();
    this.hasPart = [];
  }

  get fields() {
    return {
      name: this.shortTextField(this.name),
      // TODO: strip parent urlname from chapters
      identifier: this.shortTextField(this.identifier),
      headline: this.shortTextField(this.headline),
      description: this.shortTextField(this.description),
      primaryImageOfPage: this.linkField(this.primaryImageOfPage),
      hasPart: this.linkField(this.hasPart)
    };
  }
}

class RichTextEntry extends ContentfulEntry {
  static get contentTypeId() {
    return 'richText';
  }

  get fields() {
    return {
      headline: this.shortTextField(this.headline),
      text: this.longTextField(this.markdownTextField(this.text))
    };
  }
}

class EmbedEntry extends ContentfulEntry {
  static get contentTypeId() {
    return 'embed';
  }

  get fields() {
    return {
      name: this.shortTextField(this.name),
      embed: this.longText(this.embed)
    };
  }
}

class ImageWithAttributionEntry extends ContentfulEntry {
  static get contentTypeId() {
    return 'imageWithAttribution';
  }

  get fields() {
    return {
      name: this.shortTextField(this.name),
      image: this.linkField(this.image, 'Asset'),
      creator: this.shortTextField(this.creator),
      provider: this.shortTextField(this.provider),
      license: this.licenseField(this.license),
      // FIXME: convert to data.europeana.eu url, or local portal url, or record ID?
      url: this.shortTextField(this.url)
    };
  }
}

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
  ExhibitionPageEntry,
  ExhibitionChapterPageEntry,
  EmbedEntry,
  ImageWithAttributionEntry,
  RichTextEntry,
  licenseMap
};
