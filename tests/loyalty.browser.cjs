const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.LOYALTY_TEST_URL||'http://127.0.0.1:3372';
const output='test-artifacts/loyalty';fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('asaya-cookie-choice-v1','essential'));
  await page.route('**/*',route=>{
   const u=new URL(route.request().url()),json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(u.origin!==base)return route.abort();
   if(u.pathname.endsWith('/auth/methods'))return json({sms:true,orders:true,yandex:false});
   if(u.pathname.endsWith('/auth/me'))return json({id:'20000000-0000-4000-8000-000000000002',role:'customer',csrfToken:'a'.repeat(64)});
   if(u.pathname.endsWith('/account/profile'))return json({name:'Анна',phone:'+79991234567',email:''});
   if(u.pathname.endsWith('/account/loyalty'))return json({balance:30,pointRubles:1,redemptionAvailable:false,history:[{date:'2026-09-21T10:00:00Z',points:30,description:'Баллы за покупку',status:'posted',orderNumber:'ASAYA-10001'}]});
   if(u.pathname.endsWith('/orders')||u.pathname.endsWith('/products'))return json({items:[]});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,body:'{}'});
   return route.continue();
  });
  await page.goto(base+'/account/');
  await page.getByRole('navigation',{name:'Разделы личного кабинета'}).getByRole('button',{name:'Бонусы',exact:true}).click();
  await page.getByRole('heading',{name:'30 баллов',exact:true}).waitFor();
  await page.getByText('Баллы за покупку · Заказ ASAYA-10001',{exact:true}).waitFor();
  await page.getByText('Списание баллов при оформлении пока недоступно.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`${output}/loyalty-${width}.png`,fullPage:true});
  console.log(JSON.stringify({width,balance:true,history:true,publicOrderNumber:true,noOverflow:true,errors}));
  await context.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
