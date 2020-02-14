const { pgClient, contentfulManagement } = require('../support/config');
const { pad } = require('../support/utils');

const { create } = require('./create');
const { images } = require('./images');
const { cacheAssetIds } = require('./assets');
const { credits } = require('./credits');

const help = () => {
  pad.log('Usage: npm run exhibition migrate');
};

const cli = async() => {
  await contentfulManagement.connect();
  await pgClient.connect();

  await images();
  await cacheAssetIds();
  await create();
  await credits();

  await pgClient.end();
};

module.exports = {
  cli,
  help
};
