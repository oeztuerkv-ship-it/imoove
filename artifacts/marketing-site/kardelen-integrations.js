/* Read-only adapters. Derive public links from existing ONRODA markup. No credentials. */
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory();else root.KardelenIntegrations=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function allowedLink(raw,kind){try{const u=new URL(raw);if(kind==='whatsapp')return u.protocol==='https:'&&u.hostname==='wa.me'&&/^\/\d{8,15}\/?$/.test(u.pathname)?u.origin+u.pathname:null;if(kind==='ios')return u.protocol==='https:'&&u.hostname==='apps.apple.com'&&/\/id\d+/.test(u.pathname)?u.href:null;if(kind==='android')return u.protocol==='https:'&&u.hostname==='play.google.com'&&u.pathname==='/store/apps/details'&&u.searchParams.has('id')?u.href:null;return null;}catch(_){return null;}}
  function config(doc,location){
    const href=selector=>{const a=doc.querySelector(selector);return a&&a.getAttribute('href');};
    const meta=doc.querySelector('meta[name="onroda-public-api-base"]');let base=meta&&meta.getAttribute('content');
    if(!base)base=['localhost','127.0.0.1'].includes(location.hostname)?'http://'+location.hostname+':3000/api':'https://api.onroda.de/api';
    try{const u=new URL(base);if(!(u.origin==='https://api.onroda.de'||u.origin===location.origin||(['localhost','127.0.0.1'].includes(location.hostname)&&['localhost','127.0.0.1'].includes(u.hostname))))base=null;}catch(_){base=null;}
    // Email/phone exist in the checked-in Impressum; no invented contact or Android store URL.
    const mail=href('a[href="mailto:info@onroda.de"]')||'mailto:info@onroda.de';
    const phone=href('a[href="tel:+4917684229016"]')||'tel:+4917684229016';
    return{whatsapp:allowedLink(href('.hp-whatsapp-fab'),'whatsapp'),ios:allowedLink(href('a[href*="apps.apple.com/"]'),'ios'),android:allowedLink(href('a[href*="play.google.com/store/apps/details"]'),'android'),appPage:'/#jetzt-buchen',partner:'/#partner',pricePage:'/fixpreise/#fixpreis-calculator',mail,phone,apiBase:base,onlineBooking:null,deepLink:null};
  }
  function whatsapp(config,summary){if(!config.whatsapp)return null;return config.whatsapp+'?text='+encodeURIComponent(summary);}
  function createQuoteClient(fetchFn,base){
    let pending=null;
    async function quote(args){
      if(pending)throw new Error('busy');if(!base)throw new Error('unavailable');
      if(!args.fromFull||!args.toFull||args.fromFull.length>180||args.toFull.length>180||!['standard','xl','wheelchair'].includes(args.vehicle))throw new Error('invalid');
      const ctrl=new AbortController();pending=ctrl;const timer=setTimeout(()=>ctrl.abort(),20000);
      try{const query=new URLSearchParams({fromFull:args.fromFull,toFull:args.toFull,vehicle:args.vehicle});const res=await fetchFn(base+'/public/fixed-price-quote?'+query,{method:'GET',credentials:'omit',signal:ctrl.signal,cache:'no-store'});if(!res.ok)throw new Error('quote_unavailable');const data=await res.json();if(!data||data.ok!==true||!data.quote)throw new Error('invalid_response');
        if(data.quote.eligible===false)return{eligible:false};
        if(data.quote.eligible!==true||data.quote.pricingMode!=='fixed_price'||typeof data.quote.priceEur!=='number'||!Number.isFinite(data.quote.priceEur)||data.quote.priceEur<0||!data.from||!data.to||typeof data.from.displayName!=='string'||typeof data.to.displayName!=='string')throw new Error('invalid_response');
        return{eligible:true,pricingMode:data.quote.pricingMode,priceEur:data.quote.priceEur,from:data.from.displayName.slice(0,240),to:data.to.displayName.slice(0,240)};
      }finally{clearTimeout(timer);if(pending===ctrl)pending=null;}
    }
    return{quote,cancel(){if(pending)pending.abort();},busy:()=>!!pending};
  }
  return{config,allowedLink,whatsapp,createQuoteClient};
});
