// TODO: move into create script

const { assetExists, assetIdForImage, loadAssetIds } = require('./assets');
const { pgClient, turndownService, contentfulManagement } = require('../support/config');
const { localeMap, pad } = require('../support/utils');

const help = () => {
  pad.log('Usage: npm run exhibition credits');
};

const fetchEssence = async(type, id) => {
  let sql;

  switch (type) {
    case 'Alchemy::EssenceText':
      sql = `select body as value from alchemy_essence_texts where id=${id}`;
      break;
    case 'Alchemy::EssencePicture':
      sql = `
        select ap.image_file_uid as value
        from alchemy_essence_pictures aep
        inner join alchemy_pictures ap on aep.picture_id=ap.id
        where aep.id=${id}
      `;
      break;
    case 'Alchemy::EssenceRichtext':
      sql = `select body as value from alchemy_essence_richtexts where id=${id}`;
      break;
    default:
      throw new Error(`Unknown type ${type}`);
  }

  const res = await pgClient.query(sql);
  if (res.rows.length === 0) return null;

  const row = res.rows[0];
  if (!row.value || row.value === '') return null;

  row['type'] = type;

  return row;
};

const contentfulAssetForAlchemyPicture = async(imageFileUid) => {
  const assetId = assetIdForImage(imageFileUid);
  if (!await assetExists(assetId)) return '';

  const asset = await contentfulManagement.environment.getAsset(assetId);

  return turndownService.turndown(`<img src="https:${asset.fields.file['en-GB'].url}"/>`);
};

const creditsFromEssences = async(essences) => {
  let credits = '';
  for (const essence of essences) {
    switch (essence.type) {
      case 'Alchemy::EssenceText':
        credits = credits + `## ${essence.value}\n`;
        break;
      case 'Alchemy::EssencePicture':
        credits = credits + await contentfulAssetForAlchemyPicture(essence.value);
        break;
      case 'Alchemy::EssenceRichtext':
        credits = credits + await turndownService.turndown(essence.value);
        break;
      default:
        throw new Error(`Unknown type ${essence.type}`);
    }
  }
  return credits;
};

const creditsFromRow = async(rowEssences) => {
  const essences = [];
  for (const essence of rowEssences) {
    const essenceData = await fetchEssence(essence.type, essence.id);
    if (essenceData) essences.push(essenceData);
  }
  return await creditsFromEssences(essences);
};

const creditExhibition = async(urlname, rows) => {
  pad.log(urlname);
  const exhibitionSlug = urlname.split('/')[0];

  const entries = await contentfulManagement.environment.getEntries({
    'content_type': 'exhibitionPage',
    'locale': 'en-GB',
    'fields.identifier': exhibitionSlug,
    'limit': 1
  });
  const entry = entries.items[0];

  if (!entry) return;
  if (!entry.fields.credits) entry.fields.credits = {};

  for (const locale in rows) {
    const contentfulLocale = localeMap[locale];
    pad.log(`- ${locale} => ${contentfulLocale}`);
    const credits = await creditsFromRow(rows[locale]);
    entry.fields.credits[contentfulLocale] = credits;
  }

  const updated = await entry.update();
  try {
    await updated.publish();
  } catch (e) {
    pad.log('Publish failed: ', e);
  }
};

const migrateCredits = async() => {
  await contentfulManagement.connect();
  await pgClient.connect();

  await loadAssetIds();

  const result = await pgClient.query(pagesSql);

  const groupedRows = {};
  for (const row of result.rows) {
    if (!groupedRows[row.urlname]) groupedRows[row.urlname] = {};
    groupedRows[row.urlname][row['language_code']] = row.essences;
  }

  for (const urlname in groupedRows) {
    await creditExhibition(urlname, groupedRows[urlname]);
  }

  await pgClient.end();
};

const cli = async() => {
  await migrateCredits();
};

const pagesSql = `
  select
    ap.urlname,
    ap.language_code,
    array(
      select
        json_build_object(
          'id', ac.essence_id, 'type', ac.essence_type
        ) essence
      from
        alchemy_elements ae
        inner join alchemy_contents ac on ac.element_id = ae.id
      where
        ap.id = ae.page_id
      order by
        ae.position,
        ac.position
    ) essences
  from
    alchemy_pages ap
  where
    depth > 1
    and page_layout = 'exhibition_credit_page'
  order by
    ap.public_on asc
`;

module.exports = {
  credits: migrateCredits,
  cli,
  help
};
