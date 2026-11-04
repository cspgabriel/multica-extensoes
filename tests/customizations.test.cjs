'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { digest } = require('../lib/asar.cjs');
const { applyDelta } = require('../lib/customizations.cjs');
test('customizations reject an unexpected base or corrupted result', () => {
  const original = Buffer.from('one\ntwo\nthree\n');
  const result = Buffer.from('one\nnew\nthree\n');
  const delta = { originalSha256:digest(original), resultSha256:digest(result), operations:[{start:1,delete:1,insert:'new\n'}] };
  assert.deepEqual(applyDelta(original,delta), result);
  assert.throws(() => applyDelta(Buffer.from('other'),delta), /Base incompatível/);
  assert.throws(() => applyDelta(original,{...delta,resultSha256:'bad'}), /verificação/);
  assert.throws(() => applyDelta(original,{...delta,operations:[{start:-1,delete:0,insert:''}]}), /inválido/);
});
test('distribution has no private account defaults or private repository dependency', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const directory of ['src','lib','scripts','pool']) {
    function walk(dir) {
      for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
        const file=path.join(dir,entry.name);
        if(entry.isDirectory()) walk(file);
        else assert.doesNotMatch(fs.readFileSync(file,'utf8'), /cspgabriel@|Gabriel-Windows|cspgabriel\/multica-desktop-customizado|cspgabriel\/multica-sessoes-backup|C:\\\\Users\\\\cspga/i, file);
      }
    }
    walk(path.join(__dirname,'..',directory));
  }
});
