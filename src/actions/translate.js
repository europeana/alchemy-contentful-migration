const { pgClient } = require('../support/config');
const { localeMap, pad } = require('../support/utils');
const { load, getExhibitionPageUrlnames } = require('./load');

const help = () => {
  pad.log('Usage: npm run exhibition translate [urlname]');
};

const translate = async(page) => {
  pad.log(`${page.urlname}:`);

  if (page['other_language_codes'].length === 0) {
    pad.log('- [no translations found]');
  }

  for (const otherLanguage of page['other_language_codes']) {
    await translateTo(page, otherLanguage);
  }

  return page;
};

const translateTo = async(page, toLanguageCode) => {
  const fromLocale = localeMap[page['language_code']];
  const toLocale = localeMap[toLanguageCode];

  const translatedPage = await load(page.urlname, toLanguageCode);

  try {
    pageTranslationAligned(page, translatedPage);
    pad.log(`- ${page['language_code']} => ${toLocale}: ✔`);
  } catch (e) {
    pad.log(`- ${page['language_code']} => ${toLocale}: ✘ ${e.message}`);
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
        if (!essence.data[name][fromLocale]) essence.data[name][fromLocale] = '';
        if (translatedEssence.data[name][toLocale] && (essence.data[name][fromLocale] !== translatedEssence.data[name][toLocale]))
          essence.data[name][toLocale] = translatedEssence.data[name][toLocale];
      }
    }
  }

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

const translateOne = async(urlname) => {
  const data = await(load(urlname));
  await translate(data);
  return data;
};

const analyseTranslationsOfAll = async() => {
  const urlnames = await getExhibitionPageUrlnames();

  for (const urlname of urlnames) {
    const data = await translateOne(urlname);
    for (const childPageUrlname of data['child_page_urlnames']) {
      pad.increase();
      await translateOne(childPageUrlname);
      pad.decrease();
    }
  }
};

const cli = async(args) => {
  await pgClient.connect();

  const urlname = args[0];

  if (urlname) {
    const data = await translateOne(urlname);
    console.log(JSON.stringify(data, null, 2));
  } else {
    await analyseTranslationsOfAll();
  }

  await pgClient.end();
};

module.exports = {
  translate,
  getExhibitionPageUrlnames,
  cli,
  help
};
