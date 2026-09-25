const fs=require('node:fs/promises'),sharp=require('../backend/node_modules/sharp');
(async()=>{
 const root='public/images/figma/page2-packshots-x4',out='public/images/figma/page2-packshots/variants';
 await fs.mkdir(out,{recursive:true});const manifest={};
 for(const file of (await fs.readdir(root)).filter(f=>f.endsWith('.png'))){
  // Trim once from the original Figma PNG, retaining an uncompressed pixel buffer.
  const {data,info}=await sharp(root+'/'+file).trim({background:{r:0,g:0,b:0,alpha:0},threshold:8}).raw().toBuffer({resolveWithObject:true});
  const key='/images/figma/page2-packshots/'+file.replace('.png','.webp');manifest[key]=[];
  for(const width of [...new Set([240,480,800,1200,1600,2400].filter(w=>w<info.width).concat(info.width))]){
   const name=file.replace('.png',`-${width}.webp`);
   await sharp(data,{raw:info}).resize({width,withoutEnlargement:true}).webp({quality:94,alphaQuality:100,smartSubsample:true,effort:4}).toFile(out+'/'+name);
   manifest[key].push({width,src:'/images/figma/page2-packshots/variants/'+name});
  }
 }
 await fs.writeFile('src/lib/packshot-image-variants.json',JSON.stringify(manifest,null,2)+'\n');
})();
