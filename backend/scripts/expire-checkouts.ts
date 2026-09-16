import { Database } from '../src/db.js';
import { CommerceService } from '../src/commerce.js';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const db=new Database(process.env.DATABASE_URL);
try {console.log({expired:await new CommerceService(db).expire()});}finally{await db.close();}
