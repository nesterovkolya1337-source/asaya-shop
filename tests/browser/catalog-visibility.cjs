const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.ASAYA_TEST_ORIGIN||'http://127.0.0.1:3340';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local preview only');
const out=process.env.ASAYA_BROWSER_OUTPUT||__dirname;
const content={description:'Visible description',volume:'300 ml',category:'hair',setKind:'none',usage:'Visible usage',ingredients:'Visible ingredients',aroma:'',features:[],image:'/images/figma/ugc-red-product.webp',gallery:[],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:['visible-body'],sensory:[],placement:{catalogOrder:0,bestsellerOrder:0,newOrder:0}};
const items=['hair','body','face'].map((category,i)=>({sku:'VISIBLE-'+i,slug:'visible-'+category,name:'Visible '+category,content:{...content,category},currency:'RUB',regularMinor:50000,finalMinor:50000,available:0}));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});let stock=0,visible=true;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('asaya-cookie-choice-v1','essential'));
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
   if(u.pathname==='/api/store/v1/products')return route.fulfill({contentType:'application/json',body:JSON.stringify({items:visible?items.map(p=>({...p,available:stock})):[]})});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{}'});
   return route.continue();
  });
  await page.goto(base+'/');await page.locator('article#visible-hair').waitFor();
  await page.getByRole('button',{name:'Новинки',exact:true}).click();await page.locator('article#visible-body').waitFor();
  for(const category of ['hair','body','face']){
   await page.goto(base+'/catalog/?category='+category);await page.locator('article#visible-'+category).waitFor();
   assert.equal(await page.locator('article#visible-'+category).getByRole('button',{name:'Нет в наличии',exact:true}).isDisabled(),true);
  }
  await page.goto(base+'/catalog/');const search=page.getByPlaceholder('Поиск по каталогу');await search.fill('Visible face');await page.locator('article#visible-face').waitFor();assert.equal(await page.locator('article#visible-hair').count(),0);
  for(const amount of [0,5,0]){
   stock=amount;await page.goto(base+'/product/visible-hair/');await page.getByRole('heading',{name:'Visible hair',exact:true}).waitFor();
   await page.getByText('Visible description',{exact:true}).waitFor();await page.locator('article#visible-body').waitFor();
   if(!amount){assert.equal(await page.getByRole('button',{name:'Нет в наличии',exact:true}).first().isDisabled(),true);}
   else { // Deployment-wide purchase gate remains independent of stock.
    await page.getByText('В наличии',{exact:true}).waitFor();
    if(process.env.ASAYA_TEST_PURCHASE_ENABLED==='true')assert.equal(await page.getByRole('button',{name:'Добавить в корзину',exact:true}).isEnabled(),true);
   }
  }
  await page.screenshot({path:path.join(out,`task09-pdp-${width}.png`),fullPage:true});
  visible=false;stock=5;await page.reload();await page.getByRole('heading',{name:'Вернёмся к каталогу?'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Visible hair',exact:true}).count(),0);
  assert.deepEqual(errors,[]);results.push({width,zeroStockHome:true,newSelection:true,categories:true,search:true,pdpContent:true,recommendations:true,zeroFiveZero:true,unpublishedHidden:true,noPageErrors:true});await page.close();
 }}finally{await browser.close();}
 await fs.writeFile(path.join(out,'task09-browser.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
