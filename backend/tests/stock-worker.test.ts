import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runStockWorker} from '../src/stock-sync.js';
import {CdekStockApi} from '../src/cdek-stock-source.js';
import {DomainError} from '../src/core.js';
test('production profile uses live FF warehouse 23401 and 300-second worker without overlap, recovers after failure and stops',async()=>{
 const profile=JSON.parse(await readFile('../deploy/catalog/stock-api.production.json','utf8'));
 assert.equal(profile.pollSeconds,300);assert.equal(profile.maxAgeSeconds,900);assert.equal(profile.externalWarehouseId,'23401');assert.equal(profile.kind,'cdek_ff_api');assert.equal(profile.login,undefined);assert.equal(profile.password,undefined);
 const source=new CdekStockApi({...profile,login:'fixture',password:'secret'}),controller=new AbortController();
 let calls=0,active=false;const waits:number[]=[],reports:unknown[]=[];
 await runStockWorker({source,refresh:async()=>{assert.equal(active,false);active=true;calls++;await Promise.resolve();active=false;if(calls===1)throw new DomainError('STOCK_SOURCE_UNAVAILABLE');return {skipped:true,reason:'not_due'} as const;}},controller.signal,e=>reports.push(e),async(ms)=>{assert.equal(active,false);waits.push(ms);if(calls===3)controller.abort();});
 assert.equal(calls,3);assert.deepEqual(waits,[300000,300000,300000]);assert.deepEqual(reports,[{event:'stock.refresh_failed',code:'STOCK_SOURCE_UNAVAILABLE'}]);
});
test('offline config preparation uses secret environment, refuses overwrite and never prints credentials',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'asaya-stock-config-')),file=join(dir,'stock.json');
 const run=promisify(execFile),args=['dist/scripts/prepare-stock-config.js','../deploy/catalog/stock-api.production.json',file];
 const env={...process.env,CDEK_FF_LOGIN:'fixture-login',CDEK_FF_PASSWORD:'fixture-secret'};
 try{
  const r=await run(process.execPath,args,{env});assert.ok(r.stdout.includes('STOCK_CONFIG_PREPARED'));assert.ok(!r.stdout.includes('fixture-secret'));
  const config=JSON.parse(await readFile(file,'utf8'));assert.equal(config.pollSeconds,300);assert.equal(config.password,'fixture-secret');
  await assert.rejects(run(process.execPath,args,{env}),e=>!String(e).includes('fixture-secret'));
  assert.equal(JSON.parse(await readFile(file,'utf8')).password,'fixture-secret');
 }finally{await unlink(file).catch(()=>{});await rmdir(dir);}
});
