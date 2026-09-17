import {Database} from './db.js';
import {DomainError} from './core.js';
// Kept as a fail-closed compatibility entry point for obsolete callers.
export async function purgeUnpaidContacts(_db:Database,_scope:{accountId:string;environment:'test'|'production'},_now=new Date()):Promise<number>{
 throw new DomainError('AUTOMATIC_RETENTION_DISABLED',403);
}
