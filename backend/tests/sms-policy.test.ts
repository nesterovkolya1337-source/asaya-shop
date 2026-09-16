import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCustomerPhone} from '../src/customer-phone.js';
import {otpPolicy,otpPolicyFromEnv} from '../src/otp-policy.js';
test('customer phone has one canonical identity across accepted Russian number formats',()=>{
 for(const phone of ['+7 999 123-45-67','8 (999) 123-45-67','79991234567','9991234567'])assert.equal(normalizeCustomerPhone(phone),'+79991234567');
 for(const phone of ['+19991234567','7999+1234567','++79991234567','123','+7 999 123-45-67 доб. 1','<script>','+89991234567'])assert.equal(normalizeCustomerPhone(phone),null);
});
test('OTP limits are configurable within bounds and cannot silently disable throttling',()=>{
 assert.equal(otpPolicy().ttlSeconds,300);
 assert.equal(otpPolicyFromEnv({OTP_TTL_SECONDS:'120',OTP_MAX_ATTEMPTS:'3',OTP_RESEND_SECONDS:'90'}).maxAttempts,3);
 for(const env of [{OTP_TTL_SECONDS:'0'},{OTP_MAX_ATTEMPTS:'0'},{OTP_RESEND_SECONDS:'0'},{OTP_SEND_PER_PHONE_PER_HOUR:'9999'},{OTP_TTL_SECONDS:'NaN'},{OTP_TTL_SECONDS:''}])assert.throws(()=>otpPolicyFromEnv(env));
});
