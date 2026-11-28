import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../lib/', import.meta.url), { recursive: true });
await build({ absWorkingDir: root, entryPoints: ['src/index.ts'], outfile: 'lib/index.js',
  bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' });
const client = await build({ absWorkingDir: root, entryPoints: ['src/client.jsx'], bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2022', external: ['react'], write: false });
await writeFile(new URL('../lib/client.js', import.meta.url),
  `window.__ModuleLoader__.load({id:'dsh-local-test',factory:require=>{var module={exports:{}};var exports=module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;}});\n`);
