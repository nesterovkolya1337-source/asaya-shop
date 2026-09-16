import {Database} from '../src/db.js';
import {ensureOnboardingWarehouses} from '../src/warehouses.js';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const db=new Database(process.env.DATABASE_URL);
try{console.log(JSON.stringify(await ensureOnboardingWarehouses(db)));}finally{await db.close();}
