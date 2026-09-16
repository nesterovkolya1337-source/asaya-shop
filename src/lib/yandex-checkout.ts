export function parseYandexCheckoutLink(raw:unknown):string {
 if(!raw||typeof raw!=='object'||!('url' in raw)||typeof raw.url!=='string')throw new Error('INVALID_RESPONSE');
 const url=new URL(raw.url);
 if(url.origin!=='https://checkout.kit.yandex.ru'||url.pathname!=='/express'||url.username||url.password||url.hash||!url.searchParams.get('host')||!url.searchParams.get('data'))throw new Error('INVALID_RESPONSE');
 return url.href;
}

// Keep the same key after an uncertain network result, bounded to the current page.
const attempts=new Map<string,string>();
export async function requestYandexCheckoutLink(endpoint:string,items:Array<{sku:string;quantity:number}>,fetcher:typeof fetch=fetch){
 const cartKey=JSON.stringify([endpoint,[...items].sort((a,b)=>a.sku<b.sku?-1:a.sku>b.sku?1:0)]);
 let key=attempts.get(cartKey);
 if(!key){key=crypto.randomUUID();if(attempts.size>=50)attempts.delete(attempts.keys().next().value!);attempts.set(cartKey,key);}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({items}),credentials:'same-origin',cache:'no-store',signal:controller.signal});
  if(!response.ok&&response.status<500)attempts.delete(cartKey);
  if(!response.ok)throw new Error(response.status===409?'Корзина изменилась. Обновите страницу и проверьте наличие товаров.':'Оформление в Яндексе пока недоступно. Попробуйте позже.');
  const url=parseYandexCheckoutLink(await response.json());
  attempts.delete(cartKey);
  return url;
 }finally{clearTimeout(timer);}
}
