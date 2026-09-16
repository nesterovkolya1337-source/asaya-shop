import { readFile } from 'node:fs/promises';
import { Database } from '../src/db.js';
import { inspectImport,importCatalog } from '../src/importer.js';
const file=process.argv[2];if(!file)throw new Error('Usage: import:catalog -- source.json [--apply]');
const data=JSON.parse(await readFile(file,'utf8'));
const mapping=JSON.parse(await readFile('data/storefront-mapping.json','utf8'));
if(!process.argv.includes('--apply')) console.log({dryRun:true,...inspectImport(data,mapping).report});
else {
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
 const db=new Database(process.env.DATABASE_URL);
 try{console.log(await importCatalog(db,data,mapping));}finally{await db.close();}
}
