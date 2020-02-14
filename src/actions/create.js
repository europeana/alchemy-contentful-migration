const {
  pgClient, contentfulManagement, defaultLocale
} = require('../support/config');
const { pad, LangMap } = require('../support/utils');
const {
  ExhibitionPageEntry, ExhibitionChapterPageEntry, ImageWithAttributionEntry,
  RichTextEntry, EmbedEntry, ImageComparisonEntry
} = require('../models');

const { assetIdForPicture } = require('./assets');
const { load, getExhibitionPageUrlnames } = require('./load');
const { translate } = require('./translate');

const help = () => {
  pad.log('Usage: npm run exhibition create [urlname]');
};

const create = async(urlname) =>  {
  const pageData = await load(urlname, defaultLocale.alchemy);
  await translate(pageData);

  pad.log(`Creating entry for page: ${urlname}`);
  const contentTypeId = pageData.depth === 2 ? 'exhibitionPage' : 'exhibitionChapterPage';
  pad.log(`- contentTypeId: ${contentTypeId}`);

  const entry = contentTypeId === 'exhibitionPage' ? new ExhibitionPageEntry : new ExhibitionChapterPageEntry;

  for (const childPageUrlname of pageData['child_page_urlnames']) {
    pad.increase();
    const childPageEntry = await create(childPageUrlname);
    entry.hasPart.push(childPageEntry.sys.id);
    pad.decrease();
  }

  entry.description = pageData['meta_description'];
  if (contentTypeId === 'exhibitionPage') {
    entry.identifier = pageData.urlname;
    entry.datePublished = pageData.public_on;
  } else {
    entry.identifier = pageData.urlname.split('/')[1] || pageData.urlname;
  }
  // TODO: credits?

  pad.increase();
  for (const element of pageData.elements) {
    pad.log(`- Element "${element.name}"`);
    pad.increase();
    if (elementHandlers[contentTypeId][element.name]) {
      await elementHandlers[contentTypeId][element.name](element.essences, entry);
    } else {
      pad.log(`- WARNING: unhandled element "${element.name}" on "${contentTypeId}"`);
      if (element.name === 'section') pad.log(JSON.stringify(element.essences, null, 2));
    }
    pad.decrease();
  }
  pad.decrease();

  await entry.createAndPublish();

  return entry;
};

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
  // TODO: merge consecutive rich text entries
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
        richText.text = body;
        if (richText.text.isEmpty()) {
          pad.log('WARNING: text is empty; falling back to entry name');
          richText.text = entry.name;
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
      richText.addTitle(essences.get('title').data.body);
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
      const richText = new RichTextEntry;
      richText.text = essences.get('body').data.body;
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

const cli = async(args) => {
  await contentfulManagement.connect();
  await pgClient.connect();


  if (args[0]) {
    await(create(args[0]));
  } else {
    const urlnames = await getExhibitionPageUrlnames();

    for (const urlname of urlnames) {
      await create(urlname);
    }
  }

  await pgClient.end();
};

module.exports = {
  create,
  cli,
  help
};
