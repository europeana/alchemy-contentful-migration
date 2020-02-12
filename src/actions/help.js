const cli = (args) => {
  require(`./${args[0]}`).help();
};

module.exports = {
  cli
};
