const { LangMap } = require('../support/utils');

const Entry = require('./Entry');

class RichTextEntry extends Entry {
  constructor() {
    super();
    this.text = new LangMap;
  }

  static get contentTypeId() {
    return 'richText';
  }

  addQuote(quote) {
    this.appendToField('text', quote, ((value) => `<blockquote>${value}</blockquote>`));
  }

  addQuotee(quotee) {
    this.appendToField('text', quotee, ((value) => `<p><cite>${value}</cite></p>`));
  }

  addTitle(title) {
    this.appendToField('text', title, ((value) => `<h2>${value}</h2>`));
  }

  addSubTitle(subTitle) {
    this.appendToField('text', subTitle, ((value) => `<p><strong>${value}</strong></p>`));
  }

  addHtml(html) {
    this.appendToField('text', html);
  }

  headlineFromText() {
    return this.constructor.mutateLangMapValues(this.text, (value) => {
      const h1Match = (typeof value === 'string') ? value.match(/<h1.*?>(.*?)<\/h1.*?>/i) : null;
      if (h1Match) return h1Match[1];
      // FIXME: default to something more informative of context. text, truncated?
      return 'Exhibition rich text';
    });
  }

  get fields() {
    return {
      headline: this.shortTextField(this.headline ? this.headline : this.headlineFromText()),
      text: this.longTextField(this.markdownTextField(this.text))
    };
  }
}

module.exports = RichTextEntry;
