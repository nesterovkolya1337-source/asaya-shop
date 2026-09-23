import {readFile} from 'node:fs/promises';
import {Database} from '../src/db.js';
import {importPdpRichContent} from '../src/pdp-rich-import.js';
// Run from backend/. DATABASE_URL stays in the process environment; never printed.
const actor=process.env.ADMIN_ACTOR_ID;
if(!actor||!process.env.DATABASE_URL)throw new Error('DATABASE_URL and ADMIN_ACTOR_ID are required');
const db=new Database(process.env.DATABASE_URL);
try{
 const data=JSON.parse(await readFile('data/pdp-rich-content-v2.json','utf8'));
 console.log(JSON.stringify(await importPdpRichContent(db,data,actor,process.argv.includes('--apply')),null,2));
 console.log('Draft content only. Publish separately in Admin after review.');
}finally{await db.close();}
