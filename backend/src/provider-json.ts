// Provider responses can contain customer data and credentials. Never include them
// (or a request URL) in errors. Consume only a bounded JSON body over HTTPS.
import {DomainError} from './core.js';
export async function providerJson(response:Response,limit=512*1024):Promise<unknown>{
 if(!response.ok||!response.body){await response.body?.cancel().catch(()=>{});throw new DomainError('PROVIDER_UNAVAILABLE',503);}
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new Error('size');chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{await reader.cancel().catch(()=>{});throw new DomainError('PROVIDER_INVALID_RESPONSE',503);}
 finally{reader.releaseLock();}
}
