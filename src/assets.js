const crypto = require('crypto');

const { contentfulPreviewClient } = require('./config');

let assetIds;

// Fetch all asset IDs via the preview API, for later use by `assetExists`
const loadAssetIds = async() => {
  console.log('Getting asset IDs...');
  assetIds = [];

  let skip = 0;
  let keepGoing = true;
  while (keepGoing) {
    const assets = await contentfulPreviewClient.getAssets({
      limit: 100,
      skip
    });

    if (assets.items.length === 0) {
      keepGoing = false;
    } else {
      assetIds = assetIds.concat(assets.items.map((item) => item.sys.id));
      skip = skip + 100;
    }
  }

  console.log('... done.');
  return assetIds;
};

const assetExists = async(assetId) => {
  if (!assetIds) await loadAssetIds();

  return assetIds.includes(assetId);
};

const assetIdForImage = (uid) => {
  return crypto.createHash('md5').update(uid).digest('hex');
};

module.exports = {
  assetExists,
  assetIdForImage,
  loadAssetIds
};
