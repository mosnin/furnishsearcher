"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, useClerk } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { List, X } from "@phosphor-icons/react";
import { SearchPill } from "@/components/public-experience/search-pill";
import { Brand } from "@/components/brand";
import { usePublicAuth } from "@/components/public-experience/auth-context";
export default function Navbar(){
 const {isSignedIn}=useAuth(),clerk=useClerk(),path=usePathname();
 const [scrolled,setScrolled]=useState(false),[menuOpen,setMenuOpen]=useState(false);
 useEffect(()=>{const update=()=>setScrolled(window.scrollY>80);update();window.addEventListener('scroll',update,{passive:true});return()=>window.removeEventListener('scroll',update);},[]);
 useEffect(()=>{setMenuOpen(false);},[path]);
 const openAuth=usePublicAuth();
 const home=path==='/',showSearch=home||path.startsWith('/search')||path.startsWith('/listings');
 return <><header className="w-header" data-hero={home&&!scrolled} data-home={home}>
   <Link href="/" className="w-brand"><Brand size={34}/></Link>
   {showSearch&&<div className="w-header-search"><Suspense fallback={<span>Start your search</span>}><SearchPill/></Suspense></div>}
   <div className="w-header-actions"><Link className="w-owner-link" href={isSignedIn?'/search':'/list-your-property'}>{isSignedIn?'Explore rentals':'For property owners'}</Link>{isSignedIn&&<Link href="/account" className="w-account-avatar" aria-label="Your account">{clerk.user?.firstName?.slice(0,1)||'A'}</Link>}
   <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}><Menu.Trigger className="w-icon-button w-menu-trigger" aria-label={menuOpen?'Close account menu':'Open account menu'}><span className="w-menu-symbol" data-open={menuOpen}>{menuOpen?<X size={21}/>:<List size={21}/>}</span></Menu.Trigger><Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={12} className="w-menu-positioner"><Menu.Popup className="furnish-ui w-account-menu">
   {isSignedIn?<><Menu.LinkItem render={<Link href="/account"/>}>View profile</Menu.LinkItem><Menu.LinkItem render={<Link href="/account/stays"/>}>View stays</Menu.LinkItem><Menu.LinkItem render={<Link href="/account/saved"/>}>View wishlist</Menu.LinkItem><Menu.LinkItem render={<Link href="/dashboard/messages"/>}>View messages</Menu.LinkItem><Menu.Separator/></>:<><Menu.Item onClick={()=>openAuth()}>Sign in or sign up</Menu.Item><Menu.Separator/></>}
   <Menu.LinkItem render={<Link href="/list-your-property"/>}>List your property</Menu.LinkItem><Menu.LinkItem render={<Link href="/resources"/>}>Traveler resources</Menu.LinkItem><Menu.LinkItem render={<Link href="/contact"/>}>Visit help center</Menu.LinkItem>{isSignedIn&&<><Menu.LinkItem render={<Link href="/dashboard"/>}>Open your dashboard</Menu.LinkItem><Menu.Separator/><Menu.Item onClick={()=>void clerk.signOut({redirectUrl:'/'})}>Sign out</Menu.Item></>}
   </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></div>
 </header>{home&&<div className="w-home-header-space"/>}
 </>;
}
