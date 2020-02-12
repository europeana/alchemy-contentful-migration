const actions = [
  'assets', 'clean', 'create', 'credits', 'help', 'images', 'migrate', 'load'
];

const act = async(action, args) => {
  if (!actions.includes(action)) {
    console.log(`Unknown action: ${action}`);
    process.exit(1);
  }

  return require(`./src/actions/${action}`).cli(args);
};

const action = process.argv[2];
act(action, process.argv.slice(3));
