const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
(async()=>{
 const data=JSON.parse(await fs.readFile('backend/data/pdp-rich-content-v2.json','utf8'));
 const sources=new Set();function walk(v){if(!v||typeof v!=='object')return;if(typeof v.src==='string'&&/^\/images\/figma\/rich-content\/[^/]+\.(png|jpg|jpeg)$/.test(v.src))sources.add(v.src);Object.values(v).forEach(walk);}walk(data.map(p=>p.pdp.sections));
 walk(JSON.parse(await fs.readFile('backend/data/pdp-howto-corrections-20260925.json','utf8')).map(p=>p.replacement));
 const manifest={};await fs.mkdir('public/images/figma/rich-content/variants',{recursive:true});
 for(const src of sources){const input='public'+src,meta=await sharp(input).metadata(),widths=[480,960,1440].filter(w=>w<meta.width);widths.push(Math.min(1920,meta.width));manifest[src]=[];
 for(const width of [...new Set(widths)]){const url=src.replace(/\/([^/]+)\.(png|jpg|jpeg)$/,`/variants/$1-${width}.webp`),output='public'+url;
 try{await fs.access(output);}catch{await sharp(input).rotate().resize({width,withoutEnlargement:true}).webp({quality:85,effort:4}).toFile(output);}
 manifest[src].push({width,src:url});}
 }
 await fs.writeFile('src/lib/rich-image-variants.json',JSON.stringify(manifest,null,2)+'\n');console.log('Referenced rich images:',sources.size);
})().catch(e=>{console.error(e);process.exitCode=1});
