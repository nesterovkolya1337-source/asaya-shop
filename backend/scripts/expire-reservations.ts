import {Database} from '../src/db.js';
import {CommerceService} from '../src/commerce.js';
import {runReservationWorker} from '../src/reservation-worker.js';

const args=process.argv.slice(2);
if(args.length!==1||!['--once','--watch'].includes(args[0]!))throw new Error('Use --once or --watch');
// Matches the current integration boundary; deployment is not activated by this command.
if(process.env.NODE_ENV==='production')throw new Error('Production integration is not enabled');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const intervalMs=Number(process.env.RESERVATION_SWEEP_INTERVAL_MS??60000);
if(!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>300000)throw new Error('Invalid RESERVATION_SWEEP_INTERVAL_MS');
const db=new Database(process.env.DATABASE_URL),service=new CommerceService(db);
const controller=new AbortController(),stop=()=>controller.abort();
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{
 if(args[0]==='--once')console.log(JSON.stringify({event:'reservations.expired',count:await service.expire()}));
 else await runReservationWorker({expire:()=>service.expire(),signal:controller.signal,intervalMs,report:report=>console.log(JSON.stringify(report))});
}catch{console.error(JSON.stringify({event:'reservations.worker_failed'}));process.exitCode=1;}
finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);await db.close();}
