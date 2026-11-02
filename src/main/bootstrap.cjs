'use strict';
exports.register = (rendererEntry, options) => {
  require('./modules.cjs').register(rendererEntry, options);
  require('../../pool/register.cjs').register(rendererEntry);
};
