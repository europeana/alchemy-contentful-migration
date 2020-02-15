const Entry = require('./Entry');

class ExhibitionChapterPageEntry extends Entry {
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
      identifier: this.shortTextField(this.identifier),
      headline: this.shortTextField(this.headline),
      description: this.shortTextField(this.description),
      primaryImageOfPage: this.linkField(this.primaryImageOfPage),
      hasPart: this.linkField(this.hasPart)
    };
  }
}

module.exports = ExhibitionChapterPageEntry;
