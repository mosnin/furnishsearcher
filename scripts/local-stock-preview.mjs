// Local visual fixtures only. Never import or invoke this from application code.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
const root = process.cwd();
const source = readFileSync('.env.local', 'utf8');
const url = source.match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1].trim().replace(/^"|"$/g, '');
assert(url && ['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname), 'Refuses hosted target');
assert(/^CONVEX_DEPLOYMENT=anonymous:/m.test(source) && !/^CONVEX_DEPLOY_KEY=/m.test(source), 'Requires isolated anonymous local deployment');
const cfg = JSON.parse(readFileSync('.convex/local/default/config.json','utf8'));
assert.equal(Number(new URL(url).port), cfg.ports.cloud);
const make = (subject) => { const c = new ConvexHttpClient(url); c.setAdminAuth(cfg.adminKey,{subject,issuer:'https://qa.furnishsearcher.invalid'}); return c; };
const owner=make('qa-owner-search'), staff=make('qa-publication-staff'), anonymous=new ConvexHttpClient(url);
const call=(c,type,name,args)=>c[type](makeFunctionReference(name),args);
const me=await call(owner,'query','users:getByClerkId',{clerkId:'qa-owner-search'});
const reviewer=await call(staff,'query','users:getByClerkId',{clerkId:'qa-publication-staff'});
assert.equal(me?.email,'qa-owner@example.test'); assert.equal(me?.role,'landlord');
assert.equal(reviewer?.email,'qa-staff@example.test'); assert.equal(reviewer?.role,'admin');
const targets=[
 ['k97f2smyfqzx4jderxvykf23498gxjdr','[QA] Exact Austin apartment'],
 ['k976qqsxcmrs93kjzm1g132q4h8gxzx1','[QA] Flexible Austin apartment'],
 ['k971ncw38n4qkp6sge9a1f1e4x8gy5pt','[QA] Synthetic performance a6a8969a'],
 ['k97bpcgq4160t86qtan7t8zr3x8gzvsh','[QA] Synthetic performance f691f539'],
];
const inventory=[];
for(const [id,title] of targets){
 const l=await call(owner,'query','listings:getById',{id});
 assert(l && l._id===id && l.title===title && l.landlordId===me._id && /synthetic/i.test(l.description), 'Fixture identity mismatch');
 assert.equal(l.isPublic,true,'Only currently public synthetic fixtures may change');
 const ready=await call(owner,'query','publication:getReadiness',{id}); assert(ready.live,'Fixture must already satisfy native publication requirements');
 inventory.push(l);
}
const ids=['1571460','1643383','271624','259962','1396122'];
const sources=[];
mkdirSync('.convex/stock-preview',{recursive:true});
for(const id of ids){
 const imageUrl=`https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1400`;
 const file=`.convex/stock-preview/${id}.jpg`;
 if(!existsSync(file)){
  const r=await fetch(imageUrl,{signal:AbortSignal.timeout(30000)}); assert(r.ok && r.headers.get('content-type')?.startsWith('image/jpeg'),'Expected stock JPEG');
  const bytes=Buffer.from(await r.arrayBuffer()); assert(bytes.length>10000 && bytes.length<4000000,'Unexpected asset size'); writeFileSync(file,bytes);
 }
 const bytes=readFileSync(file); assert(bytes[0]===255 && bytes[1]===216,'JPEG signature required');
 sources.push({id,page:`https://www.pexels.com/photo/${id}/`,imageUrl,license:'https://www.pexels.com/license/',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),caption:`[QA] Pexels stock photo ${id}; illustrative only. No rental is offered.`});
}
const receipt={at:new Date().toISOString(),target:url,localOnly:true,authentication:'Existing isolated local SDK fixture identities, not customer authentication',sourceLicense:'Pexels License permits free website/app use. No endorsement implied.',sources,changes:[],applied:process.argv.includes('--apply'),providerChanges:false,accountOrIdentityChanges:false};
mkdirSync('docs/evidence',{recursive:true});
// Persist the previous native photo references before the first mutation for review/recovery.
const backup='docs/evidence/local-stock-preview-before.json';
if(!existsSync(backup))writeFileSync(backup,JSON.stringify(inventory.map(l=>({id:l._id,title:l.title,photos:l.photos,photoAssets:l.photoAssets,revision:l.revision})),null,2)+'\n');
if(receipt.applied){
 const authorization=`Convex ${cfg.adminKey}:${Buffer.from(JSON.stringify({subject:'qa-owner-search',issuer:'https://qa.furnishsearcher.invalid'})).toString('base64')}`;
 const assets=[];
 for(const s of sources){
  const existing=inventory.flatMap(l=>l.photoAssets??[]).find(a=>a.caption===s.caption && a.storageId);
  if(existing){ assets.push(existing); continue; }
  const r=await fetch(`http://127.0.0.1:${cfg.ports.site}/photos/upload`,{method:'POST',headers:{Authorization:authorization,'Content-Type':'image/jpeg'},body:readFileSync(`.convex/stock-preview/${s.id}.jpg`)});
  assert.equal(r.status,200,'Native local photo upload rejected'); const photo=await r.json();
  assert.equal(new URL(photo.url).hostname,'127.0.0.1');
  const stored=await fetch(photo.url); assert(stored.ok); assert.equal(createHash('sha256').update(Buffer.from(await stored.arrayBuffer())).digest('hex'),s.sha256,'Stored bytes differ');
  assets.push({storageId:photo.storageId,caption:s.caption});
 }
 for(const [index,l] of inventory.entries()){
  const ordered=assets.map((_,i)=>assets[(i+index)%assets.length]);
  if(JSON.stringify(l.photoAssets)!==JSON.stringify(ordered)) await call(owner,'mutation','listings:update',{id:l._id,photos:[],photoAssets:ordered});
  const edited=await call(owner,'query','listings:getById',{id:l._id});
  const review=await call(staff,'mutation','listings:approveListing',{id:l._id,expectedRevision:edited.revision??0,note:'Local synthetic visual fixture using illustrative Pexels stock images. No rental is offered; no provider verification is claimed.'});
  assert(review.live,review.issues.join(' '));
  const live=await call(anonymous,'query','listings:getById',{id:l._id}); assert(live?.isPublic && live.photos.length===5); assert.deepEqual(live.photoCaptions,ordered.map(a=>a.caption));
  receipt.changes.push({id:l._id,title:l.title,revision:edited.revision,nativeOwnerUpdate:true,nativeStaffRevisionApproval:true,publicPhotosVerified:5});
 }
}
writeFileSync('docs/evidence/local-stock-preview.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({applied:receipt.applied,localOnly:true,sourcePhotos:sources.length,changedListings:receipt.changes.length,receipt:`${root}/docs/evidence/local-stock-preview.json`},null,2));
