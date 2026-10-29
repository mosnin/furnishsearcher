"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { SignIn, useAuth } from "@clerk/nextjs";
import { Modal } from "@/components/ui-system/primitives";
import { clerkAppearance } from "@/components/ui-system/clerk-appearance";
const Context=createContext<(returnTo?:string)=>void>(()=>{});
export function PublicAuthProvider({children}:{children:React.ReactNode}){
 const { isSignedIn } = useAuth();
 const [open,setOpen]=useState(false),[returnTo,setReturnTo]=useState('/account');
 useEffect(() => { if (isSignedIn) setOpen(false); }, [isSignedIn]);
 return <Context.Provider value={path=>{setReturnTo(path??window.location.pathname+window.location.search);setOpen(true);}}>{children}<Modal open={open} onOpenChange={setOpen} title="Log in or sign up" className="w-auth-dialog"><SignIn routing="virtual" appearance={clerkAppearance} signUpUrl="/sign-up" forceRedirectUrl={returnTo}/></Modal></Context.Provider>;
}
export const usePublicAuth=()=>useContext(Context);
