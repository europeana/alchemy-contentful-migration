const { pgClient } = require('./config');
const { create } = require('./create');

const getEnglishExhibitionPageIds = async() => {
  const sql = `
    select id
    from alchemy_pages ap
    where ap.page_layout = 'exhibition_theme_page' and ap.depth=2 and ap.published_at is not null and ap.language_code='en'
    order by urlname
  `;
  const result = await pgClient.query(sql);
  return result.rows.map((page) => page.id);
};

const createExhibitions = async() =>  {
  await pgClient.connect();

  const exhibitionIds = await getEnglishExhibitionPageIds();

  for (const exhibitionId of exhibitionIds) {
    await create(exhibitionId);
  }

  await pgClient.end();
};

const cli = async() => {
  await createExhibitions();
};

module.exports = {
  createExhibitions,
  cli
};
