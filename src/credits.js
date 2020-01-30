const { pgClient, turndownService } = require('./config');

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

const creditsFromEssences = async(essences) => {
  let credits = '';
  for (const essence of essences) {
    switch (essence.type) {
      case 'Alchemy::EssenceText':
        credits = credits + await turndownService.turndown(`<h2>${essence.value}</h2>`);
        break;
      case 'Alchemy::EssencePicture':
        // TODO: update with actual Contentful asset URL from tmp/images.json
        credits = credits + await turndownService.turndown(`<img src="${essence.value}" alt=""/>`);
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

const pagesFromRows = async(rows) => {
  const pages = [];
  for (const row of rows) {
    const essences = [];
    for (const essence of row.essences) {
      const essenceData = await fetchEssence(essence.type, essence.id);
      if (essenceData) essences.push(essenceData);
    }
    const credits = await creditsFromEssences(essences);

    const page = {
      urlname: row.urlname,
      language_code: row['language_code'],
      credits
    };

    pages.push(page);
  }
  return pages;
};

const run = async() => {
  await pgClient.connect();

  const result = await pgClient.query(pagesSql);
  const pages = await pagesFromRows(result.rows);

  console.log(JSON.stringify(pages, null, 2));

  await pgClient.end();
};

run();
