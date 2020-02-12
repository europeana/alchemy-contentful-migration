const { pgClient } = require('../support/config');
const { LangMap, localeMap, pad } = require('../support/utils');

const help = () => {
  console.log('Usage: npm run exhibition load <urlname> [locale]');
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

const translate = async(page) => {
  for (const otherLanguage of page['other_language_codes']) {
    await translateTo(page, otherLanguage);
  }
  return page;
};

// TODO: move to own action file, translate.js
const translateTo = async(page, toLanguageCode) => {
  const fromLocale = localeMap[page['language_code']];
  const toLocale = localeMap[toLanguageCode];

  pad.log(`Translating "${page.urlname}" from "${fromLocale}" to "${toLocale}"...`);

  const translatedPage = await load(page.urlname, toLanguageCode);

  try {
    pageTranslationAligned(page, translatedPage);
    pad.log('  ...translations align');
  } catch (e) {
    pad.log(`  ...translations do not align: ${e.message}`);
    return;
  }

  if (page['meta_description'][fromLocale] !== translatedPage['meta_description'][toLocale]) {
    page['meta_description'][toLocale] = translatedPage['meta_description'][toLocale];
  }

  for (let elementIndex = 0; elementIndex < page.elements.length; elementIndex++) {
    const element = page.elements[elementIndex];
    const translatedElement = translatedPage.elements[elementIndex];

    for (let essenceIndex = 0; essenceIndex < element.essences.length; essenceIndex++) {
      const essence = element.essences[essenceIndex];

      const translatedEssence = translatedElement.essences[essenceIndex];

      for (const name in essence.data) {
        if (essence.data[name][fromLocale] !== translatedEssence.data[name][toLocale])
          essence.data[name][toLocale] = translatedEssence.data[name][toLocale];
      }
    }
  }

  // if (!page.translatedTo) page.translatedTo = [];
  // page.translatedTo.push(toLocale);

  return page;
};

// TODO: custom Error class to prevent false positive catches in `translate`
const pageTranslationAligned = (page, translatedPage) => {
  if (page.elements.length !== translatedPage.elements.length)
    throw new Error(`Element count mismatch: ${page.elements.length}, ${translatedPage.elements.length}`);

  for (let elementIndex = 0; elementIndex < page.elements.length; elementIndex++) {
    const element = page.elements[elementIndex];
    const translatedElement = translatedPage.elements[elementIndex];

    if (element.name !== translatedElement.name)
      throw new Error(`Element name mismatch: ${element.name}, ${translatedElement.name}`);
    if (element.essences.length !== translatedElement.essences.length)
      throw new Error(`Element "${element.name}" essence count mismatch: ${element.essences.length}, ${translatedElement.essences.length}`);

    for (let essenceIndex = 0; essenceIndex < element.essences.length; essenceIndex++) {
      const essence = element.essences[essenceIndex];
      const translatedEssence = translatedElement.essences[essenceIndex];

      if (essence.name !== translatedEssence.name)
        throw new Error(`Element "${element.name}" essence name mismatch: ${essence.name}, ${translatedEssence.name}`);
    }
  }

  return true;
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

const cli = async(args) => {
  await pgClient.connect();

  const data = await(load(args[0], args[1]));
  await translate(data);

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
  load,
  cli,
  help
};
