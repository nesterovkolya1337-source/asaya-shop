import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from './postgres.js';
import { migrate } from '../src/db.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sitePageDefaults } from '../src/site-content-defaults.js';
test('all migrations run on PostgreSQL and replay without changes',async()=>{
 const t=await testDatabase();
 try { assert.deepEqual(await migrate(t.db),[]); assert.equal((await t.db.pool.query('SELECT * FROM schema_migrations')).rows.length,23); }
 finally { await t.stop(); }
});

test('editor section migration preserves existing published pages and only expands allowed document IDs',async()=>{
 const t=await testDatabase();
 try{
  const actor=randomUUID();await t.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
  // Recreate the prior constraint with a saved production-shaped document.
  await t.db.pool.query("ALTER TABLE site_pages DROP CONSTRAINT site_pages_id_check; ALTER TABLE site_pages ADD CONSTRAINT site_pages_id_check CHECK (id IN ('home','about','faq','delivery','support','where-to-buy'))");
  const draft=structuredClone(sitePageDefaults.home),published=structuredClone(draft);draft.blocks[0]!.values.title='Черновик до обновления';
  await t.db.pool.query('INSERT INTO site_pages(id,revision,draft,published,published_at,updated_by) VALUES($1,7,$2,$3,now(),$4)',['home',JSON.stringify(draft),JSON.stringify(published),actor]);
  const before=(await t.db.pool.query("SELECT * FROM site_pages WHERE id='home'")).rows[0];
  await t.db.transaction(tx=>tx.query(editorMigrationSql));
  const after=(await t.db.pool.query("SELECT * FROM site_pages WHERE id='home'")).rows[0];assert.deepEqual(after,before);
  for(const id of ['header','footer','returns','requisites','instructions','privacy','personal-data','offer','cookies'] as const){
   // The historical migration still accepts its original IDs; v3 no longer exposes cookies in the editor.
   await t.db.pool.query('INSERT INTO site_pages(id,revision,draft,updated_by) VALUES($1,1,$2,$3)',[id,JSON.stringify(id==='cookies'?{id,blocks:[]}:sitePageDefaults[id]),actor]);
  }
  await assert.rejects(t.db.pool.query('INSERT INTO site_pages(id,revision,draft,updated_by) VALUES($1,1,$2,$3)',['unknown',JSON.stringify(draft),actor]),/site_pages_id_check/);
 }finally{await t.stop();}
});
const editorMigrationSql=await readFile(resolve('migrations/019_site_editor_sections.sql'),'utf8');
