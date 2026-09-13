/** Keep a real scroll surface inside the host WebView when its keyboard changes size. */
export function installPhoneViewport(root:HTMLElement,host:Window=window):()=>void {
 const viewport=host.visualViewport;
 let frame=0;
 const update=()=>{
  const height=viewport?.height||host.innerHeight;
  if(height>0)root.style.setProperty('--phone-height',`${Math.round(height)}px`);
 };
 const schedule=()=>{host.cancelAnimationFrame(frame);frame=host.requestAnimationFrame(update);};
 viewport?.addEventListener('resize',schedule);
 host.addEventListener('resize',schedule);
 root.addEventListener('focusout',schedule);
 update();
 return ()=>{host.cancelAnimationFrame(frame);viewport?.removeEventListener('resize',schedule);host.removeEventListener('resize',schedule);root.removeEventListener('focusout',schedule);};
}
