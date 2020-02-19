const { pgClient, contentfulManagement } = require('../support/config');
const { pad } = require('../support/utils');

const { createAll } = require('./create');
const { migrateImages } = require('./images');
const { cacheAssetIds } = require('./assets');
const { credits } = require('./credits');

const help = () => {
  pad.log('Usage: npm run exhibition migrate');
};

const cli = async() => {
  await contentfulManagement.connect();
  await pgClient.connect();

  await migrateImages();
  await cacheAssetIds();
  await createAll();
  await credits();

  await pgClient.end();
};

module.exports = {
  cli,
  help
};
