const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.ASAYA_TEST_ORIGIN||'http://127.0.0.1:3360';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local preview only');
const content={description:'',volume:'',category:'body',setKind:'none',usage:'',ingredients:'',aroma:'',features:[],gallery:[],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{sessionStorage.setItem('asaya-backend-cart-v1',JSON.stringify({available:1,zero:1,broken:1,missing:1}));localStorage.setItem('asaya-cookie-choice-v1','essential');});
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
   if(u.pathname==='/api/store/v1/products')return route.fulfill({json:{items:['available','zero','broken'].map((slug,i)=>({slug,sku:slug,name:'Товар '+slug,currency:'RUB',regularMinor:10000,finalMinor:10000,available:i===1?0:2,stockState:'known',content:{...content,image:i===2?'/images/missing-cart-test.webp':'/images/figma/ugc-red-product.webp'}}))}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});return route.continue();
  });
  await page.goto(base+'/cart/');
  const row=id=>page.locator(`[data-cart-id="${id}"]`);
  await row('zero').getByText('Нет в наличии',{exact:true}).waitFor();
  for(const id of ['available','zero']){
   const img=row(id).locator('img');await img.waitFor();await img.evaluate(el=>el.decode());
   assert.equal(await row(id).locator(`a[href="/product/${id}/"]`).count(),2);
   const box=await img.boundingBox();assert.ok(box.width>=80&&box.height>=104);
  }
  await row('broken').getByText('Нет фото',{exact:true}).waitFor();await row('missing').getByText('Нет фото',{exact:true}).waitFor();
  assert.ok(Number(await row('zero').evaluate(el=>getComputedStyle(el).opacity))<1);
  assert.equal(await page.locator('[data-cart-id]').count(),4);
  assert.equal(await page.locator('main strong').textContent(),new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(200));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('asaya-backend-cart-v1')));assert.deepEqual(saved,{available:1,zero:1,broken:1,missing:1});
  assert.deepEqual(errors,[]);
  if(process.env.ASAYA_BROWSER_OUTPUT)await page.screenshot({path:process.env.ASAYA_BROWSER_OUTPUT+`/cart-images-${width}.png`,fullPage:true});
  console.log(JSON.stringify({width,canonicalImages:true,pdpLinks:true,placeholders:true,zeroStockRetained:true,total:200,noOverflow:true,noPageErrors:true}));await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
