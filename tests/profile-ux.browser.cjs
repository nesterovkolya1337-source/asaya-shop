const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('fs');
const base=process.env.PROFILE_TEST_URL||'http://127.0.0.1:3366';
const output=process.env.PROFILE_TEST_OUTPUT||'test-artifacts/profile-ux';fs.mkdirSync(output,{recursive:true});
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});const results=[];try{for(const width of [1440,390]){
const c=await b.newContext({viewport:{width,height:900}}),p=await c.newPage();let signed=false,sends=0,enabled=true,hasOrders=false;let profile={phone:'+79991234567',name:'',email:''};const errors=[];
const user={id:'20000000-0000-4000-8000-000000000002',role:'customer'},csrfToken='a'.repeat(64),id='20000000-0000-4000-8000-000000000001';
p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>localStorage.setItem('asaya-cookie-choice-v1','essential'));
await p.route('**/*',async r=>{const q=r.request(),u=new URL(q.url()),path=u.pathname;const json=(v,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
if(u.origin!==new URL(base).origin)return r.abort();
if(path==='/api/store/v1/auth/methods')return json({yandex:false,orders:enabled,...(enabled?{sms:true}:{})});
if(path==='/api/store/v1/auth/me')return signed?json({...user,csrfToken}):json({error:'UNAUTHENTICATED'},401);
if(path==='/api/store/v1/auth/otp/request'){sends++;assert.equal(q.postDataJSON().destination,'+79991234567');return json({challengeId:id,expiresInSeconds:300,retryAfterSeconds:60});}
if(path==='/api/store/v1/auth/otp/verify'){if(q.postDataJSON().code!=='123456')return json({error:'INVALID_OTP'},401);signed=true;return json({user,csrfToken});}
if(path==='/api/store/v1/auth/logout'){signed=false;assert.equal(q.headers()['x-csrf-token'],csrfToken);return json({ok:true});}
if(path==='/api/store/v1/account/profile'){if(q.method()==='PUT'){assert.equal(q.headers()['x-csrf-token'],csrfToken);profile={...profile,...q.postDataJSON()};}return json(profile);}
if(path==='/api/store/v1/account/loyalty')return json({balance:230,history:[]});
if(path==='/api/store/v1/account/engagement')return json({code:'ASAYA-TEST',products:[{id:'p1',name:'Гель для душа',slug:'gel',reviewed:false}],reminders:[{id:'p1',name:'Гель для душа',slug:'gel'}]});
if(path==='/api/store/v1/orders')return json({items:hasOrders?[{id,public_number:'ASAYA-10001',status:'processing',payment_status:'paid',delivery_status:'shipped',customer_status:'handed_to_delivery',currency:'RUB',total_minor:50000,created_at:'2026-09-17T10:00:00Z'}].flatMap(order=>[order,{...order,id:'20000000-0000-4000-8000-000000000003',public_number:'ASAYA-10000'}]):[],nextCursor:null});
if(path==='/api/store/v1/orders/'+id)return json({id,public_number:'ASAYA-10001',status:'processing',payment_status:'paid',delivery_status:'shipped',currency:'RUB',total_minor:50000,created_at:'2026-09-17T10:00:00Z',shipment:null,subtotal_minor:50000,delivery_minor:0,canCancel:false,items:[{sku:'TEST',name_snapshot:'Товар из заказа',quantity:1,unit_minor:50000,line_minor:50000}]});
if(path==='/api/store/v1/products')return json({items:[]});
if(path.startsWith('/api/'))return json({},503);
return r.continue();});
await p.goto(base+'/account/');
await p.getByRole('heading',{name:'Войдите по номеру телефона'}).waitFor();
await p.screenshot({path:output+'/profile-guest-'+width+'.png',fullPage:true});
const phone=p.getByLabel('Телефон',{exact:true}),send=p.getByRole('button',{name:'Получить код',exact:true});
assert.ok(await send.isDisabled());await phone.fill('123');assert.ok(await send.isDisabled());
for(const value of ['89991234567','79991234567','+7 (999) 123-45-67']){await phone.fill(value);assert.equal(await phone.inputValue(),'999 123-45-67');assert.ok(await send.isEnabled());}
await phone.press('Home');await phone.press('Backspace');assert.equal(await phone.inputValue(),'999 123-45-67');
await phone.press('Control+A');await phone.press('Backspace');assert.equal(await phone.inputValue(),'');assert.equal(await p.locator('main').getByText('+7',{exact:true}).count(),1);
await phone.pressSequentially('9991234567');assert.equal(await phone.inputValue(),'999 123-45-67');
await phone.evaluate(el=>el.setSelectionRange(4,4));await phone.press('Backspace');assert.equal(await phone.inputValue(),'991 234-56-7');
await phone.fill('+79991234567');await send.click();
await p.getByLabel('Код из 6 цифр').waitFor();
assert.equal(await p.getByRole('button',{name:'Проверить состояние входа'}).count(),0);
await p.screenshot({path:output+'/profile-otp-'+width+'.png',fullPage:true});
await p.getByRole('button',{name:'Изменить номер'}).click();assert.equal(await phone.inputValue(),'999 123-45-67');await send.click();assert.ok(await p.getByRole('button',{name:/Новый код через/}).isDisabled());
await p.getByLabel('Код из 6 цифр').fill('000000');await p.getByRole('button',{name:'Войти',exact:true}).click();await p.getByRole('alert').filter({hasText:'Код неверный'}).waitFor();
await p.getByLabel('Код из 6 цифр').fill('123456');await p.getByRole('button',{name:'Войти',exact:true}).click();
const nav=p.getByRole('navigation',{name:'Разделы личного кабинета'});
await nav.waitFor();await p.reload();await nav.waitFor();
await p.getByRole('heading',{name:'У вас пока нет заказов'}).waitFor();
assert.equal(await p.getByLabel('Имя · необязательно').count(),0);
await p.screenshot({path:output+'/profile-overview-'+width+'.png',fullPage:true});
await p.getByRole('region',{name:'Баланс баллов'}).getByText('230', {exact:false}).waitFor();
assert.equal(await p.getByRole('heading',{name:'Пригласи друга',exact:true}).count(),0);
for(const [tab,heading] of [['Отзывы','Отзывы о покупках'],['Пригласи друга','Пригласи друга'],['Повторная покупка','Пора пополнить запас']]){await nav.getByRole('button',{name:tab,exact:true}).click();await p.getByRole('heading',{name:heading,exact:true}).waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:output+'/section-'+(tab==='Отзывы'?'reviews':tab==='Пригласи друга'?'referral':'reminders')+'-'+width+'.png',fullPage:true});}
await nav.getByRole('button',{name:'Профиль',exact:true}).click();
await p.getByLabel('Телефон подтверждён').waitFor();
assert.equal(await p.getByLabel('Телефон подтверждён').inputValue(),'+7 999 123-45-67');
assert.ok(await p.getByLabel('Телефон подтверждён').getAttribute('readonly')!==null);
assert.equal(await p.getByRole('heading',{name:'Мои заказы',exact:true}).count(),0);
await p.getByLabel('Имя · необязательно').fill('Анна');await p.getByRole('button',{name:'Сохранить изменения'}).click();await p.getByText('Изменения сохранены',{exact:true}).waitFor();
await p.getByText('Изменения сохранены',{exact:true}).waitFor({state:'hidden',timeout:6000});
assert.equal(sends,2);assert.equal(await p.getByLabel('Имя · необязательно').inputValue(),'Анна');
await p.screenshot({path:output+'/profile-data-'+width+'.png',fullPage:true});
await nav.getByRole('button',{name:'Обзор',exact:true}).click();await p.getByRole('heading',{name:'Здравствуйте, Анна'}).waitFor();
hasOrders=true;await p.getByRole('button',{name:'Все заказы',exact:true}).click();await p.getByRole('heading',{name:'ASAYA-10001'}).waitFor();
assert.equal(await p.getByRole('button',{name:'Обновить список'}).count(),0);
await nav.getByRole('button',{name:'Обзор',exact:true}).click();await p.getByRole('heading',{name:'ASAYA-10001',exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:'ASAYA-10000',exact:true}).count(),0);await p.screenshot({path:output+'/overview-order-'+width+'.png',fullPage:true});await nav.getByRole('button',{name:'Мои заказы',exact:true}).click();await p.getByRole('heading',{name:'ASAYA-10000',exact:true}).waitFor();
assert.equal(await p.getByLabel('Имя · необязательно').count(),0);
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
await p.screenshot({path:output+'/profile-orders-'+width+'.png',fullPage:true});
await p.getByRole('button',{name:'Подробнее о заказе ASAYA-10001'}).click();await p.getByRole('heading',{name:'Заказ ASAYA-10001',exact:true}).waitFor();await p.getByText('Товар из заказа',{exact:true}).waitFor();await p.getByRole('button',{name:'Закрыть',exact:true}).click();
await p.getByRole('button',{name:'Выйти',exact:true}).click();await phone.waitFor();
enabled=false;await p.reload();await p.getByText('Вход по SMS пока недоступен.',{exact:false}).waitFor();await phone.fill('+79991234567');assert.ok(await send.isDisabled());
assert.deepEqual(errors,[]);results.push({width,dashboardNavigation:true,profileSaveAndTemporaryFeedback:true,orderDetail:true,explanation:true,validPhone:true,cooldown:true,wrongAndCorrectCode:true,reload:true,logout:true,unavailableGuard:true,pageErrors:errors});await c.close();}
fs.writeFileSync(output+'/profile-ux-browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});

