const exhibition = {
  clean: require('./src/clean').cli,
  create: require('./src/create').cli,
  credits: require('./src/credits').cli,
  images: require('./src/images').cli,
  migrate: require('./src/migrate').cli,
  load: require('./src/load').cli
};

const act = async(action, args) => {
  if (exhibition[action]) return await exhibition[action](args);

  console.log(`Unknown action: ${action}`);
  process.exit(1);
};

const action = process.argv[2];
act(action, process.argv.slice(3));
