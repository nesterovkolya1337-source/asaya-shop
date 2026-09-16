import { Database,migrate } from '../src/db.js';
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db=new Database(process.env.DATABASE_URL);
try { console.log({applied:await migrate(db)}); } finally { await db.close(); }
