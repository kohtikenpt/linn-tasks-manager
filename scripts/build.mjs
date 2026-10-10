import {readFile,mkdir,writeFile,cp} from 'node:fs/promises';
import {build} from 'esbuild';
const types={'index.html':'text/html; charset=utf-8','app.js':'text/javascript; charset=utf-8','styles.css':'text/css; charset=utf-8','sw.js':'text/javascript; charset=utf-8','manifest.webmanifest':'application/manifest+json','icon-192.png':'image/png','icon-512.png':'image/png','logo.png':'image/png'};
const assets={};for(const [file,type] of Object.entries(types)){const binary=file.endsWith('.png');const b=await readFile('web/'+file);assets['/'+file]={type,body:binary?b.toString('base64'):b.toString('utf8'),base64:binary};}
await writeFile('worker/assets.js','export const assets='+JSON.stringify(assets)+';\n');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/entry.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'inline'});
await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Built Worker, PWA assets and database migrations.');

