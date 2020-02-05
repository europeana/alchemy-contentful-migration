require('dotenv').config();
const contentful = require('contentful-management');
const { Client } = require('pg');

const { assetExists, assetIdForImage } = require('./src/assets');

const imageServer = process.env.alchemyImageServer;
const locale = 'en-GB';

const maxLengthShort = 255;
const maxLengthLong = 2000;

const pgClient = new Client({
  user: process.env.pgUser,
  host: process.env.pgHost,
  database: process.env.pgDatabase,
  port: process.env.pgPort
});

let space;
let environment;

const cEnvironmentId = process.env.cEnvironmentId;
const cSpaceId = process.env.cSpaceId;

const cClient = contentful.createClient({
  accessToken: process.env.cAccessToken
});

const wrapLocale = (val, l, max) => {
  return {
    [l ? l : locale]: (typeof val === 'string' && max) ? val.substr(0, max) : val
  };
};

const migrateImage = async(picture) => {
  const uid = picture.image_file_uid;
  const assetId = await assetIdForImage(uid);

  const exists = await assetExists(environment, assetId);
  if (exists) {
    console.log(`[EXISTS] ${uid}: ${assetId}`);
    return;
  }

  try {
    const asset = await environment.createAssetWithId(assetId, {
      fields: {
        title: wrapLocale(picture.title, null, maxLengthShort),
        file: wrapLocale({
          contentType: picture.image_file_format ? `image/${picture.image_file_format}` : null,
          fileName: picture.image_file_name,
          upload: `${imageServer}${encodeURIComponent(uid)}`
        })
      }
    });

    const processedAsset = await asset.processForAllLocales();
    processedAsset.publish();

    console.log(`[NEW] ${uid}: ${asset.sys.id}`);
  } catch(e) {
    console.log(`[ERROR] ${uid}: ${e}`);
  }
};

const migrateImages = async() => {
  space = await cClient.getSpace(cSpaceId);
  environment = await space.getEnvironment(cEnvironmentId);

  await pgClient.connect();
  const res = await pgClient.query(`
    SELECT DISTINCT ON (ap.id, ap.image_file_uid, ap.image_file_format, ap.image_file_name) aec.title, ap.image_file_uid, ap.image_file_format, ap.image_file_name
    FROM alchemy_essence_pictures aep
    INNER JOIN alchemy_pictures ap ON aep.picture_id=ap.id
    INNER JOIN alchemy_contents ac ON ac.essence_id=aep.id AND ac.essence_type='Alchemy::EssencePicture'
    INNER JOIN alchemy_elements ae ON ac.element_id=ae.id
    LEFT JOIN alchemy_contents acc ON acc.element_id=ae.id AND acc.essence_type='Alchemy::EssenceCredit'
    LEFT JOIN alchemy_essence_credits aec ON acc.essence_id=aec.id
  `);
  await pgClient.end();

  for (const picture of res.rows) {
    await migrateImage(picture);
  }
};

migrateImages();
