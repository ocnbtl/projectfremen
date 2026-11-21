"use client";
const eventName = "unigentamos-media-details-changed";
export function announceMediaDetails() {
  window.dispatchEvent(new Event(eventName));
  try {localStorage.setItem(eventName,crypto.randomUUID());} catch { /* Focus also refreshes another tab. */ }
}
export function watchMediaDetails(update:()=>void) {
  const storage=(event:StorageEvent)=>{if(event.key===eventName)update();};
  window.addEventListener(eventName,update);
  window.addEventListener("storage",storage);
  window.addEventListener("focus",update);
  return ()=>{
    window.removeEventListener(eventName,update);
    window.removeEventListener("storage",storage);
    window.removeEventListener("focus",update);
  };
}
