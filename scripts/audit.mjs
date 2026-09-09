import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const ignored = new Set(['node_modules', '.git', 'dist', 'test-results', 'playwright-report']);
function walk(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap(name => {
    if (ignored.has(name)) return [];
    const path = join(root, name);
    return statSync(path).isDirectory() ? walk(path) : [path.replaceAll('\\', '/')];
  });
}
let tracked = [];
try { tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean); } catch {}
const files = new Set([...tracked, ...walk('.')]);
const failures = [];
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.html', '.css', '.svg', '.txt', '.yml', '.yaml', '']);
const words = [
  [67,111,100,101,120],
  [65,73,32,67,111,109,112,97,110,121,32,79,83],
  [97,103,101,110,116,45,119,111,114,107,101,114],
  [114,101,112,111,115,105,116,111,114,121,83,110,97,112,115,104,111,116],
  [112,114,111,118,105,100,101,114,87,114,105,116,101,80,108,97,110,70,101,101,100,98,97,99,107],
].map(codes => String.fromCharCode(...codes).toLowerCase());
const privatePatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /(?:\/Users\/|\/home\/[a-zA-Z0-9_-]+\/|\/var\/lib\/|[A-Z]:\\Users\\)/,
  /(?:seedPhrase|privateKey|secretKey)\s*[:=]\s*["'][A-Za-z0-9 +/]{24,}["']/,
];
function inspect(path, bundled = false) {
  if (!existsSync(path) || !statSync(path).isFile() || !textExtensions.has(extname(path))) return;
  const body = readFileSync(path, 'utf8');
  const lower = body.toLowerCase();
  if (words.some(word => lower.includes(word))) failures.push(`${path}: prohibited provenance text`);
  if (privatePatterns.some(pattern => pattern.test(body))) failures.push(`${path}: credential or local-path pattern`);
  const fixtureMarker = ['COOKIE', 'LENS', 'TEST', 'FIXTURE'].join('_');
  if (bundled && body.includes(fixtureMarker)) failures.push(`${path}: bundled fixture`);
  if ((path.startsWith('src/') || path.startsWith('integrations/')) && /(?:from\s*|import\s*\()["'][^"']*(?:tests\/|fixtures)/.test(body)) failures.push(`${path}: production fixture import`);
}
for (const path of files) {
  if (path.startsWith('node_modules/') || path.startsWith('dist/') || path.startsWith('test-results/') || path.startsWith('playwright-report/')) continue;
  inspect(path.replace(/^\.\//, ''));
}
if (!existsSync('dist/index.html') || statSync('dist/index.html').size === 0) failures.push('dist/index.html: build output missing');
for (const path of walk('dist')) inspect(path, true);
if (failures.length) { process.stderr.write(failures.join('\n') + '\n'); process.exitCode = 1; }
else process.stdout.write('Public text and production bundle audit passed. Review commit metadata, dependency notices and visual assets separately.\n');
