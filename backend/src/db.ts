import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export type Tx = pg.PoolClient;
export class Database {
 readonly pool: pg.Pool;
 constructor(url: string) {
  this.pool = new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 3000,
   statement_timeout: 4000, idle_in_transaction_session_timeout: 10000 });
 }
 async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await this.pool.connect();
  try { await tx.query('BEGIN'); const result = await fn(tx); await tx.query('COMMIT'); return result; }
  catch(error) { await tx.query('ROLLBACK'); throw error; }
  finally { tx.release(); }
 }
 async close() { await this.pool.end(); }
}
export async function lock(tx: Tx, key: string) {
 await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
}
export async function migrate(db: Database, dir = resolve('migrations')) {
 return db.transaction(async tx => {
  await lock(tx,'asaya:migrations');
  await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied: string[] = [];
  for (const name of (await readdir(dir)).filter(n=>/^\d+.*\.sql$/.test(n)).sort()) {
   const sql = await readFile(resolve(dir,name),'utf8');
   const hash = createHash('sha256').update(sql).digest('hex');
   const prior = await tx.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
   if(prior.rows.length) {
    if(prior.rows[0].checksum!==hash) throw new Error(`Migration checksum mismatch: ${name}`);
    continue;
   }
   await tx.query(sql);
   await tx.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,hash]);
   applied.push(name);
  }
  return applied;
 });
}
