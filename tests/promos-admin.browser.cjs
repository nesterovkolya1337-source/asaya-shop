// UI smoke uses local HTTP fixtures; no live service or real checkout is called.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.MARKETING_TEST_URL||'http://127.0.0.1:3372';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const defaults={twoPercent:5,threePercent:10,freeShippingMinor:100000};let promoRows=[];let state={revision:0,defaults:{...defaults},draft:{...defaults},live:{...defaults}},role='administrator';
  await page.addInitScript(()=>{localStorage.setItem('asaya-cookie-choice-v1','essential');sessionStorage.setItem('asaya-backend-cart-v1',JSON.stringify({'marketing-item':1}));});
  await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname;
   const json=(v,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
   if(url.origin!==base)return route.abort();
   if(path==='/api/admin/v1/auth/me')return json({user:{id:'20000000-0000-4000-8000-000000000002',role:'admin',staffRole:role},csrfToken:'a'.repeat(64)});
   if(path==='/api/admin/v1/promos'&&req.method()==='GET')return json({items:promoRows,total:promoRows.length,nextOffset:null});
   if(path==='/api/admin/v1/promos'&&req.method()==='POST'){assert.equal(req.headers()['x-csrf-token'],'a'.repeat(64));promoRows=[{...req.postDataJSON(),id:'10000000-0000-4000-8000-000000000001',used:0,discount_total_minor:'0'}];return json({id:promoRows[0].id});}
   if(path==='/api/admin/v1/promos/bulk'){assert.equal(req.postDataJSON().confirmed,true);assert.equal(req.postDataJSON().ids.length,1);promoRows=[];return json({count:1});}
   if(path==='/api/admin/v1/marketing')return json(state);
   if(path==='/api/admin/v1/marketing/reviews'||path==='/api/admin/v1/trash'||path==='/api/admin/v1/media')return json({items:[]});
   if(path.startsWith('/api/admin/v1/marketing/')){const body=req.postDataJSON(),action=path.split('/').pop();assert.equal(req.headers()['x-csrf-token'],'a'.repeat(64));assert.equal(body.revision,state.revision);state={...state,revision:state.revision+1};if(action==='save')state.draft=body.settings;if(action==='publish')state.live={...state.draft};if(action==='defaults'){assert.equal(body.confirmed,true);state.defaults=body.settings;}return json(state);}
   if(path==='/api/store/v1/products')return json({items:[{sku:'M-SKU',slug:'marketing-item',name:'Тестовый товар',currency:'RUB',regularMinor:100000,finalMinor:80000,available:10,stockState:'known',content:{category:'body',setKind:'none',description:'Test',volume:'100 мл',usage:'',ingredients:'',aroma:'',image:'/images/test.webp',gallery:[],badge:'',safety:'',features:[],recommendations:[],sensory:[],instruction:{steps:[],amount:'',tip:''}}}]});
   if(path==='/api/store/v1/cart/pricing'){const items=req.postDataJSON().items,q=items.reduce((s,i)=>s+i.quantity,0),percent=q>=3?state.live.threePercent:q===2?state.live.twoPercent:0,unitMinor=Math.floor(80000*(100-percent)/10000)*100,subtotalMinor=q*unitMinor;return json({items:items.map(i=>({...i,unitMinor})),eligibleUnits:q,percent,subtotalMinor,discountMinor:q*80000-subtotalMinor,shippingRemainingMinor:Math.max(0,state.live.freeShippingMinor-subtotalMinor),settings:state.live});}
   if(path==='/api/admin/v1/products')return json({items:[],nextOffset:null});
   if(path.startsWith('/api/'))return json({},503);
   return route.continue();
  });
  await page.goto(base+'/admin/');await page.getByRole('button',{name:'Маркетинг',exact:true}).click();
  const marketing=page.getByRole('region',{name:'Маркетинг'});
  await marketing.getByRole('button',{name:'Промокоды',exact:true}).click();
  const promos=page.getByRole('region',{name:'Промокоды'});
  await promos.getByRole('button',{name:'Создать промокод'}).click();
  await promos.getByLabel('Код',{exact:true}).fill('TEST10');
  await promos.getByLabel('Разрешить повторное использование').check();
  await promos.getByRole('button',{name:'Сохранить промокод',exact:true}).click();
  await promos.getByText('Промокод сохранён.',{exact:true}).waitFor();
  await promos.getByLabel('Выбрать TEST10',{exact:true}).check();
  await promos.getByRole('button',{name:'В архив',exact:true}).click();
  await promos.getByText('Подтвердите архивацию 1 промокодов.',{exact:true}).waitFor();
  await promos.getByRole('button',{name:'Подтвердить',exact:true}).click();
  await promos.getByText('Обработано: 1',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('Promos Admin create/archive passed '+width);await context.close();
 }
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
