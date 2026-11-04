const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const prompt = fs.readFileSync(path.join(root, 'prompt-instalacao.txt'), 'utf8');
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('PROMPT_PLACEHOLDER', escape(prompt));
const pages = {
  '/': { body: html, type: 'text/html; charset=utf-8' },
  '/prompt-instalacao.txt': { body: prompt, type: 'text/plain; charset=utf-8' },
  '/robots.txt': { body: 'User-agent: *\nAllow: /\nSitemap: https://multica.iamagica.com.br/sitemap.xml\n', type: 'text/plain' },
  '/sitemap.xml': { body: '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://multica.iamagica.com.br/</loc></url></urlset>', type: 'application/xml' }
};
const worker = `const pages = ${JSON.stringify(pages)};
export default { async fetch(request) {
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}});
  const page = pages[new URL(request.url).pathname];
  if (!page) return new Response('Página não encontrada', {status:404});
  return new Response(request.method === 'HEAD' ? null : page.body, {headers:{
    'Content-Type':page.type,
    'Cache-Control':'public, max-age=300',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
  }});
}};
`;
fs.writeFileSync(path.join(root, 'worker.mjs'), worker);
fs.writeFileSync(path.join(root, 'preview.html'), html);
console.log('Built landing page and Worker; no dependencies or credentials.');
