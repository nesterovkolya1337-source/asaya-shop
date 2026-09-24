import {test} from 'node:test';
import assert from 'node:assert/strict';
import config from '../next.config.ts';
test('Admin sales route is forwarded to authenticated backend through the Next basePath proxy',async()=>{
 assert.ok(config.rewrites); const routes=await config.rewrites(); assert.ok(Array.isArray(routes));
 const sales=routes.find(r=>r.source==='/api/admin/v1/sales');
 assert.ok(sales);assert.equal(sales.destination,'http://127.0.0.1:3100/api/admin/v1/sales');
});
