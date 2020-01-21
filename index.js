require('dotenv').config();
const contentful = require('contentful-management');
const { Client } = require('pg');
const cheerio = require('cheerio');
const fs = require('fs');
const TurndownService = require('turndown');
const turndownService = new TurndownService();
const errorLog = fs.createWriteStream('log.txt', {flags: 'w'});
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

const dryRun = false; // change to true for dryRun
//const dryRun = true;

let space;
let environment;

const cEnvironmentId = process.env.cEnvironmentId;
const cSpaceId = process.env.cSpaceId;

const cClient = contentful.createClient({
  accessToken: process.env.cAccessToken
});

const err = (s) => {
  errorLog.write(`\n${s}`);
};

const licenseLookup = (code) => {
  let res = {
  public: 'https://creativecommons.org/publicdomain/mark/1.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  CC_BY: 'https://creativecommons.org/licenses/by/1.0',
  CC_BY_SA: 'https://creativecommons.org/licenses/by-sa/1.0',
  CC_BY_ND: 'https://creativecommons.org/licenses/by-nc-nd/1.0',
  CC_BY_NC: 'https://creativecommons.org/licenses/by-nc/1.0',
  CC_BY_NC_SA: 'https://creativecommons.org/licenses/by-nc-sa/1.0',
  CC_BY_NC_ND: 'https://creativecommons.org/licenses/by-nc-nd/1.0',
  RS_INC_EDU: 'http://rightsstatements.org/vocab/InC-EDU/1.0/',
  RS_NOC_OKLR: 'http://rightsstatements.org/vocab/NoC-OKLR/1.0/',
  RS_INC: 'http://rightsstatements.org/vocab/InC/1.0/',
  RS_NOC_NC: 'http://rightsstatements.org/vocab/NoC-NC/1.0/',
  RS_INC_OW_EU: 'http://rightsstatements.org/vocab/InC-OW-EU/1.0/',
  RS_CNE: 'http://rightsstatements.org/vocab/CNE/1.0/'
  }[code];
  return res ? res : '';
};

const localeLookup = (code) => {
  let res = {
    en: 'en-GB',
    sv: 'sv-SE',
    es: 'es-ES',
    bg: 'bg-BG',
    cs: 'cs-CZ',
    da: 'da-DK',
    de: 'de-DE',
    el: 'el-GR',
    et: 'et-EE',
    eu: 'eu-ES',
    fi: 'fi-FI',
    fr: 'fr-FR',
    ga: 'ga-IE',
    hr: 'hr-HR',
    hu: 'hu-HU',
    it: 'it-IT',
    lt: 'lt-LT',
    lv: 'lv-LV',
    mt: 'mt-MT',
    nl: 'nl-NL',
    pl: 'pl-PL',
    pt: 'pt-PT',
    ro: 'ro-RO',
    sk: 'sk-SK',
    sl: 'sl-SI'
  }[code];
  return res ? res : code;
}

const adjustRecordUrl = (url) => {
  let uri;
  if (/:\/\/(www\.)?europeana\.eu\//.test(url)) {
    let reg = /\/record(\/[^\/]+\/[^\/\.\ ]+)/;
    let id = url.match(reg)[1];
    uri = 'http://data.europeana.eu/item' + id;
  } else {
    uri = url;
  }
  return uri;
};

const clean = async (deletable, recursing) => new Promise(async resolve => {
  if(dryRun){
    console.log('(skip delete)');
    return;
  }
  if(deletable.sys.publishedVersion){
    await deletable.unpublish().catch((e) => {
      console.log('error unpublishing ' + e);
    });
  }
  await deletable.delete().catch(async (e) => {
    console.log('error deleting' + e);
    if(!recursing){
      await clean(deletable, true);
    }
  });
  resolve();
});

const cleanEntries = async (type) => new Promise(async resolvecleanEntries => {

  if(dryRun){
    resolvecleanEntries();
    return;
  }

  let entries;

  if(type == 'asset'){
    entries = await environment.getAssets();
  }
  else{
    entries = await environment.getEntries({ content_type: type});
  }

  if(entries.items.length === 0){
    console.log('(no more entries to delete)');
    resolvecleanEntries();
  }
  else{
    console.log(`will remove ${entries.items.length} entries of type ${type}...`);
    await Promise.all(
        entries.items.map(async (ob, index) => {
          return new Promise(async resolve => {
            await clean(ob).catch((e) => {
              console.log('error deleting ' + type);
            });
            resolve();
          })
        })
    );
    await cleanEntries(type);
    resolvecleanEntries();
  }
});

const parseHeader = (text) => {

  let $ = cheerio.load(text)
  let h1 = $('h1');

  if(h1 && h1.length){
    let headerText = h1.text();
    // h1.remove();
    //return [headerText, $('body').children().text()];
    return [headerText, text];
  }
  return ['Exhibition Content', text];
};

const mimicAsset = (data) => {
  let result = Object.assign(
    {
      sys: { id: 1 }
    }, data);

  result.update = () => result;
  result.publish = () => result;
  return result;
};

const mimicValidate = (ob, shortTexts, longTexts) => {
  const test = (subject, arr, maxLen) => {
    arr.forEach((f) => {
      if(subject.fields[f] && subject.fields[f][locale] && subject.fields[f][locale].length > maxLen){
        throw new Error(`invalid ${f} (length > ${maxLen})`);
      }
    });
  };
  test(ob, shortTexts, maxLengthShort);
  test(ob, longTexts, maxLengthLong);
};

const writeEntry = async (type, entryData) => {
  if(dryRun){
    let mimicked = mimicAsset(entryData);
    mimicValidate(mimicked, ['creator', 'headline', 'name', 'url'], ['description', 'text']);
    return mimicked;
  }
  else{
    let entry;
    if(type == 'asset'){
      entry = await environment.createAsset(entryData);
    }
    else{
      entry = await environment.createEntry(type, entryData);
    }

    if(type != 'exhibitionPage'){

      if(type === 'asset'){
        entry = await entry.processForAllLocales();
      }
      await entry.publish().catch((e) => {
        err(`Error publishing ${type} ${entry.sys.id}: ${e}`);
      });
    }
    return entry;
  }
};

const wrapLocale = (val, l, max) => {
  return {
    [l ? l : locale]: (typeof val === 'string' && max) ? val.substr(0, max) : val
  };
};

const getObjectBase = () => {
  return { hasPart: { [locale]: [] } };
};

const getEntryLink = (id) => {
  return { sys: { type: 'Link', linkType: 'Entry', id: id }};
}

const queryBoolean = async(id) => {
  let res = await pgClient.query(`SELECT * FROM alchemy_essence_booleans where id = ${id}`);
  return res.rows && res.rows.length > 0 ? res.rows[0] : null;
};

const queryExhibitions = async(queryLocale, id, intro) => {

  const select = id ? '*, alchemy_elements.name as element_name' : 'distinct(parent_id)';
  const order = id ? 'alchemy_pages.lft, alchemy_elements.id, alchemy_elements.position' : 'parent_id asc';
  //const order = id ? 'alchemy_elements.id, alchemy_pages.id, alchemy_elements.position' : 'parent_id asc';
  const condition = id ?
      intro ?
          `and alchemy_pages.id = ${id}
       and alchemy_elements.name = 'intro'`
          :
          `and parent_id = ${id}`
      : '';

  let query = `
    select
      ${select}
    from
      alchemy_pages, alchemy_elements, alchemy_contents
    where
      alchemy_elements.page_id = alchemy_pages.id
    and
      public = true
    and
      alchemy_contents.name NOT IN ('button_text', 'text1', 'text2', 'partner_logo')
    and
      alchemy_elements.id = alchemy_contents.element_id
    and
      alchemy_pages.depth = ${intro ? 2 : 3}
    and
      alchemy_pages.page_layout = 'exhibition_theme_page'
    and
      alchemy_pages.published_at IS NOT NULL
    and
      language_code = '${queryLocale}'
    ${condition}
    order by ${order}`;

  let res = await pgClient.query(query);
  return res;
};

const queryExhibitionLangVariants = async (urlName) => {
  let query =`
    select
      distinct alchemy_pages.urlname,
               alchemy_pages.id,
               alchemy_pages.language_code,
               alchemy_pages.parent_id as exhibition_id
    from
      alchemy_pages,
      alchemy_elements
    where
      alchemy_elements.page_id = alchemy_pages.id
    and
      alchemy_pages.depth in (2, 3)
    and
      alchemy_pages.page_layout = 'exhibition_theme_page'
    and
      alchemy_pages.published_at IS NOT NULL
    and
      alchemy_elements.public = true
    and
      urlname LIKE '%${urlName}%'
    and
      language_code != 'en'
    order by
      urlname, alchemy_pages.id;`

  let res = await pgClient.query(query);
  return res.rows;
};

const queryHtml = async(id) => {
  const res = await pgClient.query(`SELECT * FROM alchemy_essence_htmls where id = ${id}`);
  return res.rows && res.rows.length > 0 ? res.rows[0].source : null;
};

const queryPicture = async(id) => {
  let res = await pgClient.query(`
    SELECT *
    FROM alchemy_pictures
    WHERE id = (
      SELECT picture_id
      FROM alchemy_essence_pictures
      WHERE picture_id IS NOT NULL
      AND id = ${id}
    )`);
  return res.rows && res.rows.length > 0 ? res.rows[0] : null;
};

const queryLink = async(id) => {
  let res = await pgClient.query(`SELECT * FROM alchemy_essence_links where link IS NOT NULL and id = ${id}`);
  return res.rows && res.rows.length > 0 ? res.rows[0] : null;
};

const queryText = async(id, rich) => {
  /*
  let table = rich ? 'alchemy_essence_richtexts' : 'alchemy_essence_texts';
  let select = rich ? `
    REGEXP_REPLACE(REGEXP_REPLACE(stripped_body, '[\u0080-\u00ff]', '', 'g') , '\s+', '') as body`
    : `REGEXP_REPLACE(REGEXP_REPLACE(body, '[\u0080-\u00ff]', '', 'g') , '\s+', '') as body`
  let lengthCondition = rich ? `
    length(REGEXP_REPLACE(REGEXP_REPLACE(stripped_body, '[\u0080-\u00ff]', '', 'g') , '\s+', '')) > 0`
    : `length(REGEXP_REPLACE(REGEXP_REPLACE(body, '[\u0080-\u00ff]', '', 'g') , '\s+', '')) > 0`

  let res = await pgClient.query(`SELECT ${select} FROM ${table} where id = ${id} and ${lengthCondition}`);
  return res.rows && res.rows.length > 0 ? res.rows[0].body : null;
  */

  let table = rich ? 'alchemy_essence_richtexts' : 'alchemy_essence_texts';
  let res = await pgClient.query(`SELECT * FROM ${table} where id = ${id} and length(body) > 0`);

  return res.rows && res.rows.length > 0 ? res.rows[0].body : null;
};

const getImageCredit = async (rows, id) => {
  let creditRow = rows.filter(row => {
    return row.element_id === id
        && row.essence_type === 'Alchemy::EssenceCredit'
  })[0];

  if(creditRow){
    let res = await pgClient.query(`SELECT * FROM alchemy_essence_credits where id = ${creditRow.essence_id}`);
    return res.rows && res.rows.length > 0 ? res.rows[0] : null;
  }
};

const getPictureCredit = async(picEssenceId, rows, elementId) => {
  return new Promise(async resolveAll => {
    await Promise.all([
      new Promise(async (resolve) => {
        let picture = await queryPicture(picEssenceId);
        resolve(picture);
      }),
      new Promise(async (resolve) => {
        let credit = await getImageCredit(rows, elementId);
        resolve(credit);
      })
    ])
        .then((data) => {
          resolveAll(data);
        });
  });
};

const processEmbedRow = async (row, cObject, name) => {
  let htmlSrc = await queryHtml(row.essence_id);
  if(htmlSrc){
    const rt = await writeEntry('embed', { fields: { name: wrapLocale(name), embed: wrapLocale(htmlSrc) } });
    cObject.hasPart[locale].push(getEntryLink(rt.sys.id));
  }
};

const processImageRow = async (row, cObject, cache, isIntro, pc) => {

  let picture = pc[0];
  let credit = pc[1];

  if(!credit.url){
    err(`Missing rights for ${credit.title} (essence_id ${row.essence_id}, element_id: ${row.element_id})`);
  }
  else if(credit.url.length > maxLengthShort){
    err(`Cropped credits url ${credit.url} for ${credit.title} (essence_id ${row.essence_id}, element_id: ${row.element_id})`);
  }

  let asset = await writeEntry('asset', {
    fields: {
      title: wrapLocale(credit.title, null, maxLengthShort),
      file: wrapLocale({
        contentType: 'image/jpeg',
        fileName: picture.image_file_uid,
        upload: `${imageServer}${encodeURIComponent(picture.image_file_uid)}`
      })
    }
  });

  let imageObject = {
    fields: {
      name: wrapLocale(credit.title, null, maxLengthShort),
      creator: wrapLocale(credit.author, null, maxLengthShort),
      image: {
        [locale]: {
          sys: {
            type: 'Link',
            linkType: 'Asset',
            id: asset.sys.id
          }
        }
      },
      url: wrapLocale(adjustRecordUrl(credit.url), null, maxLengthShort),
      provider: wrapLocale(credit.institution, null, maxLengthShort),
      license: wrapLocale(licenseLookup(credit.license))
    }
  };
  //TODO: 'MISSING', 'LInk Error' urls needs to be mapped to ''/null,
  // strings need to be trimmed. Best to compare against validation regex.
  imageObject.fields.url = wrapLocale(adjustRecordUrl(credit.url), null, maxLengthShort);
  imageObject = await writeEntry('imageWithAttribution', imageObject);

  if(row.element_name === 'image_compare'){
    if(cache.imageCompare){
      let imageCompare = await writeEntry('imageComparison', {
        fields: {
          hasPart: wrapLocale([
            getEntryLink(cache.imageCompare.sys.id),
            getEntryLink(imageObject.sys.id)
          ])
        }
      });
      cObject.hasPart[locale].push(
          getEntryLink(imageCompare.sys.id)
      );
      cache.imageCompare = false;
    }
    else{
      cache.imageCompare = imageObject;
    }
  }
  else if(!cObject.primaryImageOfPage){
    cObject.primaryImageOfPage = {
      [locale]: getEntryLink(imageObject.sys.id)
    };
  }
  else{
    if(!isIntro){
      cObject.hasPart[locale].push(getEntryLink(imageObject.sys.id));
    }
    else{
      err(`Image will not be saved: ${picture.image_file_uid}`);
    }
  }

};

const processTextRow = async (row, cObject, isIntro) => {

  let text = await queryText(row.essence_id, row.essence_type === 'Alchemy::EssenceRichtext');

  if(!text){
    return;
  }
  text = text.trim();

  if(row.name === 'title'){
    if(!cObject.name){
      cObject.name = wrapLocale(text, null, maxLengthShort);
    }
    else{
      const rt = await writeEntry('richText', { fields: { headline: wrapLocale(text, null, maxLengthShort) } });
      cObject.hasPart[locale].push(getEntryLink(rt.sys.id));
    }
  }
  else if(row.name === 'sub_title'){
    if(!cObject.headline){
      cObject.headline = wrapLocale(text, null, maxLengthShort);
    }
  }
  else if(row.name === 'body' && isIntro) {
    const splitText = parseHeader(text);
    if (!cObject.description) {
      if (splitText) {
        if (isIntro) {
          cObject.text = wrapLocale(turndownService.turndown(splitText[1]), null, maxLengthLong);
        } else {
          cObject.description = wrapLocale(turndownService.turndown(splitText[1]), null, maxLengthShort);
        }
      } else {
        cObject.description = wrapLocale(text, null, maxLengthShort);
      }
    }
  }
  else if(cObject.hasPart){
    if(!isIntro){
      const splitText = parseHeader(text);
      rt = await writeEntry('richText', { fields:
            splitText ? {
              headline: wrapLocale(splitText[0], null, maxLengthShort),
              text: wrapLocale(turndownService.turndown(splitText[1]), null, maxLengthLong)
            } : {
              headline: wrapLocale(`Exhibition content for ${row.title}`, null, maxLengthShort),
              text: wrapLocale(turndownService.turndown(text), null, maxLengthLong)
            }
      });
      cObject.hasPart[locale].push(getEntryLink(rt.sys.id));
    }
  }
};

const processRows = async (rows, locales, intro) => {

  let rowIndex = 0;
  let objectReferences = [];
  let cObject  = getObjectBase();
  let cCache   = {};
  let rowTitle = rows[0].title.trim();

  while(rowIndex < rows.length){

    let startNew = rows[rowIndex].title.trim() !== rowTitle;
    let emptyData = JSON.stringify(cObject) === JSON.stringify(getObjectBase());
    let endSection = startNew && !emptyData;

    const fnEndSection = async () => {

      console.log('Write Exhibition (' + rowTitle + ')');

      let entryType   = intro ? 'exhibitionPage' : 'exhibitionChapterPage';
      let urlRowIndex = Math.max(0, rowIndex-1);
      let urlName     = rows[urlRowIndex].urlname.substr(0, maxLengthShort);
      let idData      = { identifier: wrapLocale(urlName) };

      /* locales / experiment */

      if(locales){
        Object.keys(locales).filter((key) => {
          return locales[key][urlRowIndex] ?
              locales[key][urlRowIndex].urlname === urlName : urlName;
        })
            .forEach((key) => {
                  idData.identifier = Object.assign(idData.identifier, { [localeLookup(key)] : urlName });
                }
            ); //console.log('\tlocalised identifier:\n\t\t' + JSON.stringify(idData));
      }

      /* end locales / experiment */

      let entryData = Object.assign(cObject, idData);
      let exhibitionObject = await writeEntry(entryType, { fields: entryData });

      objectReferences.push(exhibitionObject);

      cObject = getObjectBase();
      cCache = {};
    }

    if(endSection){
      await fnEndSection();
    }

    rowTitle = rows[rowIndex].title.trim();

    let row = rows[rowIndex];

    if(row.essence_type === 'Alchemy::EssenceHtml'){
      await processEmbedRow(row, cObject, `Exhibition content for ${rowTitle}`);
    }
    else if(row.essence_type === 'Alchemy::EssencePicture'){

      let pc = await getPictureCredit(row.essence_id, rows, row.element_id);

      if(pc[0] && pc[1]){
        await processImageRow(row, cObject, cCache, intro, pc);
      }
    }
    else if(row.essence_type.match(/Alchemy::Essence(Richt)?(T)?ext/)){
      let rtName;
      await processTextRow(row, cObject, intro);
    }

    if(rowIndex + 1 === rows.length){
      await fnEndSection();
    }

    rowIndex ++;
  }
  return objectReferences;
};

const smartDelete = async (itemId, recurseLevel = 0) => {

  const pad     = '\t'.repeat(recurseLevel);
  const loc2arr = (loc) => {
    let res = [];
    Object.keys(loc).forEach((key) => {
      res.push(loc[key])
    });
    return res;
  };

  let entry = await environment.getEntry(itemId).catch((e) => {
    console.log(`couldn't load entry: ${itemId}`);
  });

  if(!entry){
    console.log(`no entry - return`);
    return;
  }

  let fNames = Object.keys(entry.fields);

  if(entry.sys.contentType.sys.id === 'richText'){
    console.log(`${pad}(delete rich text)`);
    await clean(entry).catch((e) => {
      console.log(`${pad}error deleting rich text ${entry.sys.id}`);
    });
  }
  else if(entry.sys.contentType.sys.id === 'imageComparison'){
    console.log(`${pad}(delete image comparison)`);
    let hasPartList = loc2arr(entry.fields.hasPart);
    hasPartList.forEach(async (hpArr) => {
      hpArr.forEach(async (hp) => {
        await smartDelete(hp.sys.id, recurseLevel + 1);
      });
    });

    await clean(entry).catch((e) => {
      console.log(`${pad}error deleting image comparison ${entry.sys.id}`);
    });
  }
  else if(entry.sys.contentType.sys.id === 'embed'){
    console.log(`${pad}(delete embed)`);
    await clean(entry).catch((e) => {
      console.log(`${pad}error deleting embed ${entry.sys.id}`);
    });
  }
  else if(entry.sys.contentType.sys.id === 'imageWithAttribution'){
    console.log(`${pad}(delete attributed image ${entry.fields.name[locale]})`);
    let arr = loc2arr(entry.fields.image);
    arr.forEach(async (arrItem) => {
      let asset = await environment.getAsset(arrItem.sys.id).catch((e) => {
        console.log(`couldn't get asset ${arrItem.sys.id}`);
      });
      if(asset){
        await clean(asset).catch((e) => {
          console.log(`${pad}error deleting asset ${arrItem.sys.id}`)
        });
      }
    });
    await clean(entry).catch((e) => {
      console.log(`${pad}error deleting attributed image ${entry.sys.id}`);
    });
  }
  else {
    console.log(`${pad}(delete chapter...)`);
    let hasPartList = loc2arr(entry.fields.hasPart);
    hasPartList.forEach(async (hpArr) => {
      hpArr.forEach(async (hp) => {
        await smartDelete(hp.sys.id, recurseLevel + 1);
      });
    });

    let heroList = loc2arr(entry.fields.primaryImageOfPage);
    heroList.forEach(async (h) => {
      await smartDelete(h.sys.id, recurseLevel + 1);
    })

    await clean(entry).catch((e) => {
      console.log(`${pad}error deleting chapter ${entry.sys.id}`);
    });
  }
}

const runAll = async () =>  {

  let startTime = new Date().getTime();

  space       = await cClient.getSpace(cSpaceId);
  environment = await space.getEnvironment(cEnvironmentId);
  let ex      = await environment.getEntries({ content_type: 'exhibitionPage'});

  ex.items.forEach(async (item) => {
    await smartDelete(item.sys.id);
  });

  await pgClient.connect();

  let resArr = await queryExhibitions('en');
  resArr = resArr.rows.map(x => x.parent_id);

  console.log(resArr);

  resArr = resArr.reverse();

  let completeCount = 0;

  await Promise.all(
      resArr.map(async (exId) => {
        return new Promise(async resolve => {
          await run(exId);
          completeCount ++;
          const pct = parseInt((completeCount / resArr.length) * 100);
          console.log(`\n\t\t--> written exhibition ${exId}\t ${pct}%\t(${completeCount} of ${resArr.length})`);
          resolve();
        })
      })
  );
  let endTime = new Date().getTime();
  console.log(startTime)
  console.log(endTime)
  let totalTime = parseInt((endTime - startTime) / 1000);
  let seconds = parseInt(totalTime % 60);
  let minutes = parseInt(totalTime / 60);

  console.log(`\ndone in ${minutes} minute${minutes == 1 ? '' : 's'} and ${seconds} second${seconds == 1 ? '' : 's'}!\n`);

  errorLog.end('');
  await pgClient.end();
};

const run = async(exhibitionId) =>  {

  const res = await queryExhibitions('en', exhibitionId);

  if(res.rows.length > 0){

    var pDate = new Date(res.rows[0].public_on);

    console.log(`\t...will process ${res.rows.length} rows for ${res.rows[0].urlname.split('/').reverse().pop()}\n\t > ${pDate.toLocaleDateString('en-GB')}\n`);


    /* locales / experimental */
    let locales  = {};
    /*
    let variants = await queryExhibitionLangVariants(res.rows[0].urlname);

    if(variants.length > 0){

      console.log(`\tVariant${variants.length == 1 ? '' : 's' } of "${res.rows[0].urlname.split('/').reverse().pop()}":\n`);

      await Promise.all(
        variants.map(async (r) => {
          return new Promise(async resolve => {
            const localeRows = await queryExhibitions(r.language_code, r.exhibition_id);
            locales[r.language_code] = localeRows.rows;
            resolve(`\t - [${r.language_code}] (${localeRows.rows.length} rows):\t${localeRows.rows[0].title.trim()}`);
          })
        })
      ).then((debug) => {
        console.log(`\tVariant${variants.length == 1 ? '' : 's' } of "${res.rows[0].title.trim()}":\n${debug.join('\n')}`);
      });
    }
    */
    /* end locales / experimental */

    let chapterRefs = await processRows(res.rows, locales);
    let introRows = await queryExhibitions('en', exhibitionId, true);

    if(introRows.rows.length > 0){

      console.log(`${introRows.rows.length} intros found for ${exhibitionId}`);

      let intro = await processRows(introRows.rows, null, true);
      intro = intro[0];

      if(!intro.fields.hasPart){
        intro.fields.hasPart = getObjectBase().hasPart;
      }

      if(dryRun && !intro.update){
        intro.update = () => {
          mimicValidate(intro, ['name'], ['description']);
        };
      }

      if(chapterRefs && chapterRefs.length){
        chapterRefs.reverse();

        console.log(`Link ${chapterRefs.length} refs...`);

        while(chapter = chapterRefs.pop()){
          intro.fields.hasPart[locale].push(getEntryLink(chapter.sys.id));
        }
        //await intro.update();
        intro = await intro.update();
        intro.publish();
      }
    }
  }
  else{
    console.log('No data for ' + exhibitionId);
  }
};
runAll();
