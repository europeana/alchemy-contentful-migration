const Entry = require('./Entry');

class ImageComparisonEntry extends Entry {
  static get contentTypeId() {
    return 'imageComparison';
  }

  constructor() {
    super();
    this.hasPart = [];
  }

  get fields() {
    return {
      name: this.shortTextField(this.name),
      hasPart: this.linkField(this.hasPart)
    };
  }
}

module.exports = ImageComparisonEntry;
