const { contentfulManagement } = require('../support/config');
const { pad } = require('../support/utils');

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

  async createAndPublish() {
    await this.combineConsecutiveRichTextEntries();
    await super.createAndPublish();
  }

  async combineConsecutiveRichTextEntries() {
    if (this.hasPart.length === 0) return;
    pad.log('- Combining consecutive rich text entries');
    pad.increase();

    const hasPartResponse = await contentfulManagement.environment.getEntries({
      'sys.id[in]': this.hasPart.join(',')
    });
    const hasPartEntries = hasPartResponse.items
      .reduce((memo, item) => {
        memo[item.sys.id] = item;
        return memo;
      }, {});

    const hasPartBefore = [].concat(this.hasPart);
    const hasPartAfter = [];
    for (let i = hasPartBefore.length - 1; i > 0; i--) {
      const currentEntryId = hasPartBefore[i];
      let currentEntry = hasPartEntries[currentEntryId];
      const previousEntryId = hasPartBefore[i - 1];
      let previousEntry = hasPartEntries[previousEntryId];

      if (currentEntry.sys.contentType.sys.id === 'richText' && previousEntry.sys.contentType.sys.id === 'richText') {
        pad.log(`- Moving text from ${currentEntryId} to ${previousEntryId}`);
        for (const locale in currentEntry.fields.text) {
          if (previousEntry.fields.text[locale]) {
            previousEntry.fields.text[locale] += currentEntry.fields.text[locale];
          } else {
            previousEntry.fields.text[locale] = currentEntry.fields.text[locale];
          }
        }
        previousEntry = await previousEntry.update();
        previousEntry = await previousEntry.publish();
        currentEntry = await currentEntry.unpublish();
        currentEntry = await currentEntry.delete();
      } else {
        hasPartAfter.unshift(currentEntryId);
      }
    }

    this.hasPart = hasPartAfter;
    pad.decrease();
  }
}

module.exports = ExhibitionChapterPageEntry;
