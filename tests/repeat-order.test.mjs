import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repeatOrderPlan} from '../src/lib/repeat-order.ts';
test('repeat order matches immutable SKU, caps quantities against current stock and leaves unavailable lines out',()=>{
 const lines=[{sku:'A',name_snapshot:'Old name',quantity:3},{sku:'B',name_snapshot:'Hidden',quantity:1},{sku:'C',name_snapshot:'Removed',quantity:2}];
 const products=[{id:'new-slug',sku:'A',name:'New name',stock:4,active:true},{id:'b',sku:'B',stock:8,active:false}];
 const cart={'new-slug':2,unrelated:1},result=repeatOrderPlan(lines,products,cart);
 assert.deepEqual(result,{cart:{'new-slug':4,unrelated:1},added:2,skipped:['Old name','Hidden','Removed']});assert.equal(cart['new-slug'],2);
});
