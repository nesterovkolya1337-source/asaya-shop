import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {config} from '../src/config.js';
import {Database} from '../src/db.js';
import {StaffAuth} from '../src/staff-auth.js';
const c=config();
if(c.NODE_ENV==='production'&&c.DEPLOYMENT_MODE!=='catalog')throw new Error('Production startup is not enabled in this stage');
if(!c.STAFF_SECRET)throw new Error('STAFF_SECRET is required');
const file=process.argv[2];if(!file)throw new Error('Pass a private JSON file with email, password and totpSecret');
const input=z.object({email:z.string(),password:z.string(),totpSecret:z.string()}).strict().parse(JSON.parse(await readFile(file,'utf8')));
const db=new Database(c.DATABASE_URL);
try{const id=await new StaffAuth(db,c.STAFF_SECRET).provision(input.email,input.password,input.totpSecret);console.log('Staff account created:',id);}
finally{await db.close();}

