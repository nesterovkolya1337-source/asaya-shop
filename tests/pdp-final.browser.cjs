const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.PDP_TEST_URL||'http://127.0.0.1:3384',out='test-artifacts/pdp-final';fs.mkdirSync(out,{recursive:true});
const ts=require('typescript'),Module=require('node:module');
const mod=new Module(require('node:path').resolve('src/lib/store-data.ts'));
mod._compile(ts.transpileModule(fs.readFileSync('src/lib/store-data.ts','utf8').replace('import { assetPath } from "@/lib/asset-path";','const assetPath=(p:string)=>p;'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,require('node:path').resolve('src/lib/store-data.ts'));
const seeds=JSON.parse(fs.readFileSync('backend/data/pdp-rich-content-v2.json','utf8'));
const pdp=seeds.find(e=>e.sku==='1S-BA-02-02').pdp;
const slugs=['guava-shower-gel','coconut-body-cream','hair-balm','hair-shampoo','kiwi-shower-gel','strawberry-shower-gel'];
const skus=['1S-BA-02-02','1S-BA-03','1S-HK-03','1S-HK-01','1S-BA-02-04','1S-BA-02-01'];
const catalog=slugs.map((slug,i)=>{const p=mod.exports.defaultProducts.find(p=>p.id===slug);const {id,name,price,oldPrice,stock,active,rating,reviews,discount,...content}=p;return {sku:skus[i],slug,name,currency:'RUB',regularMinor:Math.max(price,oldPrice)*100,finalMinor:price*100,available:10,testMode:true,stockState:'known',content:{...content,safety:'',setKind:'none',...(i===0?{pdp}:{})}};});
const content=catalog[0].content,image=content.image,firstFaq=pdp.sections.find(s=>s.kind==='faq').items[0];

(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});const report=[];try{
for(const width of [1440,390]){
 const c=await b.newContext({viewport:{width,height:960},deviceScaleFactor:1}),p=await c.newPage(),errors=[],images=new Map();
 p.on('pageerror',e=>errors.push(e.message));const client=await c.newCDPSession(p);await client.send('Network.enable');await client.send('Network.setCacheDisabled',{cacheDisabled:true});
 client.on('Network.responseReceived',e=>{if(e.type==='Image')images.set(e.requestId,{url:e.response.url,bytes:0});});client.on('Network.loadingFinished',e=>{if(images.has(e.requestId))images.get(e.requestId).bytes=e.encodedDataLength;});
 let buyer=false,alreadyReviewed=false,reviewItems=[];
 await p.addInitScript(()=>localStorage.setItem('asaya-cookie-choice-v1','essential'));
 await p.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;let data={items:[],total:0,average:null};
 if(path==='/api/store/v1/products')data={items:catalog};
 if(path.startsWith('/api/store/v1/reviews/'))data={items:reviewItems};
 if(path==='/api/store/v1/account/engagement')return r.fulfill({status:buyer?200:401,contentType:'application/json',body:JSON.stringify(buyer?{products:[{id:'p',slug:slugs[0],reviewed:alreadyReviewed}],reminders:[],code:''}:{code:'UNAUTHENTICATED'})});
 return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await p.goto(base+'/product/guava-shower-gel/');await p.getByRole('heading',{level:1,name:catalog[0].name}).waitFor().catch(async e=>{console.log((await p.locator('body').innerText()).slice(0,3000),errors);throw e;});await p.waitForTimeout(2000);
 const total=()=>[...images.values()].reduce((s,i)=>s+i.bytes,0);const initial=total();
 const reviews=p.locator('[data-product-reviews]'),rich=p.locator('[data-rich-content]'),cta=p.locator('[data-main-buy]'),sticky=p.getByRole('complementary',{name:'Быстрая покупка'});
 assert.ok(await reviews.evaluate(e=>!!e.nextElementSibling?.hasAttribute('data-rich-content')));assert.equal(await reviews.getByText('Отзывов пока нет',{exact:true}).count(),1);assert.equal(await reviews.getByRole('link',{name:'Оставить отзыв'}).count(),0);
 assert.ok(await rich.locator('img[data-site-image]').evaluateAll(imgs=>imgs.every(i=>i.loading==='lazy')));
 if(width===390){assert.equal(await sticky.isVisible(),false);await cta.scrollIntoViewIfNeeded();await p.waitForTimeout(100);assert.equal(await sticky.isVisible(),false);await reviews.scrollIntoViewIfNeeded();await p.waitForTimeout(200);assert.equal(await sticky.isVisible(),true);await cta.scrollIntoViewIfNeeded();await p.waitForTimeout(200);assert.equal(await sticky.isVisible(),false);
 const steps=rich.locator('[class*="steps"]').first();assert.ok(await steps.evaluate(e=>e.scrollWidth>e.clientWidth&&getComputedStyle(e).overflowX==='auto'));const ratio=await steps.evaluate(e=>e.firstElementChild.getBoundingClientRect().width/e.clientWidth);assert.ok(ratio>.66&&ratio<1);
 }else{const media=p.locator('[class*="galleryColumn"]').first(),before=await media.boundingBox();await p.getByRole('region',{name:'Информация о товаре'}).locator('details').evaluateAll(ds=>ds.forEach(d=>d.open=true));assert.ok(Math.abs(before.height-(await media.boundingBox()).height)<1);}
 await p.evaluate(()=>scrollTo(0,0));for(let y=0;y<await p.evaluate(()=>document.documentElement.scrollHeight);y+=650){await p.evaluate(y=>scrollTo(0,y),y);await p.waitForTimeout(150);}if(width===390){const rail=rich.locator('[class*="steps"]').first();await rail.scrollIntoViewIfNeeded();for(let x=0;x<await rail.evaluate(e=>e.scrollWidth);x+=200){await rail.evaluate((e,x)=>e.scrollLeft=x,x);await p.waitForTimeout(150);}await rail.evaluate(e=>e.scrollLeft=0);}
 await p.waitForFunction(()=>[...document.querySelectorAll('[data-rich-content] img')].every(i=>i.complete&&i.naturalWidth>0));await p.waitForTimeout(500);
 const allowed=new Set();function collect(v){if(!v||typeof v!=='object')return;if(v.src)allowed.add(v.src);Object.values(v).forEach(collect);}collect(pdp.sections);const manifest=JSON.parse(fs.readFileSync('src/lib/rich-image-variants.json','utf8'));const allowedUrls=new Set([...allowed].flatMap(src=>(manifest[src]||[{src}]).map(v=>v.src)));
 for(const i of images.values())if(i.url.includes('/rich-content/'))assert.ok(allowedUrls.has(new URL(i.url).pathname),'Other SKU image '+i.url);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 const stats={width,initialImageBytes:initial,totalImageBytes:total(),richImageRequests:[...images.values()].filter(i=>i.url.includes('/rich-content/')).length,pageHeight:await p.evaluate(()=>document.documentElement.scrollHeight)};report.push(stats);
 await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(150);await p.screenshot({path:out+'/guava-'+width+'.png',fullPage:true});
 buyer=true;reviewItems=[{id:'r1',rating:5,body:'Приятный аромат и мягкое очищение.',reply:'Спасибо за отзыв!',created_at:'2026-09-22T12:00:00Z'}];await p.reload();await reviews.getByRole('link',{name:'Оставить отзыв',exact:true}).waitFor();await reviews.getByText('Спасибо за отзыв!',{exact:true}).waitFor();assert.equal(await reviews.getByLabel('Оценка 5 из 5').count(),1);await reviews.screenshot({path:out+'/reviews-'+width+'.png'});
 alreadyReviewed=true;await p.reload();await reviews.getByText('Спасибо за отзыв!',{exact:true}).waitFor();assert.equal(await reviews.getByRole('link',{name:'Оставить отзыв'}).count(),0);
 assert.deepEqual(errors,[]);console.log(stats);await c.close();
}
fs.writeFileSync(out+'/transfer.json',JSON.stringify(report,null,2));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
