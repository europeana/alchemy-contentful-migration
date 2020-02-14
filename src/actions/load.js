const { pgClient, defaultLocale } = require('../support/config');
const { LangMap, localeMap, pad } = require('../support/utils');

const help = () => {
  pad.log('Usage: npm run exhibition load <urlname> [locale]');
};

const load = async(urlname, languageCode = 'en') => {
  const id = await getPageIdFromUrlName(urlname, languageCode);
  const result = await pgClient.query(pageContentQuerySql, [id]);

  const page = result.rows[0];
  const locale = localeMap[languageCode];
  page['meta_description'] = new LangMap(page['meta_description'], locale);

  for (const element of page.elements) {
    const essencesWithData = await getEssencesWithData(element.essences, locale);
    element.essences = essencesWithData;
  }

  return page;
};

const getEssencesWithData = async(essences, locale) => {
  const essencesWithData = [];
  essencesWithData.get = findEssenceByName;

  for (const essence of essences) {
    const data = await getEssenceData(essence.type, essence.id);
    const localisedData = {};
    for (const name in data) {
      localisedData[name] = new LangMap(data[name], locale);
    }
    essencesWithData.push({ ...essence, ...{ data: localisedData } });
  }

  return essencesWithData;
};

const findEssenceByName = function(name) {
  return this.find((essence) => essence.name === name);
};

const getEssenceData = async(type, id) => {
  const tableSelects = {
    'Alchemy::EssenceCredit': 'title, author, institution, url, license',
    'Alchemy::EssenceHtml': 'source',
    'Alchemy::EssencePicture': 'picture_id',
    'Alchemy::EssenceRichtext': 'body',
    'Alchemy::EssenceText': 'body'
  };

  const select = tableSelects[type] || '*';
  const tableName = type.replace('Alchemy::Essence', 'alchemy_essence_').toLowerCase() + 's';

  const sql = `select ${select} from ${tableName} where id=$1`;
  const result = await pgClient.query(sql, [id]);
  return result.rows[0];
};

const getPageIdFromUrlName = async(urlname, locale) => {
  const sql = `
    select id from alchemy_pages where urlname = $1 and language_code=$2;
  `;

  const result = await pgClient.query(sql, [urlname, locale]);
  return result.rows[0].id;
};

const getExhibitionPageUrlnames = async() => {
  const sql = `
    select
      urlname
    from
      alchemy_pages ap
    where
      ap.page_layout = 'exhibition_theme_page'
      and ap.depth = 2
      and ap.public_on is not null
      and ap.language_code = $1
    order by
      ap.public_on asc
  `;
  const result = await pgClient.query(sql, [defaultLocale.alchemy]);
  return result.rows.map((row) => row.urlname);
};

const cli = async(args) => {
  await pgClient.connect();

  const urlname = args[0];
  const languageCode = args[1];

  const data = await(load(urlname, languageCode));

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
        urlname
      from
        alchemy_pages cap
      where
        cap.parent_id = ap.id
        and cap.page_layout <> 'exhibition_credit_page'
      order by
        lft
    ) child_page_urlnames,
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
                  'partner_logo', 'link', 'label'
                )
              order by
                position,
                name
            ) essences
          from
            alchemy_elements ae
          where
            ae.page_id = ap.id
            and ae.public = 'true'
            and ae.name not in (
              'section'
            )
          order by
            language_code,
            position,
            name
        ) page_elements
    ) elements
  from
    alchemy_pages ap
  where
    ap.id = $1
`;

module.exports = {
  getPageIdFromUrlName,
  getExhibitionPageUrlnames,
  load,
  cli,
  help
};
