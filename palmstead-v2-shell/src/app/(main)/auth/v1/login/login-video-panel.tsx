"use client";

import { useEffect, useState } from "react";

const VIDEOS = ["/login-bg.mp4", "/login-bg-2.mp4"];

// Real user ask (2026-09-11): "the videos i gave u for the sign in
// screen are two ... they keep switching randomly u can open the app
// and any will of the two will be displayed." There is only one real
// screen here -- signing out redirects back to this exact same /auth/
// v1/login page, not a separate "you've signed out" screen -- so
// "different video for sign in vs sign out" and "random on every open"
// describe the same thing: whichever of the two this page happens to
// pick when it loads.
//
// Real bug caught live testing this: picking randomly straight in
// useState's initializer runs during BOTH the server render and the
// client's first render (React re-runs it to hydrate), and those two
// Math.random() calls disagree -- a real hydration mismatch React
// itself flagged in the console ("won't be patched up," left the video
// on whichever src the server happened to pick). Fixed the standard
// safe way: render a fixed default on the first pass (server and client
// agree, no mismatch), then roll the real random pick in an effect,
// which only ever runs client-side, after hydration is already done.
export function LoginVideoPanel() {
  const [src, setSrc] = useState(VIDEOS[0]);
  useEffect(() => {
    setSrc(VIDEOS[Math.floor(Math.random() * VIDEOS.length)]);
  }, []);
  return <video key={src} className="absolute inset-0 size-full object-cover" src={src} autoPlay muted loop playsInline />;
}
