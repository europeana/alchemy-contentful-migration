const {
  pgClient, contentfulManagement, defaultLocale
} = require('../support/config');
const { load } = require('./load');
const { pad } = require('../support/utils');
const { assetIdForPicture } = require('./assets');
const {
  ExhibitionPageEntry, ExhibitionChapterPageEntry, ImageWithAttributionEntry,
  RichTextEntry, EmbedEntry
} = require('../support/entry');

const help = () => {
  console.log('Usage: npm run exhibition create <urlname>');
};

const create = async(urlname) =>  {
  const pageData = await load(urlname, defaultLocale.alchemy);
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
  entry.identifier = pageData.urlname;
  if (contentTypeId === 'exhibitionPage') {
    entry.datePublished = pageData.public_on;
  }
  // TODO: credits?

  pad.increase();
  for (const element of pageData.elements) {
    pad.log(`- Element "${element.name}"`);
    pad.increase();
    if (elementHandlers[contentTypeId][element.name]) {
      // pad.log(`- Handling element "${element.name}" on "${contentTypeId}"`);
      await elementHandlers[contentTypeId][element.name](element.essences, entry);
    } else {
      pad.log(`- WARNING: unhandled element "${element.name}" on "${contentTypeId}"`);
      if (element.name === 'section') pad.log(JSON.stringify(element.essences, null, 2));
    }
    pad.decrease();
  }
  pad.decrease();

  await entry.createAndPublish();
  // console.log(fields);

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
  // TODO: merge consecutive rich text entries (before or after creation?)
  //       or are all cases handled by quote and rich_image handlers?
  // TODO: image_compare
  exhibitionChapterPage: {
    intro: async(essences, entry) => {
      // FIXME: may be empty, but must be present on chapter page content entries
      entry.name = essences.get('title').data.body;
      entry.headline = essences.get('sub_title').data.body;
      const richText = await createRichText(essences.get('body').data.body);
      entry.hasPart.push(richText.sys.id);
      const primaryImageOfPage = await createImageWithAttribution(essences.get('image'), essences.get('image_credit'));
      entry.primaryImageOfPage = primaryImageOfPage.sys.id;
    },
    embed: async(essences, entry) => {
      const embed = await createEmbed(essences.get('embed').data.source);
      entry.hasPart.push(embed.sys.id);
    },
    image: async(essences, entry) => {
      const image = await createImageWithAttribution(essences.get('image'), essences.get('image_credit'));
      entry.hasPart.push(image.sys.id);
    },
    'rich_image': async(essences, entry) => {
      const image = await createImageWithAttribution(essences.get('image'), essences.get('image_credit'));
      entry.hasPart.push(image.sys.id);

      const essenceTexts = {
        title: essences.get('title').data.body,
        subTitle: essences.get('sub_title').data.body,
        body: essences.get('body').data.body,
        quote: essences.get('quote').data.body,
        quotee: essences.get('quotee').data.body
      };

      const htmlTexts = [];
      // FIXME: this needs to work on lang maps. make it a function of RichText? e.g. `importFromRichImageEssences()`
      // FIXME: this also needs to ignore empty strings
      if (essenceTexts.title) htmlTexts.push(`<h2>${essenceTexts.title}</h2>`);
      if (essenceTexts.subTitle) htmlTexts.push(`<p><strong>${essenceTexts.subTitle}</strong></p>`);
      if (essenceTexts.body) htmlTexts.push(essenceTexts.body);
      if (essenceTexts.quote) htmlTexts.push(`<blockquote>${essenceTexts.quote}</blockquote>`);
      if (essenceTexts.quotee) htmlTexts.push(`<p><cite>${essenceTexts.quotee}</cite></p>`);

      const richText = await createRichText(htmlTexts.join('\n'));
      entry.hasPart.push(richText.sys.id);
    },
    quote: async(essences, entry) => {
      // TODO. see rich_image. example: heritage-at-risk/rebuilding-notre-dame
    },
    text: async(essences, entry) => {
      const richText = await createRichText(essences.get('body').data.body);
      entry.hasPart.push(richText.sys.id);
    }
  }
};

const createRichText = async(text) => {
  const entry = new RichTextEntry;
  entry.headline = 'Exhibition Content'; // FIXME
  entry.text = text;

  await entry.createAndPublish();

  return entry;
};

const createEmbed = async(embed) => {
  const entry = new EmbedEntry;
  entry.embed = embed;

  await entry.createAndPublish();

  return entry;
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

  const result = await(create(args[0]));

  await pgClient.end();
  console.log(JSON.stringify(result.sys.id, null, 2));
};

module.exports = {
  create,
  cli,
  help
};
