const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { pgClient, contentfulPreviewClient } = require('../support/config');

const cacheFilePath = path.resolve(__dirname, '../../tmp/assetIds.json');

let assetIds;

const help = () => {
  console.log('Usage: npm run exhibition assets <list|cache>');
};

// Fetch all asset IDs via the preview API, for later use by `assetExists`
const loadAssetIds = async() => {
  console.log('Loading asset IDs...');

  assetIds = await loadAssetIdsFromCache();
  if (assetIds) {
    console.log(`  ... loaded from cache file ${cacheFilePath}`);
  } else {
    assetIds = await loadAssetIdsFromContentful();
    console.log('  ... loaded from Contentful');
  }

  return assetIds;
};

const cache = async() => {
  const assetIds = await loadAssetIdsFromContentful();
  fs.writeFileSync(cacheFilePath, JSON.stringify(assetIds));
  console.log(`Asset ID cache written to ${cacheFilePath}`);
};

const loadAssetIdsFromCache = () => {
  if (!fs.existsSync(cacheFilePath)) return null;
  const cacheFileContents = fs.readFileSync(cacheFilePath, { encoding: 'utf8' });
  return JSON.parse(cacheFileContents);
};

const loadAssetIdsFromContentful = async() => {
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

  return ids;
};

const assetExists = async(assetId) => {
  if (!assetIds) await loadAssetIds();

  return assetIds.includes(assetId);
};

const assetIdForImage = (uid) => {
  return crypto.createHash('md5').update(uid).digest('hex');
};

const assetIdForPicture = async(pictureId) => {
  const sql = `
    select image_file_uid from alchemy_pictures where id=$1
  `;

  const result = await pgClient.query(sql, [pictureId]);
  const uid = result.rows[0]['image_file_uid'];

  return await assetIdForImage(uid);
};

const cli = async(args) => {
  switch (args[0]) {
    case 'cache':
      cache();
      break;
    case 'list':
      await loadAssetIds();
      console.log(JSON.stringify(assetIds));
      break;
    default:
      help();
  }
};

module.exports = {
  cli,
  help,
  assetExists,
  assetIdForImage,
  assetIdForPicture,
  loadAssetIds
};
