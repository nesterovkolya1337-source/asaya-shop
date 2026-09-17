const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const content={description:'Проверка оформления',volume:'300 мл',category:'body',setKind:'none',usage:'Для проверки',ingredients:'Состав',aroma:'',features:[],image:'/images/figma/ugc-red-product.webp',gallery:[],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]};
const products=[{sku:'TASK4-A',slug:'task4-a',name:'Товар А',content,currency:'RUB',regularMinor:80000,finalMinor:69000,available:5},{sku:'TASK4-B',slug:'task4-b',name:'Товар Б',content,currency:'RUB',regularMinor:90000,finalMinor:80000,available:8}];
const base=process.env.ASAYA_TEST_ORIGIN || 'http://127.0.0.1:3340';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local preview only');
const artifacts=process.env.ASAYA_BROWSER_OUTPUT || __dirname;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[],requests=[],redirects=[];let status=409,stock=5,catalogError=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{sessionStorage.setItem('asaya-backend-cart-v1',JSON.stringify({'task4-a':2,'task4-b':3}));localStorage.setItem('asaya-cookie-choice-v1','essential');});
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.hostname==='checkout.kit.yandex.ru'){redirects.push(u.href);return route.fulfill({contentType:'text/html',body:'<h1>Intercepted checkout; no real request</h1>'});}
   if(u.hostname!=='127.0.0.1')return route.abort();
   if(u.pathname==='/api/store/v1/products')return route.fulfill({status:catalogError?503:200,contentType:'application/json',body:JSON.stringify({items:[{...products[0],available:stock},products[1]]})});
   if(u.pathname==='/api/store/v1/yandex/checkout-link'){
    requests.push({body:req.postDataJSON(),key:req.headers()['idempotency-key']});await new Promise(r=>setTimeout(r,150));
    const data=Buffer.from(JSON.stringify({items:req.postDataJSON().items.map(i=>({id:'offer-'+i.sku,quantity:i.quantity,price:800,final_price:690}))})).toString('base64');
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?{url:'https://checkout.kit.yandex.ru/express?host=asaya.example.test&data='+encodeURIComponent(data)}:{error:'fixture'})});
   }
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{}'});
   return route.continue();
  });
  await page.goto(base+'/cart/');const button=page.getByRole('button',{name:'Оформить в Яндексе',exact:true});await button.waitFor();
  // Only act on visible banner controls; acceptance does not authorize tracking/network in this test.
  const cookie=page.getByRole('button',{name:/Только необходимые|Отклонить|Необязательные отключить/}).first();if(await cookie.isVisible().catch(()=>false))await cookie.click();
  await button.click();await page.getByRole('alert').filter({hasText:'Корзина изменилась'}).waitFor();
  assert.deepEqual(requests[0].body,{items:[{sku:'TASK4-A',quantity:2},{sku:'TASK4-B',quantity:3}]});assert.equal(redirects.length,0);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('asaya-backend-cart-v1'))),{'task4-a':2,'task4-b':3});
  status=503;await button.click();await page.getByRole('alert').filter({hasText:'пока недоступно'}).waitFor();
  assert.equal(redirects.length,0);status=200;
  const count=requests.length;await button.evaluate(b=>{b.click();b.click();});await page.waitForURL('https://checkout.kit.yandex.ru/**');assert.equal(requests.length,count+1);
  assert.deepEqual(Object.keys(JSON.parse(Buffer.from(new URL(redirects.at(-1)).searchParams.get('data'),'base64').toString())),['items']);
  // Old checkout bookmark presents the same cart, with no customer address/order form.
  await page.goto(base+'/checkout/');await button.waitFor();assert.equal(await page.locator('main form').count(),0);
  stock=0;await page.reload();await page.getByText('Недостаточно товара. Доступно: 0.',{exact:true}).waitFor();assert.equal(await button.isDisabled(),true);
  catalogError=true;await page.reload();await page.getByRole('alert').filter({hasText:'Каталог недоступен'}).waitFor();assert.equal(await button.count(),0);catalogError=false;stock=5;
  await page.goto(base+'/product/task4-a/');const sticky=page.getByRole('complementary',{name:'Быстрая покупка'}).getByRole('button',{name:'Купить сейчас',exact:true});await sticky.waitFor();assert.equal(await sticky.isVisible(),true);
  assert.equal(await page.locator('a[href="/checkout/"]').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(artifacts,`task4-product-${width}.png`),fullPage:true});
  await sticky.click();await page.waitForURL('https://checkout.kit.yandex.ru/**');assert.deepEqual(requests.at(-1).body,{items:[{sku:'TASK4-A',quantity:2}]});
  assert.deepEqual(errors,[]);results.push({width,guestCart:true,allLines:true,conflictAndFailurePreserveCart:true,doubleClickSingleRequest:true,officialRedirectIntercepted:true,oldCheckoutUsesCart:true,zeroStockAndCatalogErrorBlock:true,mobileStickyVisible:true,noOverflow:true,noPageErrors:true});await page.close();
 }
 await fs.writeFile(path.join(artifacts,'task4-browser-check.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
