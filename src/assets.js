const crypto = require('crypto');

const { contentfulPreviewClient } = require('./config');

let assetIds;

const getAssetIds = async() => {
  console.log('Getting asset IDs...');
  let ids = [];

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
      ids = ids.concat(assets.items.map((item) => item.sys.id));
      skip = skip + 100;
    }
  }

  console.log('... done.');
  return ids;
};

const assetExists = async(assetId) => {
  if (!assetIds) assetIds = await getAssetIds();

  return assetIds.includes(assetId);
};

const assetIdForImage = (uid) => {
  return crypto.createHash('md5').update(uid).digest('hex');
};

module.exports = {
  assetExists,
  assetIdForImage
};
