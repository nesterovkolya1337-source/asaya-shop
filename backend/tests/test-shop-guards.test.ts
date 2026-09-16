import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireLocalTestEnvironment,createTestShop} from '../scripts/test-shop-app.js';
import type {Database} from '../src/db.js';

test('local test launcher refuses every external database or deployment configuration',()=>{
 assert.doesNotThrow(()=>requireLocalTestEnvironment({NODE_ENV:'test'}));
 for(const env of [{NODE_ENV:'production'},{DATABASE_URL:'postgres://live'},{ASAYA_ISOLATED_TEST_DATABASE_URL:'postgres://remote'},
  {YCP_TOKEN:'secret'},{YCP_SETTINGS_FILE:'live.json'},{DEPLOYMENT_MODE:'ycp'}])assert.throws(()=>requireLocalTestEnvironment(env));
});
test('test catalog refuses a non-empty database before any write',async()=>{
 let reads=0;
 const db={pool:{async query(sql:string){reads++;assert.ok(sql.startsWith('SELECT '));return {rows:[{n:'1'}]};}}} as unknown as Database;
 await assert.rejects(createTestShop(db,[{sku:'TEST',name:'Test',slug:'test'}]),/new empty database/);
 assert.equal(reads,1);
});
