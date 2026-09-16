import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { mkdir,writeFile,unlink } from 'node:fs/promises';
import { execFile,spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { Database,migrate } from '../src/db.js';
export async function testDatabase() {
 const isolatedUrl=process.env.ASAYA_ISOLATED_TEST_DATABASE_URL;
 if(isolatedUrl){
  const url=new URL(isolatedUrl);
  if(url.pathname!=='/asaya_test_control'||url.username!=='asaya_test_runner')throw new Error('Explicit isolated test database credentials are required');
  const control=new Database(isolatedUrl),name='asaya_test_'+randomBytes(12).toString('hex');
  await control.pool.query(`CREATE DATABASE "${name}"`);
  url.pathname='/'+name;const db=new Database(url.toString());
  const stop=async()=>{await db.close();try{await control.pool.query(`DROP DATABASE "${name}"`);}finally{await control.close();}};
  try{await migrate(db);}catch(error){await stop();throw error;}
  return {db,stop};
 }
 const server=createServer();
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const addr=server.address(); if(!addr||typeof addr==='string') throw new Error('No test port');
 const port=addr.port; await new Promise<void>(r=>server.close(()=>r()));
 const dir=resolve('.test-data',randomBytes(8).toString('hex')); await mkdir(dir,{recursive:true});
 const password=randomBytes(24).toString('hex');
 const binaryDir=process.platform==='win32' ? resolve(dirname(createRequire(import.meta.url).resolve('@embedded-postgres/windows-x64')),'../native/bin') : '';
 const run=promisify(execFile);
 const ctl=(args:string[])=>new Promise<void>((done,fail)=>{
  const child=spawn(resolve(binaryDir,'pg_ctl.exe'),args,{windowsHide:true,stdio:'ignore'});
  child.once('error',fail); child.once('exit',code=>code===0?done():fail(new Error(`pg_ctl exited ${code}; inspect ${dir}/postgres.log`)));
 });
 const pg=process.platform==='win32' ? {
  initialise:async()=>{
   const pw=resolve(dir,'password'); await writeFile(pw,password,{mode:0o600});
   try { await run(resolve(binaryDir,'initdb.exe'),['-D',resolve(dir,'cluster'),'-U','postgres','--pwfile',pw,'--auth=scram-sha-256','--encoding=UTF8','--locale=C'],{windowsHide:true}); }
   finally {await unlink(pw);}
  },
  start:()=>ctl(['-D',resolve(dir,'cluster'),'-l',resolve(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']),
  stop:()=>ctl(['-D',resolve(dir,'cluster'),'-m','fast','-w','stop'])
 } : new (await import('embedded-postgres')).default({databaseDir:dir,user:'postgres',password,port,persistent:true,
  authMethod:'scram-sha-256',initdbFlags:['--encoding=UTF8','--locale=C'],
  postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
 await pg.initialise(); await pg.start();
 const db=new Database(`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`);
 try { await migrate(db); } catch(e) { await db.close(); await pg.stop(); throw e; }
 return {db,stop:async()=>{await db.close(); await pg.stop();}};
}
