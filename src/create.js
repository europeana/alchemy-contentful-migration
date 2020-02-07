const { pgClient } = require('./config');
const { load } = require('./load');
const { wrapLocale, licenseMap, padLog, shortText, longText, markdownTextField } = require('./utils');

const create = async(pgClient, alchemyPageId, depth = 0) =>  {
  padLog(`Creating entry for page: ${alchemyPageId}`, depth);
  const pageData = await load(pgClient, alchemyPageId);

  const hasPartSysIds = [];
  for (const childPageId of pageData['child_ids']) {
    // const hasPartSysId = await create(pgClient, childPageId, depth + 1);
    // hasPartSysIds.push(hasPartSysId);
  }

  const fields = {};
  fields.description = shortText(pageData.meta_description);
  fields.identifier = wrapLocale(pageData.urlname);
  fields.datePublished = wrapLocale(new Date(pageData.public_on));
  // TODO: chapters, hero image, maybe credits

  for (const element of pageData.elements) {
    if (elementHandlers[element.name]) {
      await elementHandlers[element.name](element.essences, fields);
    } else {
      console.log(`Unhandled element: ${element.name}`);
    }
  }
  // TODO:
  // process each element of the page (via another module)
  // save
  // publish

  // TODO: return sys ID
  return fields;
};

const elementHandlers = {
  intro: (essences, fields) => {
    fields.name = shortText(essences.title.body);
    fields.headline = shortText(essences.sub_title.body);
    fields.text = longText(markdownTextField(essences.body.body, essences.body.name));
  }
}

// const addElementToEntryFields = (element, fields) => {
//   // console.log(JSON.stringify(element, null, 2));
//   switch(element.name) {
//     case 'intro':
//       page.name = wrapLocale()
//   }
// };

const cli = async(args) => {
  await pgClient.connect();
  const result = await(create(pgClient, args[0]));
  await pgClient.end();
  console.log(JSON.stringify(result, null, 2));
};

module.exports = {
  create,
  cli
};
