const { pgClient, contentfulManagement } = require('../support/config');
const { pad } = require('../support/utils');

const { entries } = require('./entries');
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
  await entries();
  await credits();

  await pgClient.end();
};

module.exports = {
  cli,
  help
};
