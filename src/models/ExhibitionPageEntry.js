const Entry = require('./Entry');

class ExhibitionPageEntry extends Entry {
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

module.exports = ExhibitionPageEntry;
