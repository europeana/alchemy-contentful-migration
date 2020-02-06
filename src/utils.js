const { defaultLocale } = require('./config');

const wrapLocale = (value, options = {}) => {
  const truncated = (typeof value === 'string' && options.max) ? value.slice(0, options.max) : value;

  return {
    [options.locale || defaultLocale]: truncated
  };
};

module.exports = {
  wrapLocale
};
