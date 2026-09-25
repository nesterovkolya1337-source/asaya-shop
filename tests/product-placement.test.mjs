import {test} from 'node:test';import assert from 'node:assert/strict';
import {placedProducts} from '../src/lib/product-placement.ts';
import {parseProductContent} from '../src/lib/backend-catalog.ts';
test('placements order catalog and independent homepage lists, exclude hidden and preserve ties',()=>{
 const a={id:'a',active:true,badge:'Бестселлер',placement:{catalogOrder:2,bestsellerOrder:null,newOrder:0},merchandising:{catalogOrder:2,categoryOrder:-1,bestsellerOrder:-1,newOrder:0}},b={id:'b',active:true,badge:'',placement:{catalogOrder:1,bestsellerOrder:5,newOrder:2},merchandising:{catalogOrder:1,categoryOrder:-1,bestsellerOrder:5,newOrder:2}},c={id:'c',active:false,badge:'Новинка'};
 assert.deepEqual(placedProducts([a,b,c],'catalog').map(p=>p.id),['b','a']);assert.deepEqual(placedProducts([a,b,c],'bestsellers').map(p=>p.id),['b']);assert.deepEqual(placedProducts([b,a,c],'new').map(p=>p.id),['a','b']);assert.deepEqual(placedProducts([{id:'old',active:true,badge:'Новинка'}],'new').map(p=>p.id),[]);
 assert.deepEqual(placedProducts([a,{...a,id:'same'}],'catalog').map(p=>p.id),['a','same']);
});

test('placement survives content parsing and invalid positions are rejected',()=>{
 const c={description:'',volume:'',usage:'',ingredients:'',aroma:'',image:'',badge:'',safety:'',category:'hair',setKind:'none',features:[],gallery:[],recommendations:[],instruction:{steps:[],amount:'',tip:''},sensory:[]};
 const placement={catalogOrder:3,bestsellerOrder:null,newOrder:1};assert.deepEqual(parseProductContent({...c,placement}).placement,placement);assert.equal(parseProductContent(c).placement,undefined);
 for(const invalid of [null,[],{...placement,catalogOrder:-1},{...placement,newOrder:1.5},{...placement,bestsellerOrder:'1'}])assert.throws(()=>parseProductContent({...c,placement:invalid}));
});


test('all zero-stock published products retain catalog, bestseller and new placements',()=>{
 const products=['hair','body','face'].map((category,i)=>({id:category,category,active:true,stock:0,merchandising:{catalogOrder:i,categoryOrder:-1,bestsellerOrder:i,newOrder:i}}));
 const hidden={...products[0],id:'hidden',active:false,stock:5};
 for(const section of ['catalog','bestsellers','new'])assert.deepEqual(placedProducts([...products,hidden],section).map(p=>p.id),['hair','body','face']);
 for(const stock of [0,5,0])assert.deepEqual(placedProducts(products.map(p=>({...p,stock})),'catalog').map(p=>p.id),['hair','body','face']);
});

test('curated homepage placement is independent of badges and old product placement',()=>{
 const base={id:'selected',active:true,stock:0,badge:'',merchandising:{catalogOrder:0,categoryOrder:-1,bestsellerOrder:1,newOrder:-1}};
 for(const badge of ['', 'Бестселлер','Новинка'])assert.deepEqual(placedProducts([{...base,badge}],'bestsellers').map(p=>p.id),['selected']);
 assert.deepEqual(placedProducts([{...base,active:false}],'bestsellers'),[]);
 assert.deepEqual(placedProducts([{...base,merchandising:{...base.merchandising,bestsellerOrder:-1},badge:'Бестселлер',placement:{bestsellerOrder:0}}],'bestsellers'),[]);
});
