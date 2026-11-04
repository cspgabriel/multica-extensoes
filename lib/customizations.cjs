'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { digest } = require('./asar.cjs');

// Only extension edits are shipped; unchanged application code is read locally.
function applyDelta(original, delta) {
  if (digest(original) !== delta.originalSha256) throw Error('Base incompatível com as customizações: ' + delta.path);
  const lines = original.toString('utf8').match(/[^\r\n\v\f\x1c-\x1e\x85\u2028\u2029]*(?:\r\n|[\r\n\v\f\x1c-\x1e\x85\u2028\u2029])|[^\r\n\v\f\x1c-\x1e\x85\u2028\u2029]+$/g) || [];
  const output = [];
  let cursor = 0;
  for (const operation of delta.operations) {
    if (!Number.isInteger(operation.start) || !Number.isInteger(operation.delete) || operation.start < cursor || operation.delete < 0 || operation.start + operation.delete > lines.length) throw Error('Delta inválido.');
    output.push(lines.slice(cursor, operation.start).join(''), operation.insert);
    cursor = operation.start + operation.delete;
  }
  output.push(lines.slice(cursor).join(''));
  const result = Buffer.from(output.join(''));
  if (digest(result) !== delta.resultSha256) throw Error('Customizações não passaram na verificação: ' + delta.path);
  return result;
}

function applyCustomizations(archive, moduleRoot, replacements) {
  let bundlePath, bundle;
  for (const name of ['renderer', 'styles']) {
    const delta = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'src/customizations', name + '.json'), 'utf8'));
    let result = applyDelta(archive.read(delta.path), delta).toString();
    if (name === 'renderer') {
      result = result.replace('new URL("file:///@@MC_INTEGRATION@@/src/ui/index.html")', 'new URL(' + JSON.stringify(pathToFileURL(path.join(moduleRoot, 'src/ui/index.html')).href) + ')');
      result = result.replace('new URL("../pool-contas-ia/index.html", import.meta.url)', 'new URL(' + JSON.stringify(pathToFileURL(path.join(moduleRoot, 'pool/renderer/index.html')).href) + ')');
      result = result.replaceAll('@@MC_INTEGRATION@@', moduleRoot.replaceAll('\\', '/'));
      bundlePath = delta.path;
      bundle = result;
    }
    replacements.set(delta.path, Buffer.from(result));
  }
  for (const name of ['catalogue.js', 'runtime.js', 'themes.css']) {
    replacements.set('out/renderer/multica-themes/' + name, fs.readFileSync(path.join(moduleRoot, 'src/themes', name)));
  }
  return { replacements, bundlePath, bundle };
}
module.exports = { applyDelta, applyCustomizations };
