const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.ASAYA_TEST_ORIGIN||'http://127.0.0.1:3340';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local preview only');
const out=process.env.ASAYA_BROWSER_OUTPUT||__dirname;
const content={description:'Cart stock test',volume:'300 ml',category:'body',setKind:'none',usage:'',ingredients:'',aroma:'',features:[],image:'/images/figma/ugc-red-product.webp',gallery:[],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]};
const products=[{slug:'stock-a',sku:'STOCK-A',name:'Товар А',regularMinor:120000,finalMinor:120000},{slug:'stock-b',sku:'STOCK-B',name:'Товар Б',regularMinor:30000,finalMinor:30000}].map(p=>({...p,content,currency:'RUB'}));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[],redirects=[];
  let stocks=[0,1],states=['known','known'],catalogError=false,postStatus=503,conflict=false,gate=null,reads=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{if(!sessionStorage.getItem('asaya-backend-cart-v1'))sessionStorage.setItem('asaya-backend-cart-v1',JSON.stringify({'stock-a':2,'stock-b':3}));localStorage.setItem('asaya-cookie-choice-v1','essential');});
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.hostname==='checkout.kit.yandex.ru'){redirects.push(u.href);return route.fulfill({contentType:'text/html',body:'<h1>Intercepted checkout; no real order</h1>'});}
   if(u.hostname!=='127.0.0.1')return route.abort();
   if(u.pathname==='/api/store/v1/products'){
    reads++;if(gate)await gate;
    return route.fulfill({status:catalogError?503:200,contentType:'application/json',body:JSON.stringify({items:products.map((p,i)=>({...p,available:stocks[i],stockState:states[i]}))})});
   }
   if(u.pathname==='/api/store/v1/yandex/checkout-link'){
    requests.push(req.postDataJSON());if(conflict)stocks=[0,0];
    return route.fulfill({status:postStatus,contentType:'application/json',body:JSON.stringify(postStatus===200?{url:'https://checkout.kit.yandex.ru/express?host=asaya.example.test&data=intercepted'}:{error:'fixture'})});
   }
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{}'});
   return route.continue();
  });
  const rowA=page.locator('[data-cart-id="stock-a"]'),rowB=page.locator('[data-cart-id="stock-b"]');
  const button=page.getByRole('button',{name:'Оформить в Яндексе',exact:true}),refresh=page.getByRole('button',{name:'Обновить цены и наличие',exact:true});
  const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Обновить цены и наличие'&&!b.disabled));
  const update=async()=>{await refresh.click();await ready();};
  const total=async expected=>assert.equal(await page.locator('main strong').textContent(),new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(expected));
  await page.goto(base+'/cart/');await ready();
  await rowA.getByText('Нет в наличии',{exact:true}).waitFor();assert.ok(Number(await rowA.evaluate(el=>getComputedStyle(el).opacity))<1);
  assert.equal(await rowA.getByRole('button',{name:'Увеличить количество Товар А'}).isDisabled(),true);
  await rowB.getByText('Количество изменилось. Доступно к оформлению: 1 из 3.',{exact:true}).waitFor();
  await total(300);assert.equal(await button.isEnabled(),true);
  await page.getByText(/До бесплатной доставки в ПВЗ СДЭК — 700/).waitFor();
  await page.screenshot({path:path.join(out,`task08-mixed-${width}.png`),fullPage:true});
  await button.click();await page.getByRole('alert').filter({hasText:'Оформление в Яндексе пока недоступно'}).waitFor();
  assert.deepEqual(requests.at(-1),{items:[{sku:'STOCK-B',quantity:1}]});assert.equal(redirects.length,0);
  await rowA.getByRole('button',{name:'Уменьшить количество Товар А'}).click();assert.equal(await rowA.locator('span').textContent(),'1');
  stocks=[5,2];await update();await total(1800);assert.equal(await rowA.evaluate(el=>getComputedStyle(el).opacity),'1');
  assert.equal(await rowA.getByRole('button',{name:'Увеличить количество Товар А'}).isEnabled(),true);
  await page.getByText(/Достигнут порог бесплатной доставки/).waitFor();
  // Source changes before the click: update UI first, no redirect or POST.
  const before=requests.length;stocks=[0,1];await button.click();
  await page.getByRole('alert').filter({hasText:'Наличие или цены изменились'}).waitFor();await total(300);assert.equal(requests.length,before);
  postStatus=200;await button.evaluate(b=>{b.click();b.click();});await page.waitForURL('https://checkout.kit.yandex.ru/**');
  assert.equal(requests.length,before+1);assert.deepEqual(requests.at(-1),{items:[{sku:'STOCK-B',quantity:1}]});
  stocks=[0,0];await page.goto(base+'/checkout/');await ready();assert.equal(await button.isDisabled(),true);
  assert.equal(await page.locator('main form').count(),0);await page.getByText('Сейчас в корзине нет товаров, доступных к оформлению.',{exact:true}).waitFor();await total(0);
  states=['unknown','known'];await update();await rowA.getByText('Наличие пока не подтверждено',{exact:true}).waitFor();
  assert.equal(await rowA.getByText('Нет в наличии',{exact:true}).count(),0);assert.equal(await button.isDisabled(),true);
  states=['known','known'];stocks=[5,5];await update();
  // Later server-side conflict also refreshes the UI rather than clearing the cart.
  postStatus=409;conflict=true;await button.click();await page.getByRole('alert').filter({hasText:'Наличие изменилось во время оформления'}).waitFor();
  assert.equal(await button.isDisabled(),true);await total(0);assert.equal(await page.locator('[data-cart-id]').count(),2);conflict=false;
  catalogError=true;await update();await page.getByRole('alert').filter({hasText:'Каталог недоступен'}).waitFor();
  assert.equal(await button.isDisabled(),true);assert.equal(await page.locator('[data-cart-id]').count(),2);
  assert.equal(await page.getByText('Нет в наличии',{exact:true}).count(),0);catalogError=false;stocks=[5,5];await update();
  // Cart edits while a recheck is pending cannot redirect the old cart.
  let release;gate=new Promise(r=>{release=r;});const n=requests.length,start=reads;
  await button.click();while(reads===start)await new Promise(r=>setTimeout(r,10));
  await rowB.getByRole('button',{name:'Уменьшить количество Товар Б'}).click();release();gate=null;await ready();
  assert.equal(requests.length,n);assert.equal(redirects.length,1);
  await rowA.getByRole('button',{name:'Удалить',exact:true}).click();assert.equal(await rowA.count(),0);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('asaya-backend-cart-v1'))),{'stock-b':2});
  // Next.js client navigation to cart rechecks stock, without a full reload.
  await page.getByRole('link',{name:'В каталог',exact:true}).click();await page.waitForURL('**/catalog/');
  const prior=reads;stocks=[0,0];await page.locator('a[href="/cart/"]').first().click();await page.waitForURL('**/cart/');await ready();
  assert.ok(reads>prior);await rowB.getByText('Нет в наличии',{exact:true}).waitFor();assert.equal(await button.isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  results.push({width,mixedPayloadOnlyAvailable:true,limitedQuantity:true,totalsAndDeliveryThreshold:true,restoredWithoutReadding:true,preflightChangeStopsRedirect:true,doubleClickSingleRequest:true,allUnavailableBlocked:true,unknownDistinct:true,conflictRefresh:true,failedFetchPreservesRows:true,cartEditCancelsTransition:true,manualRemoval:true,clientNavigationRechecks:true,noOverflow:true,noPageErrors:true});
  await page.close();
 }}finally{await browser.close();}
 await fs.writeFile(path.join(out,'task08-browser.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
