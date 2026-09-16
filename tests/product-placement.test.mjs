import {test} from 'node:test';import assert from 'node:assert/strict';
import {placedProducts} from '../src/lib/product-placement.ts';
import {parseProductContent} from '../src/lib/backend-catalog.ts';
test('placements order catalog and independent homepage lists, exclude hidden and preserve ties',()=>{
 const a={id:'a',active:true,badge:'Бестселлер',placement:{catalogOrder:2,bestsellerOrder:null,newOrder:0}},b={id:'b',active:true,badge:'',placement:{catalogOrder:1,bestsellerOrder:5,newOrder:2}},c={id:'c',active:false,badge:'Новинка'};
 assert.deepEqual(placedProducts([a,b,c],'catalog').map(p=>p.id),['b','a']);assert.deepEqual(placedProducts([a,b,c],'bestsellers').map(p=>p.id),['b']);assert.deepEqual(placedProducts([b,a,c],'new').map(p=>p.id),['a','b']);assert.deepEqual(placedProducts([{id:'old',active:true,badge:'Новинка'}],'new').map(p=>p.id),['old']);
 assert.deepEqual(placedProducts([a,{...a,id:'same'}],'catalog').map(p=>p.id),['a','same']);
});

test('placement survives content parsing and invalid positions are rejected',()=>{
 const c={description:'',volume:'',usage:'',ingredients:'',aroma:'',image:'',badge:'',safety:'',category:'hair',setKind:'none',features:[],gallery:[],recommendations:[],instruction:{steps:[],amount:'',tip:''},sensory:[]};
 const placement={catalogOrder:3,bestsellerOrder:null,newOrder:1};assert.deepEqual(parseProductContent({...c,placement}).placement,placement);assert.equal(parseProductContent(c).placement,undefined);
 for(const invalid of [null,[],{...placement,catalogOrder:-1},{...placement,newOrder:1.5},{...placement,bestsellerOrder:'1'}])assert.throws(()=>parseProductContent({...c,placement:invalid}));
});
