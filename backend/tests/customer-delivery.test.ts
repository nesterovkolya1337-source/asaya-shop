import {test} from 'node:test';
import assert from 'node:assert/strict';
import {customerDelivery} from '../src/customer-delivery.js';

test('customer delivery exposes saved YCP pickup and promised dates without credentials or raw snapshots',()=>{
 const base={label:'СДЭК',address:{city:'Москва',address:'ПВЗ MSK123'}};
 const ycp={address:{pickup_point_id:'MSK123',intercom:'private'},delivery_date_interval:{start_interval:{date:'2026-09-19'},end_interval:{date:'2026-09-21'},time_zone:3},secret:'PRIVATE'};
 assert.deepEqual(customerDelivery({...base,source:'ycp',ycp}),{label:'СДЭК',city:'Москва',address:'ПВЗ MSK123',pickupPoint:'MSK123',plannedStart:'2026-09-19',plannedEnd:'2026-09-21'});
 assert.deepEqual(customerDelivery(base),{label:'СДЭК',city:'Москва',address:'ПВЗ MSK123'});
 assert.deepEqual(customerDelivery(null),{label:'',city:'',address:''});
 const bad={...ycp,delivery_date_interval:{start_interval:{date:'2026-09-21'},end_interval:{date:'2026-09-19'}}};
 assert.equal('plannedStart' in customerDelivery({...base,source:'ycp',ycp:bad}),false);
 assert.equal('pickupPoint' in customerDelivery({...base,source:'other',ycp}),false);
});
