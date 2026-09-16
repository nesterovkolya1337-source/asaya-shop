import {readFile,writeFile} from 'node:fs/promises';
import {Database} from '../src/db.js';
import {YandexFeed} from '../src/yandex-feed.js';

const args=process.argv.slice(2),command=args[0];
if(!['prepare','export'].includes(command??'')||(command==='prepare'&&args.slice(1).some(a=>a!=='--apply'))||(command==='export'&&(args.length!==2||!args[1])))throw new Error('Usage: yandex-feed prepare [--apply] | yandex-feed export OUTPUT.xml');
if(!process.env.DATABASE_URL||!process.env.YCP_SETTINGS_FILE)throw new Error('DATABASE_URL and YCP_SETTINGS_FILE are required');
const settings=JSON.parse(await readFile(process.env.YCP_SETTINGS_FILE,'utf8')),db=new Database(process.env.DATABASE_URL);
try{
 const feed=new YandexFeed(db,settings);
 if(command==='prepare')console.log(JSON.stringify(await feed.prepare(args.includes('--apply')),null,2));
 else {const result=await feed.render();await writeFile(args[1]!,result.xml,{encoding:'utf8',flag:'wx'});console.log(JSON.stringify({included:result.included,skipped:result.skipped},null,2));}
}finally{await db.close();}
