const { pgClient, contentfulManagement } = require('../support/config');
const { pad } = require('../support/utils');

const { create } = require('./create');
const { getExhibitionPageUrlnames } = require('./translate');

const help = () => {
  pad.log('Usage: npm run exhibition migrate');
};

const createExhibitions = async() =>  {
  const urlnames = await getExhibitionPageUrlnames();

  for (const urlname of urlnames) {
    await create(urlname);
  }
};

const cli = async() => {
  await contentfulManagement.connect();
  await pgClient.connect();

  // TODO:
  // 1. run images
  // 2. run assets cache
  await createExhibitions();

  await pgClient.end();
};

module.exports = {
  cli,
  help
};
