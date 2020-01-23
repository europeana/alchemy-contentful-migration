require('dotenv').config();
const contentful = require('contentful-management');
const { Client } = require('pg');
const fs = require('fs');
const imageServer = process.env.alchemyImageServer;
const locale = 'en-GB';

const imageLog = './tmp/images.json';
const images = fs.existsSync(imageLog) ? require(imageLog) : {};

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
  const uid = encodeURIComponent(picture.image_file_uid);

  if (images[uid]) {
    console.log(`[EXISTS] ${uid}: ${images[uid]}`);
    return;
  }

  try {
    const asset = await environment.createAsset({
      fields: {
        title: wrapLocale(picture.title, null, maxLengthShort),
        file: wrapLocale({
          contentType: picture.image_file_format ? `image/${picture.image_file_format}` : null,
          fileName: picture.image_file_name,
          upload: `${imageServer}${uid}`
        })
      }
    });

    const processedAsset = await asset.processForAllLocales();
    await processedAsset.publish();
    images[uid] = asset.sys.id;
    fs.writeFileSync(imageLog, JSON.stringify(images, null, 2));

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
    INNER JOIN alchemy_contents acc ON acc.element_id=ae.id AND acc.essence_type='Alchemy::EssenceCredit'
    INNER JOIN alchemy_essence_credits aec ON acc.essence_id=aec.id
  `);
  await pgClient.end();

  for (const picture of res.rows) {
    await migrateImage(picture);
  }
};

migrateImages();
