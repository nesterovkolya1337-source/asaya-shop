import {readFile} from 'node:fs/promises';
import {Database} from '../src/db.js';
import {importWildberries} from '../src/review-import.js';

const file=process.argv[2];
if(!file||!process.env.DATABASE_URL)throw Error('Provide extracted review JSON and DATABASE_URL; apply migrations separately');
const rows=JSON.parse(await readFile(file,'utf8'));
if(!Array.isArray(rows))throw Error('Expected an array of reviews');
const db=new Database(process.env.DATABASE_URL);
try{console.log(JSON.stringify(await importWildberries(db,rows)));}finally{await db.close();}
