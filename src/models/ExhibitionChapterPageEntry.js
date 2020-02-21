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

    pad.increase();
    pad.log('- Combining consecutive rich text entries');
    pad.increase();

    this.hasPart = await this.combinedRichTextEntries();
    pad.decrease();
    pad.decrease();
  }

  async combinedRichTextEntries() {
    const hasPartEntries = await this.getHasPartEntries();

    const hasPartBefore = [].concat(this.hasPart);
    const hasPartAfter = [];

    for (let i = hasPartBefore.length - 1; i > 0; i--) {
      const currentEntryId = hasPartBefore[i];
      let currentEntry = hasPartEntries[currentEntryId];
      const previousEntryId = hasPartBefore[i - 1];
      let previousEntry = hasPartEntries[previousEntryId];

      if (currentEntry.sys.contentType.sys.id === 'richText' && previousEntry.sys.contentType.sys.id === 'richText') {
        pad.log(`- Moving text from ${currentEntryId} to ${previousEntryId}`);
        await this.mergeRichTextEntries(previousEntry, currentEntry);
      } else {
        hasPartAfter.unshift(currentEntryId);
      }
    }
    hasPartAfter.unshift(hasPartBefore[0]);

    return hasPartAfter;
  }

  async getHasPartEntries() {
    const hasPartResponse = await contentfulManagement.environment.getEntries({
      'sys.id[in]': this.hasPart.join(',')
    });

    return hasPartResponse.items
      .reduce((memo, item) => {
        memo[item.sys.id] = item;
        return memo;
      }, {});
  }

  async mergeRichTextEntries(keep, discard) {
    for (const locale in discard.fields.text) {
      if (keep.fields.text[locale]) {
        keep.fields.text[locale] = [keep.fields.text[locale], discard.fields.text[locale]].join('\n\n');
      } else {
        keep.fields.text[locale] = discard.fields.text[locale];
      }
    }
    keep = await keep.update();
    keep = await keep.publish();
    discard = await discard.unpublish();
    discard = await discard.delete();
  }
}

module.exports = ExhibitionChapterPageEntry;
