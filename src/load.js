const { pgClient } = require('./config');

const load = async(pgClient, id) => {
  const result = await pgClient.query(pageContentQuerySql, [id]);

  const content = result.rows[0];

  for (const element of content.elements) {
    const essencesWithData = {};
    for (const essence of element.essences) {
      const data = await getEssenceData(essence.type, essence.id);
      essencesWithData[essence.name] = { ...essence, ...data };
    }
    element.essences = essencesWithData;
  }

  return content;
};

const getEssenceData = async(type, id) => {
  const tableName = type.replace('Alchemy::Essence', 'alchemy_essence_').toLowerCase() + 's';
  const sql = `select * from ${tableName} where id=$1`;
  const result = await pgClient.query(sql, [id]);
  return result.rows[0];
};

const cli = async(args) => {
  await pgClient.connect();
  const data = await(load(pgClient, args[0]));
  await pgClient.end();
  console.log(JSON.stringify(data, null, 2));
};

const pageContentQuerySql = `
  select
    ap.id,
    ap.urlname,
    ap.language_code,
    ap.depth,
    ap.meta_description,
    ap.public_on,
    array(
      select
        other_language_ap.language_code
      from
        alchemy_pages other_language_ap
      where
        other_language_ap.urlname = ap.urlname
        and other_language_ap.language_code <> ap.language_code
      order by
        language_code
    ) other_language_codes,
    array(
      select
        id
      from
        alchemy_pages cap
      where
        cap.parent_id = ap.id
      order by
        lft
    ) child_ids,
    array(
      select
        json_build_object(
          'name', name, 'position', position,
          'essences', essences
        ) elements
      from
        (
          select
            ae.name,
            ae.position,
            array(
              select
                json_build_object(
                  'name', name, 'type', essence_type,
                  'id', essence_id, 'position', position
                ) essence
              from
                alchemy_contents
              where
                element_id = ae.id
                and name not in (
                  'image_alignment', 'hide_in_credits',
                  'button_text', 'text1', 'text2',
                  'partner_logo'
                )
              order by
                position
            ) essences
          from
            alchemy_elements ae
          where
            ae.page_id = ap.id
            and ae.public = 'true'
          order by
            language_code,
            position
        ) page_elements
    ) elements
  from
    alchemy_pages ap
  where
    ap.id = $1
`;

module.exports = {
  load,
  cli
};
