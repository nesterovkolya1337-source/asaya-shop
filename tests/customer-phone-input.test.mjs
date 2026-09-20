import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneDigits,formatPhoneDigits,displayPhone} from '../src/lib/customer-phone-input.ts';

test('phone presentation accepts national and pasted Russian phone formats',()=>{
 for(const value of ['9991234567','89991234567','79991234567','+7 (999) 123-45-67']) {
  assert.equal(phoneDigits(value),'9991234567');
  assert.equal(displayPhone(value),'+7 999 123-45-67');
 }
});
test('partial input keeps the fixed prefix separate and preserves national digits',()=>{
 assert.equal(phoneDigits('+7'),'');
 assert.equal(phoneDigits('+799'),'99');
 assert.equal(phoneDigits('7123456789'),'7123456789');
 assert.equal(phoneDigits('8123456789'),'8123456789');
 assert.equal(formatPhoneDigits('9991'),'999 1');
 assert.equal(formatPhoneDigits('9991234'),'999 123-4');
 assert.equal(formatPhoneDigits(''),'');
});
