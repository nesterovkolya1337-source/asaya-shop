// Production components, local intercepted API fixtures. Never sends SMS/orders/payments.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.CART_UI_URL||'http://127.0.0.1:3380',out='test-artifacts/cart-ui-v2';fs.mkdirSync(out,{recursive:true});
const content={category:'hair',setKind:'none',description:'',volume:'300 мл',usage:'',ingredients:'',aroma:'',gallery:[],badge:'',safety:'',features:[],recommendations:[],sensory:[],instruction:{steps:[],amount:'',tip:''}};
const catalog=[['hair-balm','Бальзам для волос'],['hair-shampoo','Шампунь для волос'],['multi-hair-spray','Мульти спрей для волос'],['coconut-body-cream','Крем для тела'],['avocado-body-cream','Питательный крем для тела']].map(([slug,name],i)=>({sku:'SKU-'+i,slug,name,currency:'RUB',regularMinor:100000,finalMinor:79900,available:10,stockState:'known',content:{...content,image:'/images/figma/page2-packshots/'+slug+'.webp'}}));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];try{for(const width of [1440,390]){
 const c=await browser.newContext({viewport:{width,height:960}}),p=await c.newPage();let signed=false,available=10,checkoutPosts=0,recommendationsAdded=false;const errors=[],privateRequests=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('asaya-cookie-choice-v1','essential');sessionStorage.setItem('asaya-backend-cart-v1',JSON.stringify({'hair-balm':1}));});
 await p.route('**/*',async r=>{const req=r.request(),u=new URL(req.url()),path=u.pathname;const json=(x,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(x)});
 if(u.origin==='https://checkout.kit.yandex.ru')return r.fulfill({contentType:'text/html',body:'<h1>Checkout destination intercepted</h1>'});
 if(u.origin!==base)return r.abort();
 if(path.startsWith('/api/admin/')){privateRequests.push(path);return json({},403);}
 if(path==='/api/store/v1/products')return json({items:catalog.map((x,i)=>i===0?{...x,available}:x)});
 if(path==='/api/store/v1/cart/pricing'){const items=req.postDataJSON().items,q=items.reduce((n,i)=>n+i.quantity,0),percent=q>=3?10:q===2?5:0,unitMinor=Math.floor(79900*(100-percent)/10000)*100,subtotalMinor=q*unitMinor;return json({items:items.map(i=>({...i,unitMinor})),eligibleUnits:q,percent,subtotalMinor,discountMinor:q*79900-subtotalMinor,shippingRemainingMinor:Math.max(0,100000-subtotalMinor),settings:{twoPercent:5,threePercent:10,freeShippingMinor:100000},loyalty:signed?{balance:230,maximum:100,redemptionAvailable:false}:null});}
 if(path==='/api/store/v1/yandex/checkout-link'){checkoutPosts++;assert.deepEqual(req.postDataJSON(),{items:[{sku:'SKU-0',quantity:3}]});assert.ok(req.headers()['idempotency-key']);return json({url:'https://checkout.kit.yandex.ru/express?host=asaya.ru&data=test'});}
 if(path==='/api/store/v1/auth/methods')return json({sms:true,orders:true,yandex:false});
 if(path.startsWith('/api/'))return json({},503);
 return r.continue();});
 await p.goto(base+'/cart/');const main=p.locator('main'),progress=p.getByRole('progressbar'),cta=p.getByRole('button',{name:'Оформить заказ',exact:true});
 await p.getByText('Добавьте ещё 1 товар — получите скидку 5%',{exact:true}).waitFor();assert.ok(await cta.isEnabled());assert.equal(await main.getByRole('button',{name:'Обновить цены и наличие'}).count(),0);assert.equal(await main.getByText(/Регистрация на ASAYA/).count(),0);assert.equal(await main.getByLabel('Бонусы в корзине').count(),0);assert.equal(await progress.getAttribute('value'),'79.9');
 const rec=p.getByRole('region',{name:'Рекомендуем добавить'});assert.equal(await rec.locator('article').count(),4);assert.equal(await rec.locator('[data-recommendation-id="hair-balm"]').count(),0);assert.equal(await main.getByText(/Списание баллов/).count(),0);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:out+'/cart-guest-'+width+'.png',fullPage:true});
 await p.getByRole('button',{name:'Увеличить количество Бальзам для волос'}).click();await p.getByText('Добавьте ещё 1 товар — скидка увеличится до 10%',{exact:true}).waitFor();assert.equal(await progress.getAttribute('value'),'100');await p.getByText('Бесплатная доставка',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Увеличить количество Бальзам для волос'}).click();await p.getByText('Скидка 10% применена',{exact:true}).waitFor();assert.ok((await main.innerText()).includes('2 157,00'));
 await cta.click();await p.waitForURL('https://checkout.kit.yandex.ru/**');assert.equal(checkoutPosts,1);
 signed=true;await p.goto(base+'/cart/');await p.getByLabel('Бонусы в корзине').getByText('230',{exact:true}).waitFor();assert.equal(await main.getByText(/Списание баллов/).count(),0);assert.equal(await main.getByText(/Войти, чтобы/).count(),0);await p.screenshot({path:out+'/cart-member-'+width+'.png',fullPage:true});
 await rec.getByRole('button',{name:'Добавить в корзину Шампунь для волос'}).click();await p.locator('[data-cart-id="hair-shampoo"]').waitFor();assert.equal(await rec.locator('[data-recommendation-id="hair-shampoo"]').count(),0);recommendationsAdded=true;
 await p.getByRole('button',{name:'Удалить Шампунь для волос',exact:true}).click();await p.locator('[data-cart-id="hair-shampoo"]').waitFor({state:'detached'});
 available=0;await p.reload();await p.getByRole('status').filter({hasText:'Нет в наличии'}).waitFor();assert.ok(await cta.isDisabled());assert.equal(await progress.count(),0);await p.screenshot({path:out+'/cart-unavailable-'+width+'.png',fullPage:true});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await p.getByRole('button',{name:'Удалить Бальзам для волос',exact:true}).click();await p.getByRole('heading',{name:'Корзина пока пуста'}).waitFor();assert.equal(await cta.count(),0);
 await p.goto(base+'/product/hair-shampoo/');const oneClick=p.getByRole('button',{name:'Купить в 1 клик',exact:true}).first();await oneClick.waitFor();assert.equal(await oneClick.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 32, 32)');
 assert.deepEqual(errors,[]);assert.deepEqual(privateRequests,[]);results.push({width,guestMember:true,discount123:true,deliveryBelowAbove:true,recommendationsAdded,canonicalCheckoutRequest:true,checkoutRedirect:true,zeroStockBlocked:true,noOverflow:true,errors});await c.close();
}fs.writeFileSync(out+'/result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
