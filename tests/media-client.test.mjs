import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMediaClient,imageData,validateImageFile,MAX_IMAGE_BYTES} from '../src/lib/media-client.ts';
import {parseProductContent,readBackendCatalog} from '../src/lib/backend-catalog.ts';
const id='00000000-0000-4000-8000-000000000001',url='/api/store/v1/media/'+id;
const file=new File([new Uint8Array([0,255,128,10])],'photo.png',{type:'image/png'});
const success={id,url,width:100,height:60,bytes:200,mime:'image/webp'};
test('upload client sends binary faithfully with CSRF, reuses retry ID and rejects invalid success',async()=>{
 assert.equal(await imageData(file),'AP+ACg==');const calls=[];
 const api=createMediaClient('/api/admin/v1',async(path,options)=>{calls.push({path,options});return new Response(JSON.stringify(success),{status:201});});
 await api.upload(id,file,'csrf');await api.upload(id,file,'csrf');
 assert.equal(calls[0].path,'/api/admin/v1/media');assert.equal(calls[0].options.headers['X-CSRF-Token'],'csrf');assert.equal(calls[0].options.credentials,'same-origin');
 assert.deepEqual(JSON.parse(calls[0].options.body),{id,data:'AP+ACg=='});assert.equal(calls[0].options.body,calls[1].options.body);
 for(const change of [{url:'https://other.test/photo'},{id:'other'},{width:3000},{bytes:MAX_IMAGE_BYTES+1},{mime:'image/svg+xml'}]){
  await assert.rejects(createMediaClient('/api',async()=>new Response(JSON.stringify({...success,...change}))).upload(id,file,'csrf'),e=>e.code==='INVALID_RESPONSE');
 }
});
test('file validation rejects oversize and unsupported types before a request',()=>{
 for(const size of [0,MAX_IMAGE_BYTES+1])assert.throws(()=>validateImageFile({size,type:'image/png'}),e=>e.code==='IMAGE_TOO_LARGE');
 assert.throws(()=>validateImageFile({size:100,type:'image/svg+xml'}),e=>e.code==='UNSUPPORTED_IMAGE');
});
test('uploaded image paths work in published catalog with base path and reject arbitrary API paths',()=>{
 const content={description:'Фото',volume:'300 мл',category:'body',setKind:'none',usage:'Применение',ingredients:'Состав',aroma:'',features:[],image:url,gallery:[url],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]};
 assert.equal(parseProductContent(content).image,url);
 assert.throws(()=>parseProductContent({...content,image:'/api/admin/v1/products'}));
 const old=process.env.NEXT_PUBLIC_BASE_PATH;process.env.NEXT_PUBLIC_BASE_PATH='/shop';
 try{
  const result=readBackendCatalog({items:[{sku:'PHOTO',slug:'photo',name:'Фото',content,currency:'RUB',regularMinor:300,finalMinor:200,available:1}]})[0];
  assert.equal(result.image,'/shop'+url);assert.deepEqual(result.gallery,['/shop'+url]);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_BASE_PATH;else process.env.NEXT_PUBLIC_BASE_PATH=old;}
});
