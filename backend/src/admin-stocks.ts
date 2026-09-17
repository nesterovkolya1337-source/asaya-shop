import {z} from 'zod';
import {Database} from './db.js';
import {DomainError} from './core.js';
import {StockState} from './stock-state.js';
import type {StockSync} from './stock-sync.js';

export class AdminStocks {
 constructor(private db:Database,private sync?:StockSync){}
 private async authorize(actor:string){
  if(!(await this.db.pool.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
 }
 async read(actor:string,query:unknown){
  await this.authorize(actor);z.object({}).strict().parse(query);
  if(!this.sync)return {configured:false,source:null,items:[]};
  const snapshot=await new StockState(this.db,this.sync.source.settings).read();
  return {configured:true,...snapshot};
 }
 async refresh(actor:string,body:unknown){
  await this.authorize(actor);z.object({}).strict().parse(body);
  if(!this.sync)throw new DomainError('STOCK_NOT_CONFIGURED',503);
  const result=await this.sync.refresh();
  return {outcome:'skipped' in result?result.reason:'updated'};
 }
}
