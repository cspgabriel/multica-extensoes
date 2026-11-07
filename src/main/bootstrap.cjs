'use strict';
exports.register = (rendererEntry, options) => {
  require('./modules.cjs').register(rendererEntry, options);
  require('../../pool/register.cjs').register(rendererEntry);
  require('./terminal.cjs').register(rendererEntry);
  require('./session-backup.cjs').register(rendererEntry);
  require('./meetings.cjs').register(rendererEntry);
  require('./chat-memory.cjs').register(rendererEntry);
};
