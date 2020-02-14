const Entry = require('./Entry');

class ImageWithAttributionEntry extends Entry {
  static get contentTypeId() {
    return 'imageWithAttribution';
  }

  europeanaItemUri(langMap) {
    return this.constructor.mutateLangMapValues(langMap, (value) => {
      if (typeof value !== 'string') return value;
      const itemIdMatch = value.match(/europeana\.eu\/portal\/([a-z][a-z]\/)?record(\/[0-9]+\/[^/.#$]+)/);
      return itemIdMatch ? `http://data.europeana.eu/item${itemIdMatch[2]}` : value;
    });
  }

  get fields() {
    return {
      name: this.shortTextField(this.name),
      image: this.linkField(this.image, 'Asset'),
      creator: this.shortTextField(this.creator),
      provider: this.shortTextField(this.provider),
      license: this.licenseField(this.license),
      url: this.shortTextField(this.europeanaItemUri(this.trimField(this.url)))
    };
  }
}

module.exports = ImageWithAttributionEntry;
