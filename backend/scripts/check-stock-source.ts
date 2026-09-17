// Read-only source diagnostic. No database connection or mutations.
import {readFile} from 'node:fs/promises';
import {CdekStockFeed} from '../src/cdek-stock-feed.js';
try{
 const path=process.env.CDEK_STOCK_SETTINGS_FILE;if(!path)throw new Error('STOCK_SETTINGS_REQUIRED');
 const source=new CdekStockFeed(JSON.parse(await readFile(path,'utf8'))),snapshot=await source.read();
 console.log(JSON.stringify({warehouseId:source.settings.warehouseId,environment:source.settings.environment,generatedAt:snapshot.generatedAt,
  offers:snapshot.items.length,positive:snapshot.items.filter(i=>i.quantity>0).length,items:snapshot.items,changed:false}));
}catch{console.error('STOCK_SOURCE_CHECK_FAILED');process.exitCode=1;}
