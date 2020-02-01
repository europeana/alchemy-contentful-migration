require('dotenv').config();
const contentful = require('contentful-management');
const { Client } = require('pg');
const cheerio = require('cheerio');
const fs = require('fs');
const TurndownService = require('turndown');
const turndownService = new TurndownService();
const errorLog = fs.createWriteStream('log.txt', {flags: 'w'});
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
const runTranslations = true;
const runTranslationsAllowsReordering = true;

let space;
let environment;
let fakeId = 1;
let imageSysIds;
let entryCache = {};

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
    resolve();
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

const parseHeader = (text) => {

  let $ = cheerio.load(text)
  let h1 = $('h1');

  if(h1 && h1.length){
    let headerText = h1.text();
    return [headerText, text];
  }
  return ['Exhibition Content', text];
};

function FakeEntry(type, fieldData){
  fakeId ++;
  this.fields = fieldData.fields;

  const debugField = (fName, indented) => {
    const pad = indented ? 10 * indented : 10;
    const maxLineLength = 80;
    const f = this.fields[fName];
    let res = '';
    if(f){
      if(fName === 'hasPart'){
        console.log(`${''.padEnd(pad)}${fName} (${this.fields.hasPart[locale].length})`);
        this.fields.hasPart[locale].forEach((part) => entryCache[part.sys.id].debug(indented + 1));
      }
      else if(fName === 'image'){
        console.log(`${''.padEnd(pad)}${'asset'.padEnd(pad)}\t${f[locale].sys.id}`);
      }
      else if(fName === 'primaryImageOfPage'){
        console.log(`${''.padEnd(pad)}${fName}`);
        if(this.fields.primaryImageOfPage){
          entryCache[this.fields.primaryImageOfPage[locale].sys.id].debug(indented + 2);
        }
      }
      else if(type === 'imageComparison'){
        console.log(`${''.padEnd(pad)}${fName}`);
        this.fields.hasPart[locale].forEach((part) => entryCache[part.sys.id].debug(indented + 1));
      }
      else{
        res = fName.padEnd(pad);
        const keys = Object.keys(f);
        keys.forEach((key) => {
          var suffix = f[key].length > maxLineLength ? '...' : '';
          res += '\n'.padEnd(pad * 2) + key + '\t' + `${f[key]}`.replace(/\n/g, '').substr(0, maxLineLength) + suffix;
        });
      }
    }
    else{
      res += '\n'.padEnd(pad * 2) + 'undefined';
    }
    return ''.padEnd(pad) + res;
  };

  this.sys = {
    id: fakeId,
    version: 1
  };
  this.update = () => {
    this.sys.version += 1;
    //console.log(`update ${type} [id: ${this.sys.id}]`);
    // this.debug();
    return this;
  };
  this.publish = () => {
    this.sys.version += 1;
    return this;
  };
  this.validate = () => {
    console.log(`validate ${this.sys.id}...`);
  };
  this.debug = (indented = 0) => {
    console.log((indented ? ''.padEnd(10 * indented) : 'DBUG: ') + `${type} [id: ${this.sys.id}]`);
    Object.keys(this.fields).forEach((f) => {
      console.log(debugField(f, indented));
    });
  };
  entryCache[this.sys.id] = this;
};

const mimicValidate = (ob, shortTexts, longTexts) => {
  const test = (subject, arr, maxLen) => {
    arr.forEach((f) => {
      if(subject.fields && subject.fields[f] && subject.fields[f][locale] && subject.fields[f][locale].length > maxLen){
        throw new Error(`invalid ${f} (length > ${maxLen})`);
      }
    });
  };
  test(ob, shortTexts, maxLengthShort);
  test(ob, longTexts, maxLengthLong);
};

const writeEntry = async (type, entryData) => {
  if(dryRun){
    if(type.match(/Exhibition[\s\S]*Page/)){
      mimicValidate(mimicked, ['creator', 'headline', 'name', 'url'], ['description', 'text']);
    }
    return new FakeEntry(type, entryData);
  }
  else{
    let entry;
    entry = await environment.createEntry(type, entryData);
    if(type != 'exhibitionPage'){
      entry.publish().catch((e) => {
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

const queryExhibitions = async(queryLocale, id, intro, crossLocale) => {

  const select = id ? '*, alchemy_elements.name as element_name' : 'distinct(parent_id)';
  const order = id ? 'alchemy_pages.lft, alchemy_elements.id, alchemy_elements.position, alchemy_contents.position' : 'parent_id asc';

  //const order = id ? 'alchemy_elements.id, alchemy_pages.id, alchemy_elements.position' : 'parent_id asc';
  const condition = id ?
      intro ?
        crossLocale ? `and alchemy_elements.name = 'intro'`
          : `and alchemy_pages.id = ${id} and alchemy_elements.name = 'intro'`
        : `and parent_id = ${id}`
      : '';

  let query = `
    select
      ${select}
    from
      alchemy_pages, alchemy_elements, alchemy_contents
    where
      alchemy_elements.page_id = alchemy_pages.id
    and
      alchemy_elements.id = alchemy_contents.element_id
    and
      public = true
    and
      alchemy_pages.depth = ${intro ? 2 : 3}
    and
      alchemy_pages.page_layout = 'exhibition_theme_page'
    and
      alchemy_pages.published_at IS NOT NULL
    and
      alchemy_contents.name NOT IN ('button_text', 'text1', 'text2', 'partner_logo')
    and
      alchemy_contents.essence_type in ('Alchemy::EssenceHtml', 'Alchemy::EssencePicture', 'Alchemy::EssenceRichtext', 'Alchemy::EssenceCredit')
    and
      language_code = '${queryLocale}'
    ${condition}
    order by ${order}`;

  let res = await pgClient.query(query).catch((e) => {
    console.log(`Error ${e} running query\n\t${query}`);
  });
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
      alchemy_pages.urlname = '${urlName}'
    and
      language_code != 'en'
    order by
      urlname, alchemy_pages.id;`

  let res = await pgClient.query(query).catch((e) => {
    console.log(`Error querying languaguage variants:\n\t${query}\n\t\t${e}\n`);
  });
  return res ? res.rows : null;
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

const queryTitle = async (urlName, locale) => {
  let query = `
    select
      ac.id, ae.id, ap.id, essence_id, *
    from
      alchemy_contents ac, alchemy_elements ae, alchemy_pages ap
    where
      ae.name = 'intro'
    and
      ae.id = ac.element_id
    and
      ae.page_id = ap.id
    and
      essence_type = 'Alchemy::EssenceText'
    and
      language_code = '${locale}'
    and
      urlname = '${urlName}'`;
  let res = await pgClient.query(query);

  if(res.rows && res.rows.length > 0){
    let result = await queryText(res.rows[0].essence_id);
    return result;
  }
  else{
    return null;
  }
}

const queryText = async(id, rich) => {
  let table = rich ? 'alchemy_essence_richtexts' : 'alchemy_essence_texts';
  let res = await pgClient.query(`SELECT * FROM ${table} where id = ${id} and length(body) > 0`);
  return res.rows && res.rows.length > 0 ? res.rows[0].body : null;
};

const getImageCredit = async (essence_id) => {
  let res = await pgClient.query(`SELECT * FROM alchemy_essence_credits where id = ${essence_id}`);
  let resChecked = res.rows && res.rows.length > 0 ? res.rows[0] : null;

  if(resChecked){
    let reg = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!-\/]))?$/;
    let urlX = resChecked.url.trim();
    let valid = urlX.match(reg);
    resChecked.url = valid ? urlX : '';

    if(!valid){
      err('Invalid image credit url: ' + urlX);
    }
  }
  return resChecked;
};

const getPictureCredit = async(picEssenceId, rows, elementId, image_2) => {
  return new Promise(async resolveAll => {
    await Promise.all([
      new Promise(async (resolve) => {
        let picture = await queryPicture(picEssenceId);
        resolve(picture);
      }),
      new Promise(async (resolve) => {
        let essenceId;
        rows = rows.filter(row => {
          return row.element_id === elementId
              && row.essence_type === 'Alchemy::EssenceCredit'
              && (image_2 ? row.name === 'image_2_credit' : row.name !== 'image_2_credit')
        });

        if(rows.length > 0){
          let credit = await getImageCredit(rows[0].essence_id);
          resolve(credit);
        }
        else{
          resolve(null)
        }
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

  let assetSysId = imageSysIds[encodeURIComponent(picture.image_file_uid)];

  if(!assetSysId){
    let msg = `Missing asset for ${picture.image_file_uid}\n\t${encodeURIComponent(picture.image_file_uid)}`;
    console.log(msg);
    err(`Missing asset for: ${picture.image_file_uid}`);
    return;
  }

  let imageObject = {
    fields: {
      name: wrapLocale(credit.title, null, maxLengthShort),
      creator: wrapLocale(credit.author, null, maxLengthShort),
      image: {
        [locale]: {
          sys: {
            type: 'Link',
            linkType: 'Asset',
            id: assetSysId
          }
        }
      },
      provider: wrapLocale(credit.institution, null, maxLengthShort),
      license: wrapLocale(licenseLookup(credit.license))
    }
  };

  if(credit.url && credit.url.length > 0){
    imageObject.fields.url =  wrapLocale(adjustRecordUrl(credit.url), null, maxLengthShort);
  }

  imageObject = await writeEntry('imageWithAttribution', imageObject);

  if(row.element_name === 'image_compare'){
    if(cache.imageCompare){
      let icTitle = [
        cache.imageCompare.fields.name[locale],
        imageObject.fields.name[locale]
      ].join(' / ');

      let imageCompare = await writeEntry('imageComparison', {
        fields: {
          name: wrapLocale(icTitle, null, maxLengthShort),
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

const processTextRow = async (row, cObject, isIntro, localeData) => {

  let text = await queryText(row.essence_id, row.essence_type === 'Alchemy::EssenceRichtext');

  if(!text){
    return;
  }
  text = text.trim();

  /*
  if(row.name === 'title' && isIntro){
    console.log('TODO: handle titles for intros');
    if(!cObject.name){
      cObject.name = wrapLocale(text, null, maxLengthShort);
    }
  }
  else if(row.name === 'sub_title' && isIntro){
    console.log('TODO: handle subtitle localisations');
    if(!cObject.headline){
      cObject.headline = wrapLocale(text, null, maxLengthShort);
    }
  }*/
  if(row.name === 'title'){}
  else if(row.name === 'sub_title'){}
  else if(row.name === 'body' && isIntro) {
    const splitText = parseHeader(text);
    if (splitText) {
      cObject.text = wrapLocale(turndownService.turndown(splitText[1]), null, maxLengthLong);
    }
  }
  else if(cObject.hasPart && !isIntro){

    const splitText = parseHeader(text);
    const rtHeadline = splitText ? splitText[0] : `Exhibition content for ${row.title}`;
    const rtText = splitText ? splitText[1] : text;
    let headlineOb = wrapLocale(rtHeadline, null, maxLengthShort);
    let textOb = wrapLocale(turndownService.turndown(rtText), null, maxLengthLong);

    let rt = {
      fields: {
        headline: headlineOb,
        text: textOb
      }
    }

    if(localeData){
      let locs = Object.keys(localeData);

      while(loc = locs.pop()){

        let tData = localeData[loc];
        if(tData){
          const tText = await queryText(tData.essence_id, tData.essence_type === 'Alchemy::EssenceRichtext');
          if(tText){
            const splitTText = parseHeader(tText);
            const ttHeadline = splitTText ? splitTText[0] : `Exhibition content for ${row.title}`;
            const ttText = splitTText ? splitTText[1] : text;

            rt.fields.headline[localeLookup(loc)] = ttHeadline.substr(0, maxLengthShort);
            rt.fields.text[localeLookup(loc)] = turndownService.turndown(tText.substr(0, maxLengthLong));
          }
        }
      }
    }

    let savedRT = await writeEntry('richText', rt);

    cObject.hasPart[locale].push(getEntryLink(savedRT.sys.id));
    if(dryRun){
      entryCache[savedRT.sys.id] = savedRT;
    }
  }
};

const setTitleData = async (cObject, urlName, locales, intro) => {

  let title = await queryTitle(urlName, 'en');
  let titles = wrapLocale(title, null, maxLengthShort);

  if(locales){
    let locs = Object.keys(locales);
    while(loc = locs.pop()){
      let title = await queryTitle(urlName, loc);
      titles[localeLookup(loc)] = title;
    }
  }
  if(cObject.name){
    throw new Error('setTitleData (intro: ' + intro + '): name already present: ' + JSON.stringify(cObject.name));
  }
  else{
    cObject.name = titles;
  }
}

const processRows = async (rows, locales, intro) => {

  let rowIndex = 0;
  let cObject  = getObjectBase();
  let cCache   = {};
  let rowTitle = rows[0].title.trim();

  while(rowIndex < rows.length){

    let row = rows[rowIndex];
    rowTitle = row.title.trim();
    let description = row.meta_description;

    if(description && !cObject.description){
      cObject.description = wrapLocale(description, null, maxLengthLong);
    }

    if(row.essence_type === 'Alchemy::EssenceHtml'){
      await processEmbedRow(row, cObject, `Exhibition content for ${rowTitle}`);
    }
    else if(row.essence_type === 'Alchemy::EssencePicture'){
      let pc = await getPictureCredit(row.essence_id, rows, row.element_id, row.name === 'image_2');
      if(pc[0] && pc[1]){
        await processImageRow(row, cObject, cCache, intro, pc);
      }
    }
    else if(row.essence_type.match(/Alchemy::EssenceRichtext/)){
      let rowInAllLocales = {};
      if(locales){
        Object.keys(locales).forEach((localeKey) => {
          let locData = locales[localeKey];
          rowInAllLocales[localeKey] = locData[rowIndex];
        })
      }
      await processTextRow(row, cObject, intro, rowInAllLocales);
    }
    rowIndex ++;
  }

  console.log('Write Exhibition (' + rowTitle + ')');

  let entryType   = intro ? 'exhibitionPage' : 'exhibitionChapterPage';
  let urlRowIndex = Math.max(0, rowIndex-1);
  let urlName     = rows[urlRowIndex].urlname.substr(0, maxLengthShort);
  let idData      = { identifier: wrapLocale(urlName.split('/').pop()) };
  let entryData   = Object.assign(cObject, idData);

  await setTitleData(entryData, urlName, locales, intro);
  let exhibitionObject = await writeEntry(entryType, { fields: entryData });
  return exhibitionObject;
};

const smartDelete = async (itemId, recurseLevel = 0) =>  new Promise(async resolve => {

  let entry = await environment.getEntry(itemId).catch((e) => {
    console.log(`smartDelete couldn't load entry: ${itemId}`);
  });

  if(!entry){
    console.log(`smartDelete no entry - return`);
    resolve();
    return;
  }

  const pad     = '\t'.repeat(recurseLevel);

  const loc2arr = (loc) => {
    let res = [];
    Object.keys(loc).forEach((key) => {
      res.push(loc[key])
    });
    return res;
  };

  const cleanArr = async (arr) => {
    await Promise.all(arr.map(async (deletableId) => {
      return new Promise(async resolve => {
        await smartDelete(deletableId, recurseLevel + 1);
        resolve();
      });
    }));
  };

  const cleanArr2D = async (arr) => {
    let deletableIds = [];
    arr.forEach(async (innerArr) => {
      innerArr.forEach(async (item) => {
        deletableIds.push(item.sys.id);
      });
    });
    await cleanArr(deletableIds);
  };

  let fNames = Object.keys(entry.fields);

  console.log(`${pad}(delete ${entry.sys.contentType.sys.id})`);

  if(entry.fields.hasPart){
    let hasPartList = loc2arr(entry.fields.hasPart);
    await cleanArr2D(hasPartList);
  }
  if(entry.fields.primaryImageOfPage){
    let heroList = loc2arr(entry.fields.primaryImageOfPage);
    await cleanArr(heroList.map((h) => {
      return h.sys.id;
    }));
  }
  await clean(entry).catch((e) => {
    console.log(`${pad}error deleting ${entry.sys.contentType.sys.id} ${entry.sys.id}`);
  });
  resolve();
});

const getTimeString = (startTime, endTime, message) => {
  let totalTime = parseInt((endTime - startTime) / 1000);
  let seconds = parseInt(totalTime % 60);
  let minutes = parseInt(totalTime / 60);
  return `${minutes} minute${minutes == 1 ? '' : 's'} and ${seconds} second${seconds == 1 ? '' : 's'}`;
};

// group chapter rows by urlname / returns hash of arrays
const groupChapters = function(allRows) {
  return allRows.reduce(function(acc, current) {
    (acc[current['urlname']] = acc[current['urlname']] || []).push(current);
    return acc;
  }, {});
};

const runAll = async () =>  {

  let startTime = new Date().getTime();

  space       = await cClient.getSpace(cSpaceId);
  environment = await space.getEnvironment(cEnvironmentId);
  let ex      = await environment.getEntries({ content_type: 'exhibitionPage'});

  // TO WORK ON A SINGLE EXHIBITION:
  // (1)- comment out this while loop
  while(nextExhibition = ex.items.pop()){
    await smartDelete(nextExhibition.sys.id);
  }
  // (2)- uncomment this single line
  //await smartDelete('exhibitionId');

  console.log('deleted old in ' + getTimeString(startTime, new Date().getTime()));

  await pgClient.connect();
  let resArr = await queryExhibitions('en');
  resArr = resArr.rows.map(x => x.parent_id);
  console.log(resArr);
  resArr = resArr.reverse();

  // (3)- override the items to process
  //resArr = [5];

  let completeCount = 0;
  let queueLength = resArr.length;

  while(nextExhibitionId = resArr.pop()){
    await run(nextExhibitionId);
    const pct = parseInt(100 - (resArr.length / queueLength) * 100);
    completeCount ++;
    console.log(`\n\t\t--> written exhibition ${nextExhibitionId}\t ${pct}%\t(${completeCount} of ${queueLength})`);
    console.log('\t\t--> running for ' + getTimeString(startTime, new Date().getTime()));
  }

  console.log('done in ' + getTimeString(startTime, new Date().getTime()));

  errorLog.end('');
  await pgClient.end();
};


// Gets translations for urlName / validates against English version
const getOrganisedLocaleRows = async (urlName, chapterRows, isIntro, crossLocale) => {

  if(!runTranslations){
    return null;
  }

  localisedRowsByUrlName = {};
  variants = await queryExhibitionLangVariants(urlName);

  // get variant rows / group into chapters
  while(variant = variants.pop()){

    const localeRows = await queryExhibitions(variant.language_code, variant.exhibition_id, isIntro, crossLocale);

    if(crossLocale){
      localeRows.rows = localeRows.rows.filter((lr) => lr.urlname === urlName);
    }

    let localeRowsGrouped = groupChapters(localeRows.rows);
    let groupUrlNames = Object.keys(localeRowsGrouped);

    if(!groupUrlNames){
      continue;
    }

    // / iterate chapters / validate
    while(groupUrlName = groupUrlNames.pop()){

      if(!localisedRowsByUrlName[groupUrlName]){
        localisedRowsByUrlName[groupUrlName] = {};
      }
      localisedRowsByUrlName[groupUrlName][variant.language_code] = [];

      let chapterLocaleRows = localeRowsGrouped[groupUrlName];

      if(!chapterRows[groupUrlName]){
        console.log('No chapter rows found for ' + groupUrlName);
      }
      else if(chapterRows[groupUrlName].length === chapterLocaleRows.length){

        const essenceTypes = ['Alchemy::EssenceHtml', 'Alchemy::EssencePicture', 'Alchemy::EssenceRichtext', 'Alchemy::EssenceCredit'];
        const filterType = (type, list) => list.filter((r) => r.essence_type === type);

        const filteredLocales = {}; // store filtered types for re-ordering

        let valid = true;

        essenceTypes.forEach((essenceType) => {
          const localesFiltered = filterType(essenceType, chapterLocaleRows);
          if(localesFiltered.length !== filterType(essenceType, chapterRows[groupUrlName]).length){
            valid = false
          }
          else{
            filteredLocales[essenceType] = localesFiltered;
          }
        });

        if(valid){
          // check essence ordering
          chapterLocaleRows.forEach((r, i) => {
            if(r.essence_type != chapterRows[groupUrlName][i].essence_type){
              valid = false;
            }
          })
          if(valid){
            localisedRowsByUrlName[groupUrlName][variant.language_code] = chapterLocaleRows;
            console.log(`\t\tfound translation ${variant.language_code} for ${groupUrlName}`);
          }
          else if(runTranslationsAllowsReordering){

            chapterLocaleRowsOrdered = [];

            // build order based on the English order
            chapterRows[groupUrlName].forEach((en) => {
              chapterLocaleRowsOrdered.push(filteredLocales[en.essence_type].pop());
            });
            chapterLocaleRowsOrdered.forEach((r, i) => {
              if(r.essence_type != chapterRows[groupUrlName][i].essence_type){
                throw new Error('Mismatch should now be impossible!');
              }
            });
            localisedRowsByUrlName[groupUrlName][variant.language_code] = chapterLocaleRowsOrdered;
            console.log(`\t\tfound translation ${variant.language_code} for ${groupUrlName}`);
          }
        }
      }
    }
  }
  return localisedRowsByUrlName;
};

const run = async(exhibitionId) =>  {

  const res = await queryExhibitions('en', exhibitionId);

  if(res.rows.length > 0){

    const pDate = new Date(res.rows[0].public_on);
    const urlName = res.rows[0].urlname;

    console.log(`\t...will process ${res.rows.length} rows for ${urlName.split('/').slice(0)[0]}\n\t > ${pDate.toLocaleDateString('en-GB')}\n`);

    /* locales / experimental */
    let locales  = {};
    let chapterRows = groupChapters(res.rows);
    let urlNames = Object.keys(chapterRows).reverse();
    let chapterRefs = [];
    let localeRowsByUrlname = await getOrganisedLocaleRows(urlName, chapterRows);

    while(url = urlNames.pop()){
      let chapterRef = await processRows(
        chapterRows[url],
        localeRowsByUrlname ? localeRowsByUrlname[url] : {}
      );
      chapterRefs.push(chapterRef);
    }

    let introRows = await queryExhibitions('en', exhibitionId, true);

    if(introRows.rows.length > 0){


      let introUrl = urlName.split('/').slice(0)[0];
      let chapterIntroRows = groupChapters(introRows.rows);

      if(!chapterIntroRows[introUrl]){
        const msg = `No intro rows found for ${exhibitionId} ${urlName}`;
        console.log(msg);
        err(msg);
        return;
      }

      console.log(`${chapterIntroRows[introUrl].length} intros found for ${exhibitionId} ${urlName}`);

      let groupedChapterIntros = {};
      if(runTranslations){
        groupedChapterIntros = await getOrganisedLocaleRows(introUrl, chapterIntroRows, true, true);
      }

      let intro = await processRows(
        chapterIntroRows[introUrl],
        groupedChapterIntros[introUrl],
        true
      );

      intro.fields.datePublished = wrapLocale(pDate);

      if(!intro.fields.hasPart){
        intro.fields.hasPart = getObjectBase().hasPart;
      }

      if(chapterRefs && chapterRefs.length){
        chapterRefs.reverse();

        console.log(`Link ${chapterRefs.length} refs...`);

        while(chapter = chapterRefs.pop()){
          intro.fields.hasPart[locale].push(getEntryLink(chapter.sys.id));
        }
        intro = await intro.update();
        intro.publish();
        if(dryRun){
          intro.debug();
        }
      }
    }
  }
  else{
    console.log('No data for ' + exhibitionId);
  }
};

fs.readFile('tmp/images.json', (err, data) => {
  if(err){
    console.log(`Generate the images first by running:\n\tnode images.js\n${err}`);
  }
  else{
    imageSysIds = JSON.parse(data);
    console.log(`Proceed!`);
    runAll();
  }
});
