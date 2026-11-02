'use strict';
const fs = require('node:fs');
const path = require('node:path');
fs.writeFileSync(path.join(__dirname,'../src/themes/themes.css'),require('../lib/themes.cjs').stylesheet());
console.log('10 temas gerados em src/themes/themes.css');
