const { imageLog, pgClient, turndownService, contentfulClient } = require('./config');
let contentfulConnection;

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
    and urlname like '%/credits'
    and language_code='en'
  order by
    ap.urlname,
    ap.language_code
`;

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
  const uid = encodeURIComponent(imageFileUid);
  const assetId = imageLog[uid];
  if (!assetId) return '';

  const asset = await contentfulConnection.getAsset(assetId);

  return turndownService.turndown(`<img src="https:${asset.fields.file['en-GB'].url}"/>`);
};

const creditsFromEssences = async(essences) => {
  let credits = '';
  for (const essence of essences) {
    switch (essence.type) {
      case 'Alchemy::EssenceText':
        credits = credits + await turndownService.turndown(`<h2>${essence.value}</h2>`);
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

const pageFromRow = async(row) => {
  const essences = [];
  for (const essence of row.essences) {
    const essenceData = await fetchEssence(essence.type, essence.id);
    if (essenceData) essences.push(essenceData);
  }
  const credits = await creditsFromEssences(essences);

  const page = {
    urlname: row.urlname,
    'language_code': row['language_code'],
    credits
  };

  return page;
};

const creditExhibition = async(page) => {
  const exhibitionSlug = page.urlname.split('/')[0];

  const entries = await contentfulConnection.getEntries({
    'content_type': 'exhibitionPage',
    'locale': 'en-GB',
    'fields.identifier': exhibitionSlug,
    'limit': 1
  });
  const entry = entries.items[0];

  if (!entry.fields.credits) entry.fields.credits = {};
  // TODO: add localisation handling
  entry.fields.credits['en-GB'] = page.credits;
  const updated = await entry.update();
  await updated.publish();
};

const run = async() => {
  contentfulConnection = await contentfulClient.connect();
  await pgClient.connect();

  const result = await pgClient.query(pagesSql);

  for (const row of result.rows) {
    console.log(row.urlname, row['language_code']);
    const page = await pageFromRow(row);
    await creditExhibition(page);
    // console.log(JSON.stringify(page, null, 2));
  }

  await pgClient.end();
};

run();
