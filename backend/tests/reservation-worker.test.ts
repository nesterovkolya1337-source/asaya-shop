import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runReservationWorker} from '../src/reservation-worker.js';

test('reservation worker runs sequentially, retries failures and never reports private exception data',async()=>{
 const controller=new AbortController(),reports:unknown[]=[],events:string[]=[];
 let attempts=0,inFlight=0;
 await runReservationWorker({signal:controller.signal,intervalMs:60000,
  expire:async()=>{assert.equal(inFlight++,0);events.push('run');await Promise.resolve();inFlight--;if(++attempts===1)throw new Error('PRIVATE database password');return 2;},
  report:r=>reports.push(r),wait:async(ms)=>{assert.equal(ms,60000);assert.equal(inFlight,0);events.push('wait');if(attempts===3)controller.abort();}
 });
 assert.deepEqual(events,['run','wait','run','wait','run','wait']);
 assert.deepEqual(reports,[{event:'reservations.expiry_failed'},{event:'reservations.expired',count:2},{event:'reservations.expired',count:2}]);
});

test('reservation worker finishes active batch before shutdown and does not start another',async()=>{
 const controller=new AbortController();let release!:()=>void;let started!:()=>void;
 const began=new Promise<void>(resolve=>{started=resolve;});
 const batch=new Promise<void>(resolve=>{release=resolve;});let ended=false,reported=false;
 const task=runReservationWorker({signal:controller.signal,intervalMs:1000,expire:async()=>{started();await batch;return 1;},report:()=>{reported=true;},wait:async()=>{assert.fail('must not sleep after stop');}}).then(()=>{ended=true;});
 await began;controller.abort();await Promise.resolve();assert.equal(ended,false);release();await task;assert.equal(reported,true);
});

test('reservation worker cancels its real timer promptly and rejects invalid intervals',async()=>{
 const controller=new AbortController();let runs=0;
 const task=runReservationWorker({signal:controller.signal,intervalMs:300000,expire:async()=>++runs,report:()=>{setImmediate(()=>controller.abort());}});
 await task;assert.equal(runs,1);
 for(const intervalMs of [0,999,300001,NaN,1000.5])await assert.rejects(runReservationWorker({signal:new AbortController().signal,intervalMs,expire:async()=>0,report:()=>{}}));
 const stopped=new AbortController();stopped.abort();await runReservationWorker({signal:stopped.signal,intervalMs:1000,expire:async()=>{assert.fail('already stopped');},report:()=>{}});
});
