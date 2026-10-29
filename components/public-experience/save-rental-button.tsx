"use client";
import {useState} from 'react';
import {useAuth} from '@clerk/nextjs';
import {useConvexAuth,useQuery,useMutation} from 'convex/react';
import {api} from '@/convex/_generated/api';
import type {Id} from '@/convex/_generated/dataModel';
import {Heart} from '@phosphor-icons/react';
import {toast} from 'sonner';
import {usePublicAuth} from './auth-context';
import {RemoveSavedDialog} from '@/components/remove-saved-dialog';
export function SaveRentalButton({listingId}:{listingId:string}){
 const {userId}=useAuth(),{isAuthenticated}=useConvexAuth(),openAuth=usePublicAuth();
 const me=useQuery(api.users.getByClerkId,isAuthenticated&&userId?{clerkId:userId}:'skip');
 const saved=useQuery(api.saved.isSaved,me?.role==='tenant'?{tenantId:me._id,listingId:listingId as Id<'listings'>}:'skip');
 const save=useMutation(api.saved.save),unsave=useMutation(api.saved.unsave);
 const [busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
 async function update(remove=false){if(!userId){openAuth();return;}if(!me||me.role!=='tenant'){toast.error('Saved rentals are available to traveler accounts.');return;}if(busy)return;setBusy(true);try{await(remove?unsave:save)({tenantId:me._id,listingId:listingId as Id<'listings'>});setConfirm(false);if(!remove)toast.success('Added to your wishlist');}catch(e){toast.error(e instanceof Error?e.message:'Could not update your wishlist.');}finally{setBusy(false);}}
 return <><button type="button" className="w-save-heart" aria-label={saved?'Remove from wishlist':'Save to wishlist'} aria-pressed={!!saved} disabled={busy||(!!me&&me.role==='tenant'&&saved===undefined)} onClick={()=>saved?setConfirm(true):void update()}><Heart size={26} weight={saved?'fill':'regular'}/></button><RemoveSavedDialog open={confirm} onOpenChange={setConfirm} busy={busy} onConfirm={()=>void update(true)}/></>;
}
