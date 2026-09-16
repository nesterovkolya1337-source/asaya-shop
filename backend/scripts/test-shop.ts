import {readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {testDatabase} from '../tests/postgres.js';
import {createTestShop,requireLocalTestEnvironment,testShopOrigin} from './test-shop-app.js';

requireLocalTestEnvironment(process.env);
// Fail before making a DB if this address is already in use; never kill another service.
const probe=createServer();
await new Promise<void>((done,fail)=>{probe.once('error',fail);probe.listen(3216,'127.0.0.1',()=>probe.close(error=>error?fail(error):done()));});
const approvals=JSON.parse(await readFile('data/mapping-approvals.json','utf8'));
const source=JSON.parse(await readFile('data/source-catalog.json','utf8'));
const products=approvals.mappings.filter((p:{status:string})=>p.status==='approved').map((p:{sku:string;slug:string})=>{
 const rows=source.rows.filter((r:{sku:string})=>r.sku===p.sku);
 if(rows.length!==1)throw new Error('Ambiguous test catalog mapping: '+p.sku);
 return {sku:p.sku,slug:p.slug,name:rows[0].name};
});
console.log('Создаю отдельную временную базу тестового магазина…');
const ctx=await testDatabase();let shop:Awaited<ReturnType<typeof createTestShop>>|undefined;
let closing=false;
async function stop(){if(closing)return;closing=true;try{await shop?.app.close();await ctx.stop();}finally{process.exit(0);}}
try{
 shop=await createTestShop(ctx.db,products);
 await shop.app.listen({host:'127.0.0.1',port:3216});
 process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
 setTimeout(()=>void stop(),60*60*1000).unref();
 console.log('ASAYA_TEST_SHOP_READY');
 console.log('Открой эту одноразовую ссылку на этом компьютере:');
 console.log(shop.openUrl);
 console.log('Раздел «Тестовые остатки»: укажи количество и нажми «Сохранить».');
 console.log('Работает один час. Оставь это окно открытым. Ctrl+C завершает тест.');
 console.log('Все цены, габариты и операции условные. Яндекс, СДЭК и касса не вызываются.');
 console.log('При новом запуске создаётся чистая база с нулевыми остатками.');
}catch(error){await shop?.app.close();await ctx.stop();throw error;}
