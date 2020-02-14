const Entry = require('./Entry');

const LangMap = require('../support/utils');

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

  get fields() {
    return {
      // FIXME: default to something more informative of context. text, truncated?
      headline: this.shortTextField(this.headline || 'Exhibition rich text'),
      text: this.longTextField(this.markdownTextField(this.text))
    };
  }
}

module.exports = RichTextEntry;
