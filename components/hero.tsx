"use client";
import { useEffect, useState } from "react";
export default function Hero(){
 const [animate,setAnimate]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setAnimate(!media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 return <section className="w-hero"><img src="/media/globe-hero-poster.jpg" alt="" className="w-hero-media" fetchPriority="high"/>{animate&&<video className="w-hero-media" autoPlay muted loop playsInline preload="none" poster="/media/globe-hero-poster.jpg" aria-hidden="true"><source src="https://videos.pexels.com/video-files/39398461/16775486_1920_1080_30fps.mp4" type="video/mp4"/></video>}<div className="w-hero-shade"/><div className="w-hero-copy"><h1>The future of monthly stays is direct</h1><p>Furnished homes for your next chapter, connected directly with property owners</p></div></section>;
}
