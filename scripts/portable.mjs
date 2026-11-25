// The same production bundle is also distributed as a double-clickable offline page.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const filenames = await readdir(path.join(dist, 'assets'))
const types = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.js': 'text/javascript',
}
async function inline(url) {
  const bytes = await readFile(path.join(dist, url.slice(1)))
  return 'data:' + types[path.extname(url)] + ';base64,' + bytes.toString('base64')
}
const entry = await readFile(path.join(dist, 'index.html'), 'utf8')
const moduleTag = entry.match(/<script\b[^>]+src="([^"]+)"[^>]*><\/script>/)
const styleTag = entry.match(/<link\b[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/)
if (!moduleTag || !styleTag) throw new Error('Expected one built JavaScript entry and one stylesheet')
let js = await readFile(path.join(dist, moduleTag[1].slice(1)), 'utf8')
let css = await readFile(path.join(dist, styleTag[1].slice(1)), 'utf8')
let html = entry
const assets = [
  '/spade.svg',
  ...(await readdir(path.join(dist, 'art'))).map((name) => '/art/' + name),
  ...filenames.filter((name) => !name.startsWith('index-')).map((name) => '/assets/' + name),
]
for (const url of assets) {
  if (!js.includes(url) && !css.includes(url) && !html.includes(url)) continue
  const data = await inline(url)
  js = js.replaceAll(url, data)
  css = css.replaceAll(url, data)
  html = html.replaceAll(url, data)
}
html = html.replace(
  moduleTag[0],
  () => '<script type="module">' + js.replaceAll('</script', '<\\/script') + '</script>',
)
html = html.replace(styleTag[0], () => '<style>' + css + '</style>')
const notices = await readFile(path.join(dist, 'DEPENDENCIES.md'), 'utf8')
html = html.replace(
  '</body>',
  () =>
    '<script type="application/json" id="dependency-notices">' +
    JSON.stringify(notices).replaceAll('<', '\\u003c') +
    '</script></body>',
)
await writeFile(path.join(dist, 'Belot-Club.html'), html)
console.log('Offline edition built at dist/Belot-Club.html')
