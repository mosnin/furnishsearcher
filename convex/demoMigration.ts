import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import data from "./demoSeedData.json";
// Explicitly authorized synthetic catalog transfer. Internal only; never replaces customer data.
export const seed = internalMutation({args:{},handler:async(ctx)=>{
 if(process.env.CONVEX_CLOUD_URL!=="https://cheerful-ferret-182.convex.cloud")throw new Error("This fixture is restricted to the authorized development demo.");
 const db=ctx.db as any;
 const prior=await db.query("users").withIndex("by_clerk_id",(q:any)=>q.eq("clerkId","qa-owner-search")).first();
 if(prior) throw new Error("Demo owner already exists; refuse duplicate seed.");
 const clean=(row:any)=>{const {_id,_creationTime,...rest}=row;return rest};
 const source:any=data;
 if(source.listings.length!==36||!source.listings.every((l:any)=>l.title.startsWith("[DEMO]")&&l.description.includes("No rental is offered")))throw new Error("Invalid demo source");
 const u=clean(source.users[0]); delete u.identityCheckId;u.name="globe Demo Properties";
 const owner=await db.insert("users",u);
 for(const row of source.identityChecks){const check=await db.insert("identityChecks",{...clean(row),userId:owner});await db.patch(owner,{identityCheckId:check});}
 for(const row of source.subscriptions)await db.insert("subscriptions",{...clean(row),userId:owner});
 const ids=new Map<string,any>();
 for(const row of source.listings){const l=clean(row);delete l.parentListingId;delete l.propertyGroupId;l.landlordId=owner;ids.set(row._id,await db.insert("listings",l));}
 const groups=new Map<string,any>();
 for(const row of source.properties){const p=clean(row);p.ownerId=owner;p.primaryListingId=ids.get(row.primaryListingId);groups.set(row._id,await db.insert("properties",p));}
 for(const row of source.listings)await db.patch(ids.get(row._id),{...(row.parentListingId?{parentListingId:ids.get(row.parentListingId)}:{}),...(row.propertyGroupId?{propertyGroupId:groups.get(row.propertyGroupId)}:{})});
 await ctx.scheduler.runAfter(0,internal.geo.reindex,{cursor:null,version:2});
 return {demoListings:ids.size,areas:groups.size,synthetic:true,noRealProviderTransaction:true};
}});
