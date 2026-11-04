import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=path.resolve('public');let count=0;const errors=[];
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(root)){
 if(file.endsWith('.js')){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)errors.push(result.stderr);count++;}
 if(!/\.(js|html|css)$/.test(file))continue;
 const text=fs.readFileSync(file,'utf8');const refs=[...text.matchAll(/(?:from\s*|import\s*|src\s*=\s*|href\s*=\s*|fetch\(\s*|loadAsync\(\s*|\.load\(\s*)["']([^"']+)["']/g)];
 for(const [,ref]of refs){if(ref.startsWith('http')||ref.startsWith('data:')||ref.startsWith('#')||ref.includes('${'))continue;if(file.includes(path.sep+'vendor'+path.sep)&&!ref.startsWith('.'))continue;const name=ref.split(/[?#]/)[0];if(!name)continue;const target=path.resolve(path.dirname(file),name);if(!fs.existsSync(target))errors.push(path.relative(root,file)+' -> '+ref);}
 if(fs.statSync(file).size>25*1024*1024)errors.push('Asset exceeds 25 MiB: '+file);
}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log(`Checked ${count} JavaScript files and static page/import/loader references.`);
