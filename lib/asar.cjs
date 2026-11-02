'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

const digest = data => crypto.createHash('sha256').update(data).digest('hex');
function openArchive(filename) {
  const buffer = fs.readFileSync(filename);
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 4) throw new Error('Formato ASAR inválido.');
  const headerSize = buffer.readUInt32LE(4);
  const stringSize = buffer.readUInt32LE(12);
  if (headerSize < 8 || headerSize > 32 * 1024 * 1024 || stringSize > headerSize - 8 || 8 + headerSize > buffer.length) throw new Error('Cabeçalho ASAR inválido.');
  const header = JSON.parse(buffer.subarray(16, 16 + stringSize).toString('utf8'));
  if (!header.files) throw new Error('Índice ASAR ausente.');
  const base = 8 + headerSize;
  function entry(filename) {
    let node = header;
    for (const segment of filename.replaceAll('\\', '/').split('/').filter(Boolean)) {
      if (segment === '..' || segment === '.') throw new Error('Caminho ASAR inválido.');
      node = node.files?.[segment];
      if (!node) throw new Error('Arquivo ausente no pacote: ' + filename);
    }
    return node;
  }
  function read(filename) {
    const info = entry(filename);
    if (info.unpacked || info.link || info.files) throw new Error('O arquivo solicitado não está empacotado: ' + filename);
    const offset = Number(info.offset);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(info.size) || info.size < 0 || base + offset + info.size > buffer.length) throw new Error('Offset ASAR inválido.');
    return buffer.subarray(base + offset, base + offset + info.size);
  }
  return { buffer, header, base, entry, read, sha256: digest(buffer) };
}
function encodeHeader(header) {
  const json = Buffer.from(JSON.stringify(header));
  const payloadSize = 4 + Math.ceil(json.length / 4) * 4;
  const result = Buffer.alloc(8 + 4 + payloadSize);
  result.writeUInt32LE(4, 0);
  result.writeUInt32LE(4 + payloadSize, 4);
  result.writeUInt32LE(payloadSize, 8);
  result.writeUInt32LE(json.length, 12);
  json.copy(result, 16);
  return result;
}
function repack(source, destination, replacements) {
  const archive = typeof source === 'string' ? openArchive(source) : source;
  const header = structuredClone(archive.header);
  const files = [];
  function visit(index, prefix = '') {
    for (const [name, entry] of Object.entries(index)) {
      const filename = prefix + name;
      if (entry.files) visit(entry.files, filename + '/');
      else if (!entry.unpacked && entry.offset !== undefined) files.push({ filename, entry, previousOffset: Number(entry.offset) });
    }
  }
  visit(header.files);
  files.sort((a,b) => a.previousOffset - b.previousOffset);
  for (const filename of replacements.keys()) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(filename) || filename.split('/').some(x => x === '..' || x === '.')) throw new Error('Caminho de substituição inválido.');
    let directory = header;
    const segments = filename.split('/');
    for (const segment of segments.slice(0, -1)) directory = directory.files[segment] ||= { files: {} };
    const name = segments.at(-1);
    if (!directory.files[name]) {
      directory.files[name] = { size: 0, offset: '0' };
      files.push({ filename, entry: directory.files[name], previousOffset: null });
    } else if (directory.files[name].unpacked || directory.files[name].files || directory.files[name].link) throw new Error('A substituição não é um arquivo empacotado.');
  }
  let offset = 0;
  const contents = [];
  for (const item of files) {
    const value = replacements.has(item.filename) ? Buffer.from(replacements.get(item.filename)) : archive.read(item.filename);
    item.entry.offset = String(offset);
    item.entry.size = value.length;
    if (replacements.has(item.filename)) {
      const blockSize = item.entry.integrity?.blockSize || 4 * 1024 * 1024;
      if (!Number.isSafeInteger(blockSize) || blockSize < 1) throw new Error('Bloco de integridade inválido.');
      const blocks = [];
      for (let index = 0; index < value.length; index += blockSize) blocks.push(digest(value.subarray(index, index + blockSize)));
      item.entry.integrity = { algorithm: 'SHA256', hash: digest(value), blockSize, blocks };
    }
    contents.push(value);
    offset += value.length;
  }
  const descriptor = fs.openSync(destination, 'wx');
  try {
    for (const content of [encodeHeader(header), ...contents]) {
      let written = 0;
      while (written < content.length) written += fs.writeSync(descriptor, content, written, content.length - written);
    }
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  const output = openArchive(destination);
  for (const [filename, expected] of replacements) {
    if (!output.read(filename).equals(Buffer.from(expected))) throw new Error('Falha na verificação do pacote gerado: ' + filename);
  }
  return output;
}
function readFuses(executable) {
  const binary = fs.readFileSync(executable);
  const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
  const first = binary.indexOf(sentinel);
  if (first < 0 || first !== binary.lastIndexOf(sentinel)) throw new Error('Não foi possível verificar os fuses deste executável.');
  const start = first + sentinel.length;
  if (binary[start] !== 1 || binary[start + 1] < 5) throw new Error('Formato de fuse não suportado.');
  return { runAsNode: binary[start + 2] === 49, embeddedAsarIntegrityValidation: binary[start + 6] === 49, integrityKnown: [48,49].includes(binary[start + 6]) };
}
module.exports = { openArchive, encodeHeader, repack, readFuses, digest };
