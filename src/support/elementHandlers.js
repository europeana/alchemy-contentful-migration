const { pad, LangMap } = require('./utils');
const { defaultLocale } = require('./config');
const {
  ImageWithAttributionEntry, RichTextEntry, EmbedEntry, ImageComparisonEntry
} = require('../models');
const { assetIdForPicture } = require('../actions/assets');

const elementHandlers = {
  exhibitionPage: {
    intro: async(essences, entry) => {
      entry.name = essences.get('title').data.body;
      entry.headline = essences.get('sub_title').data.body;
      entry.text = essences.get('body').data.body;
      const primaryImageOfPage = await createImageWithAttribution(essences.get('image'), essences.get('image_credit'));
      entry.primaryImageOfPage = primaryImageOfPage.sys.id;
    }
  },
  exhibitionChapterPage: {
    intro: async(essences, entry) => {
      entry.name = essences.get('title').data.body;
      if (entry.name.isEmpty()) {
        pad.log('WARNING: title is empty; falling back to URL slug');
        entry.name = entry.identifier;
      }
      entry.headline = essences.get('sub_title').data.body;

      const body = essences.get('body').data.body;
      if (!body.isEmpty()) {
        const richText = new RichTextEntry;
        richText.addText(body);
        if (richText.text.isEmpty()) {
          pad.log('WARNING: text is empty; falling back to entry name');
          richText.addText(entry.name);
        }
        await richText.createAndPublish();
        entry.hasPart.push(richText.sys.id);
      }

      const primaryImageOfPage = await createImageWithAttribution(essences.get('image'), essences.get('image_credit'));
      entry.primaryImageOfPage = primaryImageOfPage.sys.id;
    },
    embed: async(essences, entry) => {
      const embed = new EmbedEntry;
      embed.embed = essences.get('embed').data.source;
      await embed.createAndPublish();
      entry.hasPart.push(embed.sys.id);
    },
    image: async(essences, entry) => {
      const image = await createImageWithAttribution(essences.get('image'), essences.get('image_credit'));
      entry.hasPart.push(image.sys.id);
    },
    'rich_image': async(essences, entry) => {
      const image = await createImageWithAttribution(essences.get('image'), essences.get('image_credit'));
      entry.hasPart.push(image.sys.id);

      const richText = new RichTextEntry;
      richText.addSubTitle(essences.get('sub_title').data.body);
      richText.addQuote(essences.get('quote').data.body);
      richText.addQuotee(essences.get('quotee').data.body);
      richText.addHtml(essences.get('body').data.body);
      await richText.createAndPublish();
      entry.hasPart.push(richText.sys.id);
    },
    'image_compare': async(essences, entry) => {
      const imageComparison = new ImageComparisonEntry;

      const image1 = await createImageWithAttribution(essences.get('image_1'), essences.get('image_1_credit'));
      imageComparison.hasPart.push(image1.sys.id);
      const image2 = await createImageWithAttribution(essences.get('image_2'), essences.get('image_2_credit'));
      imageComparison.hasPart.push(image2.sys.id);

      // TODO: move into a getter on the entry class
      imageComparison.name = essences.get('image_1_credit').data.title;
      imageComparison.appendToField('name', new LangMap(' / '));
      imageComparison.appendToField('name', essences.get('image_2_credit').data.title);

      await imageComparison.createAndPublish();
      entry.hasPart.push(imageComparison.sys.id);
    },
    quote: async(essences, entry) => {
      const richText = new RichTextEntry;
      richText.addQuote(essences.get('quote').data.body);
      richText.addQuotee(essences.get('quotee').data.body);
      await richText.createAndPublish();
      entry.hasPart.push(richText.sys.id);
    },
    text: async(essences, entry) => {
      const body = essences.get('body').data.body;
      if (body.isEmpty()) return;
      const richText = new RichTextEntry;
      richText.addText(body);
      await richText.createAndPublish();
      entry.hasPart.push(richText.sys.id);
    }
  }
};

const createImageWithAttribution = async(image, credit) => {
  const entry = new ImageWithAttributionEntry();
  entry.name = credit.data.title,
  entry.image = await assetIdForPicture(image.data.picture_id[defaultLocale.contentful]);
  entry.creator = credit.data.author;
  entry.provider = credit.data.institution;
  entry.license = credit.data.license;
  entry.url = credit.data.url;

  await entry.createAndPublish();

  return entry;
};

module.exports = elementHandlers;
