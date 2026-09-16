import { readFile } from 'node:fs/promises';
import { Database } from '../src/db.js';
import { inspectApprovals,applyMappingApprovals } from '../src/mapping-approvals.js';
const args=process.argv.slice(2);
if(args.some(arg=>arg.startsWith('--') && arg!=='--apply') || args.filter(arg=>!arg.startsWith('--')).length>1)
 throw new Error('Usage: approve:mappings -- [manifest.json] [--apply]');
const file=args.find(arg=>!arg.startsWith('--'))??'data/mapping-approvals.json';
const raw=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
const record=inspectApprovals(raw);
if(!args.includes('--apply')) console.log({dryRun:true,sourceSha256:record.sourceSha256,mappings:record.mappings,pending:record.pendingSlugs,salesActivated:0});
else {
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
 const db=new Database(process.env.DATABASE_URL);
 try {console.log(await applyMappingApprovals(db,record));}finally{await db.close();}
}
