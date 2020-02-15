const {
  pgClient, contentfulManagement, defaultLocale
} = require('../support/config');
const { pad } = require('../support/utils');
const elementHandlers = require('../support/elementHandlers');
const {
  ExhibitionPageEntry, ExhibitionChapterPageEntry
} = require('../models');

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

const createAll = async() => {
  const urlnames = await getExhibitionPageUrlnames();

  for (const urlname of urlnames) {
    await create(urlname);
  }
};

const cli = async(args) => {
  await contentfulManagement.connect();
  await pgClient.connect();


  if (args[0]) {
    await(create(args[0]));
  } else {
    await createAll();
  }

  await pgClient.end();
};

module.exports = {
  create,
  createAll,
  cli,
  help
};
