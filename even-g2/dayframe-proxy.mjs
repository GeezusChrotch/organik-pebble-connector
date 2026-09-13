const routes=new Set(['/dayframe/v1/health','/dayframe/v1/calendars','/dayframe/v1/events']);
export function dayframeRoute(method,pathname){return method==='GET'&&routes.has(pathname);}
export async function proxyDayframe(url,config,fetcher,upstream='http://127.0.0.1:7848'){
 if(!config.eventzToken)return {status:503,data:{error:'Enable Calendars in Connector → Even G2 → DayFrame, then restart the G2 connection.'}};
 const target=new URL(url.pathname.slice('/dayframe'.length),upstream);
 if(url.pathname.endsWith('/events')){
  const start=url.searchParams.get('start'),end=url.searchParams.get('end');
  if(start===null||end===null||!start.trim()||!end.trim()||!Number.isFinite(Number(start))||!Number.isFinite(Number(end))||Number(start)<-62135596800||Number(end)>253402300800||Number(end)<=Number(start)||Number(end)-Number(start)>32*86400)return {status:400,data:{error:'Choose a valid date range of at most 32 days.'}};
  target.search=new URLSearchParams({start,end}).toString();
 }
 const response=await fetcher(target.toString(),{headers:{Authorization:'Bearer '+config.eventzToken},signal:AbortSignal.timeout(14000),redirect:'error'});
 if(!response.ok)return {status:response.status===503?503:502,data:{error:response.status===503?'Allow Calendars access in the Mac Connector.':'Calendar service unavailable. Check DayFrame in the Mac Connector.'}};
 const data=await response.json();return {status:200,data};
}
