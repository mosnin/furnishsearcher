"use client";
import {useState} from 'react';
import Link from 'next/link';
import {House,CaretLeft,CaretRight} from '@phosphor-icons/react';
import {SaveRentalButton} from '@/components/public-experience/save-rental-button';
import {cn,formatPrice} from '@/lib/utils';
export interface ListingCardData{_id:string;featured?:boolean;title:string;city:string;state:string;price:number;bedrooms:number;bathrooms:number;propertyType:string;photos:string[];petFriendly:boolean;parkingIncluded:boolean;utilitiesIncluded:boolean;availableFrom:number;minStay:number;}
export function ListingCard({listing,className,href:customHref}:{listing:ListingCardData;className?:string;href?:string}){
 const [photo,setPhoto]=useState(0),current=Math.min(photo,Math.max(0,listing.photos.length-1));
 const href=customHref??`/listings/${listing._id}`;
 return <article className={cn('public-rental-card w-property-card',className)}><div className="w-card-photo"><Link href={href} aria-label={`View ${listing.title}`}>{listing.photos[current]?<img key={listing.photos[current]} src={listing.photos[current]} alt={listing.title} loading="lazy"/>:<span className="w-card-placeholder"><House size={32} weight="light"/><span>Photos coming soon</span></span>}</Link><SaveRentalButton listingId={listing._id}/>{listing.featured&&<span className="w-card-tier">Sponsored</span>}{listing.photos.length>1&&<><button type="button" className="w-photo-prev w-icon-button" aria-label={`Previous photo of ${listing.title}`} onClick={()=>setPhoto((current-1+listing.photos.length)%listing.photos.length)}><CaretLeft size={17}/></button><button type="button" className="w-photo-next w-icon-button" aria-label={`Next photo of ${listing.title}`} onClick={()=>setPhoto((current+1)%listing.photos.length)}><CaretRight size={17}/></button><div className="w-photo-progress" aria-label={`Photo ${current+1} of ${listing.photos.length}`}><span style={{width:`${100/listing.photos.length}%`,transform:`translateX(${current*100}%)`}}/></div></>}</div><div className="w-card-copy"><p className="w-card-location">{listing.city}, {listing.state}</p><h3><Link href={href}>{listing.title}</Link></h3><p className="w-card-meta">{listing.bedrooms} {listing.bedrooms===1?'bedroom':'bedrooms'} · {formatPrice(listing.price)} / month</p></div></article>;
}
export default ListingCard;
