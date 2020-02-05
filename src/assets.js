const crypto = require('crypto');

const assetExists = async(environment, assetId) => {
  try {
    const asset = await environment.getAsset(assetId);
    return true;
  } catch (e) {
    if (e.name === 'NotFound') return false;
    throw e;
  }
};

const assetIdForImage = (uid) => {
  return crypto.createHash('md5').update(uid).digest('hex');
};

module.exports = {
  assetExists,
  assetIdForImage
};
