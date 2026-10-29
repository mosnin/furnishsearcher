// Explicitly authorized local demo data. No customer or hosted mutations.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
const env=readFileSync('.env.local','utf8');
const url=env.match(/^NEXT_PUBLIC_CONVEX_URL=(.+)$/m)?.[1].trim().replace(/^"|"$/g,'');
assert(url && ['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname));
assert(/^CONVEX_DEPLOYMENT=anonymous:/m.test(env) && !/^CONVEX_DEPLOY_KEY=/m.test(env));
const cfg=JSON.parse(readFileSync('.convex/local/default/config.json','utf8')); assert.equal(Number(new URL(url).port),cfg.ports.cloud);
const make=subject=>{const c=new ConvexHttpClient(url); if(subject)c.setAdminAuth(cfg.adminKey,{subject,issuer:'https://qa.furnishsearcher.invalid'});return c};
const owner=make('qa-owner-search'),staff=make('qa-publication-staff'),anon=make();
const call=(c,t,n,a)=>c[t](makeFunctionReference(n),a);
const me=await call(owner,'query','users:getByClerkId',{clerkId:'qa-owner-search'}),reviewer=await call(staff,'query','users:getByClerkId',{clerkId:'qa-publication-staff'});
assert.equal(me?.email,'qa-owner@example.test'); assert.equal(me.role,'landlord'); assert.equal(reviewer?.role,'admin'); assert.equal(reviewer.email,'qa-staff@example.test');
assert.equal((await call(anon,'query','geo:capabilities',{})).provider,'census','Only keyless public Census lookups are allowed');
const sample=await call(owner,'query','listings:getById',{id:'k976qqsxcmrs93kjzm1g132q4h8gxzx1'}); assert(sample?.landlordId===me._id && sample.title==='[QA] Flexible Austin apartment' && sample.photoAssets?.length===5);
const existing=await call(owner,'query','listings:getByLandlord',{landlordId:me._id});
const childEnv={...process.env}; for(const k of ['CONVEX_DEPLOY_KEY','CONVEX_DEPLOYMENT','CONVEX_SELF_HOSTED_URL','CONVEX_SELF_HOSTED_ADMIN_KEY'])delete childEnv[k];
const cli=args=>spawnSync(process.execPath,['node_modules/convex/bin/main.js',...args,'--env-file','.env.local'],{encoding:'utf8',env:childEnv});
const readEnv=name=>{const r=cli(['env','get',name]);return r.status===0?r.stdout.trim():''};
assert.equal(readEnv('CREEM_API_KEY'),'creem_test_local_synthetic');assert.equal(readEnv('RESEND_API_KEY'),'','Real email must remain disabled');
const product='prod_localQAPremium';const productEnv=readEnv('CREEM_PRODUCT_LANDLORD_PREMIUM');
if(productEnv)assert.equal(productEnv,product);else assert.equal(cli(['env','set','CREEM_PRODUCT_LANDLORD_PREMIUM',product]).status,0);
const paid=await call(owner,'query','payments:getActiveSubscription',{userId:me._id});
if(paid?.plan!=='landlord_premium'){
 const pending=await call(owner,'mutation','payments:prepareCheckout',{userId:me._id,productId:product,purpose:'subscription',plan:'landlord_premium',mode:'test',returnUrl:'http://localhost:3015/billing/success',clientRequestId:randomUUID()});
 await call(owner,'mutation','billingWebhook:process',{payload:JSON.stringify({id:`evt_QAdemo${randomUUID()}`,eventType:'subscription.paid',created_at:Date.now(),object:{id:'sub_QAdemoPremium',product:product,customer:'cust_QAdemoPremium',status:'active',mode:'test',metadata:{requestId:pending.requestId},last_transaction_id:`tran_QAdemo${randomUUID()}`,current_period_start_date:new Date(Date.now()-1000).toISOString(),current_period_end_date:new Date(Date.now()+30*86400000).toISOString()}})});
}
assert.equal((await call(owner,'query','payments:getActiveSubscription',{userId:me._id})).plan,'landlord_premium');
const cities=[
 ['Austin','TX','78701','301 W 2nd St','Lakeside'],['Miami','FL','33133','3500 Pan American Dr','Coastal'],['New York','NY','10013','100 Centre St','City'],['Los Angeles','CA','90012','200 N Spring St','Sunset'],['San Diego','CA','92101','202 C St','Pacific'],['Denver','CO','80202','1437 Bannock St','Mountain'],['Seattle','WA','98104','600 4th Ave','Rainier'],['Portland','OR','97204','1221 SW 4th Ave','Garden'],['Chicago','IL','60602','121 N LaSalle St','Skyline'],['Nashville','TN','37203','615 Church St','Music'],['Phoenix','AZ','85003','200 W Washington St','Desert'],['Boston','MA','02116','700 Boylston St','Back Bay']
];
const receipt={at:new Date().toISOString(),localOnly:true,target:url,requestedDemoCount:36,areas:10,photosSource:'local-stock-preview.json',locationMethod:'Native Census lookup of public civic addresses solely as demo area anchors. No rental, ownership or civic endorsement is claimed.',syntheticLocalPremiumEntitlement:true,realProviderTransaction:false,accountRoleOrIdentityChanged:false,results:[],errors:[]};
function save(){writeFileSync('docs/evidence/local-demo-marketplace.json',JSON.stringify(receipt,null,2)+'\n')}
assert(process.argv.includes('--apply'),'Run with --apply to seed explicitly authorized local demos');
async function publish(id){await call(owner,'mutation','listings:publish',{id}); const l=await call(owner,'query','listings:getById',{id}); const approved=await call(staff,'mutation','listings:approveListing',{id,expectedRevision:l.revision??0,note:'DEMO ONLY. Stock images and public civic area anchor are illustrative. No rental, ownership or provider verification is offered.'});assert(approved.live,approved.issues.join(' '));return call(anon,'query','listings:getById',{id})}
async function area(data,index){
 const [city,state,zip,address,label]=data;
 let root;
 for(let unit=0;unit<(index<2?6:3);unit++){
  const title=`[DEMO] ${city} ${label} ${['Retreat','Studio','Residence','Loft','Garden Suite','Townhouse'][unit]}`;
  let l=existing.find(x=>x.title===title);
  if(l)assert(l.landlordId===me._id && /Synthetic local demo/.test(l.description),'Refusing unrelated listing');
  if(!l){
   const id=await call(owner,'mutation','listings:create',{landlordId:me._id,title,description:`Synthetic local demo for visual review only. No rental is offered. Photos are unrelated illustrative stock images. The approximate map area uses a public civic address in ${city}, ${state}; no property ownership, availability or endorsement is claimed.`,city,state,zip,address,price:1600+index*130+unit*220,bedrooms:unit===1?1:2,bathrooms:unit===2?2:1,maxOccupancy:unit===1?2:4,propertyType:unit===2?'House':'Apartment',amenities:['WiFi','Dedicated Workspace','Air Conditioning','Washer','Dryer'],photos:[],photoAssets:sample.photoAssets.map((_,i)=>sample.photoAssets[(i+index+unit)%5]),petFriendly:unit===2,utilitiesIncluded:true,parkingIncluded:unit!==1,availableFrom:Date.UTC(2026,9,1),minStay:1,details:{rooms:[{name:'Bedroom',beds:unit===1?'Queen bed':'King bed'}],fees:[],smoking:'prohibited',rules:'Demonstration only. This is not an offer to rent.',facilities:[]},...(unit?{parentListingId:root,unitName:`Demo ${['Retreat','Studio','Residence','Loft','Garden Suite','Townhouse'][unit]}`,independentSpace:true}:{})});
   l=await call(owner,'query','listings:getById',{id}); existing.push(l);
  }
  if(!unit){
   root=l._id;
   if(l.address!==address) await call(staff,'mutation','geo:correctAddress',{listingId:root,address,city,state,zip,note:'Correct public civic demo anchor after Census returned no candidate. Not a rental address.'});
   const location=await call(owner,'query','geo:mine',{listingId:root});
   if(location?.status!=='confirmed'){
    await call(owner,'action','geo:lookupListing',{listingId:root,consent:true,expectedProvider:'census'});
    const found=await call(owner,'query','geo:mine',{listingId:root}); assert(found?.status==='candidate' && found.candidates.length,'Census must return a real address candidate');
    await call(owner,'mutation','geo:confirm',{listingId:root,generation:found.generation,candidate:0});
   }
  }
  const live=await publish(l._id); assert(live?.isPublic && Number.isFinite(live.mapLatitude) && Number.isFinite(live.mapLongitude),'Native public map location required');
  const map=await call(anon,'query','search:listings',{nearLatitude:live.mapLatitude,nearLongitude:live.mapLongitude,radiusMiles:1,paginationOpts:{cursor:null,numItems:48}});
  assert(map.page.some(x=>x._id===l._id),'Demo must appear in native map area search');
  receipt.results.push({id:l._id,title,city,state,mapLatitude:live.mapLatitude,mapLongitude:live.mapLongitude,nativePublic:true,nativeMapSearch:true,photos:live.photos.length});save();
  console.log(`Published ${receipt.results.length}/36 ${title}`);
 }
}
// Three bounded workers. Native provider limits remain in force with no retries or identity rotation.
const areas=cities.filter(c=>!['New York','Nashville'].includes(c[0]));
let cursor=0; await Promise.all(Array.from({length:3},async()=>{while(cursor<areas.length){const i=cursor++;try{await area(areas[i],i)}catch(e){receipt.errors.push({city:areas[i][0],error:e.message});save();console.error(`Demo area incomplete: ${areas[i][0]}: ${e.message}`)}}}));
receipt.completedAt=new Date().toISOString();save();console.log(JSON.stringify({published:receipt.results.length,errors:receipt.errors,receipt:'docs/evidence/local-demo-marketplace.json'},null,2));
assert.equal(receipt.results.length,36,'Some demo areas could not be confirmed; inspect receipt without inventing coordinates');
