/* Kardi: local intent retrieval and trip preparation. No booking writes or local pricing. */
(function(root,factory){if(typeof module!=="undefined"&&module.exports)module.exports=factory(require('./kardelen-knowledge.js'));else root.KardelenEngine=factory(root.KardelenKnowledge);})(typeof globalThis!=="undefined"?globalThis:this,function(K){
  'use strict';
  if(!K)throw new Error('knowledge_missing');
  const languages=['de','en','tr'];
  function n(v){return String(v||'').toLowerCase().replace(/ı/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();}
  function pick(map,lang){return map[lang]||map.de;}
  function text(de,en,tr,lang){return pick({de,en,tr},lang);}
  function distance(a,b){if(Math.abs(a.length-b.length)>2)return 9;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row;}return prev[b.length];}
  const stop=new Set(n('nicht noch auch ja nein doch lieber jetzt welche welcher welches bin bist seid mein meine dein deine unser unsere ihr ihre ihnen es ich du wir sie der die das ein eine einen einer einem und oder ist sind habe haben kann kannst konnen mir mich es bitte was wie wo wann mit fur von nach zum zur in am um do does can you i we a the to from is are have my me it this that of for at bir bu ben biz ne ve mi var icin').split(' '));
  const aliases={
    price:'preis preiss presi preise kosten kostet kosted kostetet fahrpreis tarif wieviel wie viel kostenvoranschlag price fare cost how much fiyat ucret kac para ne kadar',
    fixed_price:'fixpreis festpreis pauschalpreis pauschale pauschal fixpreiss festpreiss fixed fare flat rate flat fare sabit fiyat sabit ucret',
    offer:'angebot angebott offer quote quotation teklif', negotiation:'rabatt handeln discount negotiate indirim pazarlik',
    vehicle:'mercedes e klasse eclass kombi vip limousine estate wagon premium fahrzeug autos araba arac',
    luggage:'koffer kofffer gepack gepaeck handgepack suitcase luggage baggage bags valiz bavul bagaj personen passengers kisiyiz kisi',
    large_luggage:'zehn koffer ten suitcases on valiz', stroller:'kinderwagen buggy stroller pushchair bebek arabasi',
    bicycle:'fahrrad bicycle bike bisiklet', bulky:'fernseher television tv sperrig bulky', pet:'hund katze dog cat kopek kedi',
    accessibility:'rollstuhl barrierefrei rollstuhlgerecht wheelchair accessible tekerlekli sandalye engelli',
    child:'kindersitz baby babyschale child seat booster cocuk koltugu bebek', senior:'senior einsteigen aussteigen elderly yasli',
    airport:'flughafen flughafentransfer airport transfer havalimani havaalani', flight:'flugnummer flugverspatung verspatung flight delayed delay ucus numarasi gecikme gecikti',
    meeting:'treffpunkt terminal meeting point bulusma', cancelled_flight:'flug gestrichen flight cancelled ucus iptal',
    instant:'jetzt sofort now immediately simdi hemen', reservation:'reservieren vorbestellen reservierung morgen tomorrow reservation reserve yarin rezervasyon', booking:'taxi buchen bestellen book booking order taksi cagirmak',
    status:'bestatigt fahrer unterwegs wann kommt status confirmed driver arrival onay sofor nerede', change_booking:'buchung andern change booking rezervasyon degistir', cancel:'stornieren stornierung storno cancel cancellation iptal',
    stops:'zwischenstopp stopps stops durak', return_trip:'ruckfahrt hin und ruck return round trip gidis donus', group:'grossraum gruppe gruppen group passengers kisiyiz kisilik', large_group:'zwanzig sechsunddreissig twenty thirty six yirmi otuz alti drei autos three cars uc arac',
    payment:'bar kreditkarte kartenzahlung karte zahlen bezahlen cash credit card visa mastercard nakit kredi karti odeme', wallet:'apple pay google pay wallet', invoice:'rechnung firmenrechnung invoice fatura', receipt:'quittung beleg receipt fis makbuz', tip:'trinkgeld tip bahsis', prepayment:'abgebucht vorher abbuchen advance prepayment onceden',
    business:'firma unternehmen geschaftsreise company business sirket is seyahati', hotel:'hotel gaste guests otel misafir', contract:'vertrag contract sozlesme', partner:'partner taxiunternehmer partnership is ortagi', driver_job:'fahrer arbeiten bewerbung driver job sofor calismak',
    app:'app installieren installation download uygulama yukle', ios:'iphone ios app store', android:'android google play', tech:'funktioniert nicht fehler login anmelden not working error log in giris yapamiyorum calismiyor hata', password:'passwort vergessen forgot password sifre unuttum', missing_booking:'buchung fehlt booking missing rezervasyon goremiyorum',
    complaint:'beschwerde beschweren unfreundlich complaint complain rude sikayet kaba', missing_driver:'taxi kommt nicht taxi not arriving taksi gelmiyor', lost:'vergessen fundsache verloren lost property left something unuttum kayip esya', billing_problem:'zu viel bezahlt overcharged paid too much fazla odeme', refund:'erstattung geld zuruck refund money back para iade',
    human:'mensch personlich beratung whatsapp human real person personal support insan kisi destek danisman', information:'onroda angebot service standort region information bilgi', greeting:'hallo hi hey guten morgen hello merhaba selam gunaydin', smalltalk:'witz joke saka fikra paris', offtopic:'wetter weather hava werkstatt repair borc'
  };
  function detectLanguage(raw,previous='de'){
    const q=n(raw);if(/\b(english|auf englisch|speak english)\b/.test(q))return'en';if(/\b(turkce|turkish|turkisch)\b/.test(q))return'tr';if(/\b(deutsch|german|almanca)\b/.test(q))return'de';
    const markers={de:/\b(ich|wir|mochte|brauche|koffer|morgen|bitte|preis|kostet|zahlen|konnen|haben|fahrt|guten|danke)\b/g,en:/\b(hello|please|want|need|can|how|much|we|tomorrow|suitcase|luggage|book|cash|credit|thanks|airport)\b/g,tr:/\b(merhaba|selam|istiyorum|lazim|yarin|nakit|valiz|bavul|bagaj|kisi|kisiyiz|ucus|fiyat|ucret|taksi|tesekkur|odemek|odeyebilir|misiniz|yapabilir)\b/g};
    let best=previous,score=0;for(const lang of languages){const hits=(q.match(markers[lang])||[]).length+(lang==='tr'&&/[ğışİçş]/i.test(raw)?1:0);if(hits>score){best=lang;score=hits;}}return best;
  }
  function recognize(raw){
    const q=n(raw).replace(/\b(pries|preiss|presi)\b/g,'preis');if(!q)return[];
    // Safety, personal assistance and existing-ride problems override ordinary planning.
    const urgent=[['emergency',/\b(notfall|notarzt|bewusstlos|atemnot|medical emergency|cant breathe|cannot breathe|unconscious|acil|nefes alamiyor)\b/],['danger',/\b(gefahrlich|bedroht|gefahr|dangerously|danger|threatened|tehlike|tehlikeli)\b/],['human',/\b(menschen|mensch|personlich sprechen|whatsapp|real person|human|insan|yetkili)\b/],['cancelled_flight',/\b(flug.*gestrichen|flight.*cancelled|ucus.*iptal)\b/],['missing_driver',/\b(taxi kommt nicht|fahrer kommt nicht|taxi.*not arriv|tak.*gelmiyor)\b/],['lost',/\b(im taxi vergessen|fundsache|verloren|left.*taxi|lost property|takside.*unuttum|kayip esya)\b/],['refund',/\b(geld zuruck|erstattung|refund|money back|parami geri|para iade)\b/],['complaint',/\b(beschwer|unfreundlich|complain|rude|sikayet|kaba)\w*/]];
    for(const [intent,re]of urgent)if(re.test(q))return[{intent,key:K.records.find(r=>r.intent===intent).answer,score:100}];
    if(/\b(fahrer raucht|fahrer hat geraucht|auto stinkt|fahrzeug schmutzig|driver is smoking|car is dirty|sofor sigara iciyor)\b/.test(q))return[{intent:'complaint',key:'complaint',score:100}];
    if(/\b(rauchfrei|nichtraucher\w*|rauchen|rauch|smoke free|smokefree|non smoking|smoking|sigara|dumansiz)\b/.test(q))return[{intent:'non_smoking',key:'non_smoking',score:90}];
    if(/\b(sauber\w*|gepflegt\w*|clean|well maintained|temiz|bakimli)\b/.test(q))return[{intent:'service_quality',key:'service_quality',score:90}];
    if(/\b(fahrer|driver|drivers|sofor|soforleriniz|fliessend|fluent|akici)\b/.test(q)&&/\b(deutsch|englisch|german|english|almanca|ingilizce|sprache|language)\b/.test(q))return[{intent:'driver_language',key:'driver_language',score:90}];
    if(/\b(grossraumtaxi|grossraum|grossraumwagen|7 sitzer|siebensitzer|large taxi|seven seater|buyuk taksi|yedi kisilik)\b/.test(q)&&! /\b(preis|kostet|kosten|price|cost|fare|fiyat|ucret)\b/.test(q))return[{intent:'group',key:'group',score:85}];
    if(/\b(apple pay|google pay)\b/.test(q))return[{intent:'wallet',key:'wallet',score:99}];
    const words=q.split(' ').filter(x=>!stop.has(x)&&x.length>1);
    const matches=K.records.map(r=>{let score=0;for(const phrase of Object.values(r.questions)){const v=n(phrase);if(v===q)score=Math.max(score,30);const tokens=v.split(' ').filter(x=>!stop.has(x)&&x.length>2);let hit=0;for(const token of tokens)if(words.some(w=>w===token||(token.length>=6&&w.startsWith(token))||(w.length>=5&&token.length>=5&&distance(w,token)<=1)))hit++;if(tokens.length)score=Math.max(score,hit/Math.sqrt(tokens.length)*2);}
      const alias=(aliases[r.intent]||'').split(' ');for(const word of words)if(alias.some(t=>t===word||(word.length>=5&&t.length>=5&&distance(word,t)<=1)))score+=word.length>=4?1.5:1;
      return{intent:r.intent,key:r.answer,score};}).filter(x=>x.score>=2.4&&(x.intent!=='large_luggage'||/\b(?:8|9|10|acht|neun|zehn|ten|eight|nine|on|sekiz|dokuz|viel|much)\b/.test(q))).sort((a,b)=>b.score-a.score);
    if(!matches.length&&/\b(brauch|brauche|will|mocht|mochte|need|lazim)\b/.test(q)&&/\b(taxi|taxxi|transfer|taksi)\b/.test(q))matches.push({intent:'booking',key:'booking',score:3});
    const unique=[];for(const m of matches){if(!unique.some(x=>x.intent===m.intent))unique.push(m);if(unique.length===2)break;}return unique;
  }
  const numbers={ein:1,eine:1,einen:1,einem:1,zwei:2,drei:3,vier:4,funf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,elf:11,zwolf:12,zwanzig:20,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twenty:20,bir:1,iki:2,uc:3,dort:4,bes:5,alti:6,yedi:7,sekiz:8,dokuz:9,on:10,yirmi:20};
  function numeric(q){return q.split(' ').map(w=>numbers[w]===undefined?w:String(numbers[w])).join(' ');}
  function berlinDate(now,offset=0){const base=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=k=>base.find(p=>p.type===k).value;const d=new Date(get('year')+'-'+get('month')+'-'+get('day')+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
  function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
  function safe(raw){return String(raw||'').slice(0,2400).replace(/(?:password|passwort|sifre|token|secret|kartennummer|card number|cvv|cvc|iban)\b(?:[ \t]*[:=][ \t]*|[ \t]+)\S+[^\n]*/gi,'[…]').replace(/\b(?:\d[ -]?){13,19}\b/g,'[…]');}
  const health=/\b(diagnos|krebs|cancer|hiv|diabet|medikament|medication|tani|ilac|kemoterapi)\b/i;
  function safeSupport(raw){return health.test(n(raw))?'':safe(raw);}
  function extract(raw,state,now){
    const q=n(raw),num=numeric(q),trip=state.trip,changes={};
    const people=num.match(/\b(\d{1,3})\s*(?:personen|person|leute|fahrgaste|passengers?|people|kisiyiz|kisi|kisilik)\b/)||num.match(/\b(?:wir sind(?: jetzt)?|we are(?: now)?|biz)\s*(\d{1,3})\b/);
    if(people)changes.people=Number(people[1]);
    const bags=num.match(/\b(\d{1,3})\s*(?:(?:grosse[nr]?|kleine[nr]?|large|big|small|buyuk|kucuk)\s+)?(?:koffern?|gepack|suitcases?|bags?|valiz\w*|bavul\w*|bagaj)\b/);
    if(bags)changes.bags=Number(bags[1]);
    if(/\b(kein gepack|keine koffer|no luggage|no bags|bagaj yok|valiz yok)\b/.test(q))changes.bags=0;
    if(/\b(gross|grosse[nr]?|large|big|buyuk)\b/.test(q))changes.bagType='large';else if(/\b(handgepack|cabin|hand luggage|el bagaji)\b/.test(q))changes.bagType='cabin';
    if(/\b(mercedes|e klasse|e class|e serisi|kombi|estate|station wagon)\b/.test(q))changes.vehicle='Mercedes E-Klasse Kombi (Wunsch)';
    if(/\b(bar|cash|nakit)\b/.test(q))changes.payment='cash';if(/\b(kreditkarte|credit card|kredi karti)\b/.test(q))changes.payment='card';
    if(/\b(kind|baby|cocuk|bebek|child seat)\b/.test(q))changes.child='requested';
    if(/\b(rollstuhl|wheelchair|tekerlekli|barrierefrei)\b/.test(q))changes.mobility='requested';
    if(/\b(kinderwagen|stroller|bebek arabasi)\b/.test(q))changes.stroller='requested';
    if(/\b(fahrrad|bicycle|bisiklet)\b/.test(q))changes.bicycle='requested';
    if(/\b(hund|dog|kopek|katze|cat|kedi)\b/.test(q))changes.pet='requested';
    const age=num.match(/\b(\d{1,2})\s*(jahre|monate|years|months|yasinda|aylik)\b/);if(age&&(trip.child||changes.child))changes.childAge=age[1]+' '+age[2];
    const fl=raw.match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/);if(fl)changes.flight=fl[1]+fl[2];
    if(/\b(keine flugnummer|ohne flugnummer|no flight number|ucus numaram yok)\b/.test(q))changes.flight='none';
    if(/\b(uber morgen|ubermorgen|day after tomorrow|obur gun)\b/.test(q))changes.date=berlinDate(now,2);else if(/\b(morgen|tomorrow|yarin)\b/.test(q)&&!/^guten morgen$/.test(q))changes.date=berlinDate(now,1);else if(/\b(heute|today|bugun)\b/.test(q))changes.date=berlinDate(now,0);
    const iso=raw.match(/\b(20\d\d-\d\d-\d\d)\b/),dmy=raw.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
    if(iso)changes.date=iso[1];else if(dmy)changes.date=dmy[3]+'-'+dmy[2].padStart(2,'0')+'-'+dmy[1].padStart(2,'0');
    const clock=num.match(/\b(?:um|at|saat)\s*(\d{1,2})(?:\s+(\d{2}))?\b/)||raw.match(/\b(\d{1,2}):(\d{2})\b/);
    if(clock){let hour=Number(clock[1]);if(/\bpm\b/.test(q)&&hour<12)hour+=12;changes.time=String(hour).padStart(2,'0')+':'+(clock[2]||'00');}
    if(/^(jetzt|sofort|now|immediately|simdi|hemen)$/.test(q)||/\b(jetzt|sofort|now|immediately|simdi|hemen)\b/.test(q)&&/\b(taxi|taksi|fahrt|ride|brauche|need|lazim)\b/.test(q)){changes.time='now';changes.date=berlinDate(now,0);}
    // A flight departure/landing time is not a pickup time.
    if(/\b(mein flug|flight leaves|ucagim|lande|i land|iniyorum)\b/.test(q)&&changes.time){changes.flightTime=changes.time;delete changes.time;}
    const route=raw.match(/(?:^|\s)(?:von|from)\s+(.+?)\s+(?:nach|to)\s+(.+?)(?=[.!?]|$)/i)||raw.match(/^(.+?)\s*(?:→|->)\s*(.+)$/);
    const cleanPlace=v=>v.replace(/\s+(?:morgen|heute|tomorrow|today|yarın|um\s+\d|at\s+\d|mit\s+\d|for\s+\d).*$/i,'').trim().replace(/[?!.,]+$/,'').slice(0,180);
    if(route){changes.from=cleanPlace(route[1]);changes.to=cleanPlace(route[2]);}
    if(!route){
      const stripped=raw.replace(/^(?:was kostet|wie viel kostet|preis fur|fixpreis fur|angebot fur|how much for|price for)\s+/i,'');
      const simple=stripped.match(/^(.{2,100}?)\s+(?:nach|to)\s+(.{2,140})$/i);
      if(simple&&!/^(ich|wir|kann|was|i |we |can |what |how )/i.test(simple[1])){changes.from=cleanPlace(simple[1]);changes.to=cleanPlace(simple[2]);}
      const turkish=raw.match(/^(.+?)(?:'|’)(?:den|dan|ten|tan)\s+(.+?)(?:'|’)(?:na|ne|ya|ye|a|e)$/i);
      if(turkish){changes.from=cleanPlace(turkish[1]);changes.to=cleanPlace(turkish[2]);}
    }
    const replacement=raw.match(/(?:nicht|not)\s+.+?\s+(?:sondern|but)\s+(.+)$/i);if(replacement)changes.to=cleanPlace(replacement[1]);
    if(!changes.to&&/\b(zum flughafen|to the airport|havalimanina)\b/.test(q))changes.to='Flughafen';
    if(!changes.from&&/\b(vom flughafen|from the airport|havalimanindan)\b/.test(q))changes.from='Flughafen';
    if(state.expected==='returnDate'&&changes.date){changes.returnDate=changes.date;delete changes.date;}if(state.expected==='returnTime'&&changes.time){changes.returnTime=changes.time;delete changes.time;}
    const expected=state.expected;
    if(expected&&raw.length<=200&&!/[?]/.test(raw)&&!recognize(raw).some(x=>['price','payment','human','complaint','flight','app','ios','android','wallet'].includes(x.intent))){
      if(['from','to'].includes(expected)&&!changes[expected]&&!people&&!bags&&!iso&&!dmy){let place=cleanPlace(raw.replace(/\s+(?:um|at|saat)\s+.*$/i,''));if(place.length>=3&&!/^(ja|nein|yes|no|evet|hayir|danke|thanks|tesekkur|doch lieber|lieber|statt|instead|actually|keine ahnung|weiss ich nicht|ich weiss nicht|i dont know|not sure|bilmiyorum|emin degilim)$/i.test(n(place))&&!/^(doch|lieber|wir sind|we are|nicht|not)\b/.test(n(place)))changes[expected]=place;}
      if(expected==='people'&&/^\d{1,3}$/.test(num))changes.people=Number(num);
      if(expected==='bags'&&/^\d{1,3}$/.test(num))changes.bags=Number(num);
      if(expected==='flight'&&/^(ohne|keine|none|no|yok)$/.test(q))changes.flight='none';
    }
    if(changes.date&&!validDate(changes.date)){delete changes.date;changes._invalid='date';}
    if(changes.time&&changes.time!=='now'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(changes.time)){delete changes.time;changes._invalid='time';}
    if(changes.people!==undefined&&(changes.people<1||changes.people>200)){delete changes.people;changes._invalid='people';}
    if(changes.bags!==undefined&&(changes.bags<0||changes.bags>200)){delete changes.bags;changes._invalid='bags';}
    // Data-only fields; no free medical notes are retained or sent.
    if(/\b(ruckfahrt|zuruck|return trip|round trip|donus|gidis donus)\b/.test(q)){changes.returnRequested=true;if(trip.date&&changes.date){changes.returnDate=changes.date;delete changes.date;}if(trip.time&&changes.time){changes.returnTime=changes.time;delete changes.time;}}
    return changes;
  }
  const labels={from:['Abholung','Pickup','Alınma'],to:['Ziel','Destination','Varış'],date:['Datum','Date','Tarih'],time:['Uhrzeit','Time','Saat'],people:['Personen','Passengers','Kişi'],bags:['Gepäckstücke','Bags','Bagaj'],bagType:['Gepäckart','Bag type','Bagaj türü'],flight:['Flugnummer','Flight number','Uçuş numarası'],flightTime:['Flugzeit (keine Abholzeit)','Flight time (not pickup)','Uçuş saati (alınma değil)'],vehicle:['Fahrzeugwunsch','Vehicle preference','Araç tercihi'],payment:['Zahlungswunsch','Payment preference','Ödeme tercihi'],child:['Kindersitz abstimmen','Child seat to arrange','Çocuk koltuğu görüşülecek'],mobility:['Unterstützung persönlich abstimmen','Arrange assistance personally','Desteği kişisel görüş'],returnDate:['Rückfahrt-Datum','Return date','Dönüş tarihi'],returnTime:['Rückfahrt-Uhrzeit','Return time','Dönüş saati'],childAge:['Alter des Kindes','Child age','Çocuğun yaşı'],stroller:['Kinderwagen abstimmen','Arrange stroller','Bebek arabası görüşülecek'],bicycle:['Fahrrad abstimmen','Arrange bicycle','Bisiklet görüşülecek'],pet:['Tiermitnahme abstimmen','Arrange pet carriage','Evcil hayvan görüşülecek'],returnRequested:['Rückfahrt persönlich abstimmen','Arrange return separately','Dönüş ayrıca görüşülecek']};
  function label(key,lang){return(labels[key]||[key,key,key])[languages.indexOf(lang)];}
  function value(key,v,lang){if(v==='now')return text('sofort','now','şimdi',lang);if(v==='none')return text('noch offen / keine','not provided / none','henüz yok',lang);if(v==='requested'||v===true)return text('angefragt','requested','talep edildi',lang);if(key==='payment')return v==='cash'?text('Bar','Cash','Nakit',lang):text('Kreditkarte','Credit card','Kredi kartı',lang);if(key==='bagType')return v==='large'?text('große Koffer','large suitcases','büyük valiz',lang):text('Handgepäck','cabin luggage','el bagajı',lang);return String(v);}
  function summary(state){return Object.keys(labels).filter(k=>state.trip[k]!==undefined&&state.trip[k]!=='').map(k=>({key:k,label:label(k,state.language),value:value(k,state.trip[k],state.language)}));}
  function handoff(state){const l=state.language;let lines=[text('Hallo ONRODA-Team, ich habe mit Kardi gesprochen.','Hello ONRODA team, I spoke with Kardi.','Merhaba ONRODA ekibi, Kardi ile görüştüm.',l),text('Anliegen: ','Request: ','Konu: ',l)+state.intent];for(const row of summary(state)){
      // Health and disability-related information is never automatically included in WhatsApp.
      if(['mobility','child'].includes(row.key))continue;
      const clean=safeSupport(row.value);if(clean)lines.push(row.label+': '+clean);
    }
    if(state.quote&&state.quote.pricingMode==='fixed_price'&&Number.isFinite(state.quote.priceEur)){lines.push(text('Festpreis laut Preis-API (keine Buchungsbestätigung): ','Fixed fare from fare API (not a booking confirmation): ','Fiyat API’sinden sabit fiyat (rezervasyon onayı değil): ',l)+new Intl.NumberFormat(l,{style:'currency',currency:'EUR'}).format(state.quote.priceEur));lines.push(state.quote.from+' → '+state.quote.to);}
    if(state.supportQuestion&&safeSupport(state.supportQuestion))lines.push(text('Meine Frage: ','My question: ','Sorum: ',l)+safeSupport(state.supportQuestion));
    lines.push(text('Bitte um Rückmeldung. Noch keine bestätigte Buchung.','Please reply. This is not a confirmed booking.','Lütfen yanıt verin. Bu henüz onaylanmış rezervasyon değil.',l));return lines.join('\n');}
  const escalated=new Set(['human','complaint','lost','refund','billing_problem','missing_driver','negotiation','large_group','large_luggage','accessibility','contract','change_booking','cancelled_flight','tech','missing_booking','password','driver_job']);
  const planning=new Set(['price','fixed_price','offer','instant','reservation','booking','airport','return_trip']);
  function nextField(s){const t=s.trip;if(t.from&&/^(flughafen|airport|havalimani)$/.test(n(t.from)))return'from';if(t.to&&/^(flughafen|airport|havalimani)$/.test(n(t.to))&&t.from)return'to';for(const k of (['price','fixed_price'].includes(s.intent)?['from','to']:['from','to','date','time','people']))if(t[k]===undefined||t[k]==='')return k;if(!['price','fixed_price'].includes(s.intent)&&(s.intent==='airport'||/flughafen|airport|havalimani/.test(n((t.from||'')+' '+(t.to||''))))){if(!t.flight)return'flight';if(t.bags===undefined)return'bags';}if(t.returnRequested&&!['price','fixed_price'].includes(s.intent)){if(!t.returnDate)return'returnDate';if(!t.returnTime)return'returnTime';}return null;}
  function prompt(key,l){const qs={from:['Wo genau möchtest du abgeholt werden? Bitte Ort und möglichst Straße mit Hausnummer.','Where exactly is pickup? Please include the town and, if possible, street and number.','Tam olarak nereden alınacaksın? Şehir ve mümkünse sokak ile kapı numarasını belirt.'],to:['Wohin genau möchtest du fahren? Welcher Flughafen, falls es zum Flughafen geht?','What is your exact destination? Which airport, if applicable?','Tam olarak nereye gitmek istiyorsun? Havalimanıysa hangisi?'],date:['An welchem Datum möchtest du fahren? Zum Beispiel morgen oder 2026-11-10.','On which date? For example tomorrow or 2026-11-10.','Hangi tarihte? Örneğin yarın veya 2026-11-10.'],time:['Um wie viel Uhr möchtest du abgeholt werden? Bitte 24-Stunden-Zeit angeben.','What pickup time? Please use 24-hour time.','Saat kaçta alınmak istiyorsun? Lütfen 24 saat biçimini kullan.'],people:['Wie viele Personen fahren mit?','How many passengers are travelling?','Kaç kişi seyahat edecek?'],flight:['Wie lautet die Flugnummer? Wenn sie fehlt oder nicht nötig ist, schreib „ohne“.','What is the flight number? If unavailable or not needed, write “none”.','Uçuş numarası nedir? Yoksa veya gerekmiyorsa “yok” yaz.'],bags:['Wie viele Gepäckstücke habt ihr? Große Koffer oder Handgepäck bitte dazusagen.','How many bags do you have? Please mention large suitcases or cabin luggage.','Kaç bagaj var? Büyük valiz veya el bagajı olduğunu da belirt.']};if(key==='returnDate')return text('An welchem Datum soll die Rückfahrt stattfinden?','On which date is the return trip?','Dönüş hangi tarihte?',l);if(key==='returnTime')return text('Um wie viel Uhr soll die Rückfahrt stattfinden?','What time is the return trip?','Dönüş saat kaçta?',l);return qs[key][languages.indexOf(l)];}
  function create(now=()=>new Date()){
    const s={language:'de',trip:{},intent:'information',active:false,expected:null,pending:null,unknown:0,revision:0,supportQuestion:'',formal:false,metrics:{messages:0,unknown:0,prepared:0,escalations:0}};
    function response(body,actions=[],extra={}){if(s.formal&&s.language==='de')body=body.replace(/\bdu\b/g,'Sie').replace(/\bdir\b/g,'Ihnen').replace(/\bdich\b/g,'Sie').replace(/\bdeine\b/g,'Ihre').replace(/\bdeinen\b/g,'Ihren').replace(/\bdeiner\b/g,'Ihrer').replace(/\bdein\b/g,'Ihr').replace(/\bmöchtest Sie\b/g,'möchten Sie').replace(/\bkannst Sie\b/g,'können Sie').replace(/\bSchreib\b/g,'Schreiben Sie').replace(/\bNenne\b/g,'Nennen Sie').replace(/\bbenötigst Sie\b/g,'benötigen Sie').replace(/\bmöchtest Sie\b/g,'möchten Sie').replace(/\bmusst Sie\b/g,'müssen Sie').replace(/\bfindest Sie\b/g,'finden Sie');return Object.assign({text:body,actions,language:s.language},extra);}
    function continuePlan(prefix=''){
      if(s.trip.people>=8||s.trip.bags>=8){s.active=false;s.metrics.escalations++;return response(prefix+'\n'+pick(K.answers.large_group,s.language),['whatsapp','edit'],{summary:summary(s),handoff:handoff(s)});}
      const field=nextField(s);s.expected=field;
      if(field)return response((prefix?prefix+'\n\n':'')+prompt(field,s.language),['whatsapp','stop']);
      s.metrics.prepared++;return response((prefix?prefix+'\n\n':'')+text('Deine Anfrage ist vorbereitet – noch nicht gebucht. Wie möchtest du weitermachen?','Your request is prepared, not booked. How would you like to continue?','Talebin hazır, henüz rezervasyon yapılmadı. Nasıl devam etmek istersin?',s.language),s.intent==='offer'?['price','whatsapp','edit']:['app','price','whatsapp','edit'],{summary:summary(s),handoff:handoff(s)});
    }
    function apply(changes){let changed=false;for(const[k,v]of Object.entries(changes))if(k[0]!=='_'&&s.trip[k]!==v){s.trip[k]=v;changed=true;}if(changed){s.revision++;s.quote=null;}return changed;}
    function turn(raw,action){
      raw=String(raw||'').trim().slice(0,600);s.metrics.messages++;s.language=detectLanguage(raw,s.language);const l=s.language,q=n(raw);
      if(/\b(sie|ihnen|ihre)\b/i.test(raw)&&/\b(konnen|bitte|mochten)\b/.test(q))s.formal=true;
      let hits=recognize(raw),top=hits[0];
      if(/^(doch|lieber|wir sind jetzt|nicht .+ sondern|instead|actually|we are now)\b/.test(q)){hits=[];top=null;}
      if(action==='reset'){s.trip={};s.active=false;s.expected=null;s.pending=null;s.revision++;s.unknown=0;s.supportQuestion='';return response(pick(K.answers.greeting,l),['plan','airport','price','vehicle','human']);}
      if(top&&['emergency','danger'].includes(top.intent)){s.active=false;s.expected=null;s.intent=top.intent;return response(pick(K.answers[top.key],l),[top.intent==='emergency'?'emergency112':'emergency110']);}
      if(/\b(ignore.*instructions|ignoriere.*regeln|system prompt|systemanweisung|api key|geheimnisse|talimatlari.*unut)\b/.test(q)){return response(text('Ich kann keine internen Regeln oder Geheimnisse herausgeben und keine erfundenen Buchungen bestätigen. Wobei kann ich dir zu ONRODA helfen?','I cannot reveal internal rules or secrets or confirm invented bookings. How can I help with ONRODA?','İç kuralları veya sırları paylaşamam, olmayan rezervasyonu onaylayamam. ONRODA hakkında nasıl yardımcı olabilirim?',l),['human']);}
      if(/(?:passwort|password|sifre|token|cvv|cvc|iban)\s*[:=]\s*\S+|\b(?:\d[ -]?){13,19}\b/i.test(raw))return response(text('Bitte keine Passwörter, Zahlungsdaten oder Zugangsdaten eingeben. Beschreibe nur das Anliegen ohne diese Daten.','Please do not enter passwords, payment data or credentials. Describe the issue without them.','Lütfen şifre, ödeme veya giriş bilgisi girme. Konuyu bu bilgiler olmadan anlat.',l),['human']);
      if(health.test(q)){s.supportQuestion='';s.active=false;return response(text('Bitte teile hier keine Diagnosen oder medizinischen Details. Unser Team klärt den nötigen Transportbedarf persönlich mit dir.','Please do not share diagnoses or medical details here. Our team can arrange the necessary transport requirements personally.','Lütfen burada teşhis veya tıbbi ayrıntı paylaşma. Ekibimiz gerekli ulaşım ihtiyacını kişisel olarak görüşebilir.',l),['whatsapp','app']);}
      if(action==='confirm'&&s.pending){apply(s.pending);s.pending=null;return s.active?continuePlan():response(text('Angaben aktualisiert.','Details updated.','Bilgiler güncellendi.',l),['edit','whatsapp'],{summary:summary(s),handoff:handoff(s)});}
      if(action==='keep'){s.pending=null;return s.active?continuePlan():response(text('Die bisherigen Angaben bleiben erhalten.','The previous details are kept.','Önceki bilgiler korundu.',l),['edit']);}
      if(action==='stop'||/^(abbrechen|stop|stopp|planung beenden|stop planning|vazgec)$/.test(q)){s.active=false;s.expected=null;return response(text('Planung beendet. Es wurde keine Buchung und keine Nachricht versendet.','Planning stopped. No booking or message was sent.','Planlama durduruldu. Rezervasyon veya mesaj gönderilmedi.',l),['plan','app','human']);}
      if(action==='human'||(top&&escalated.has(top.intent))){s.intent=action==='human'?'human':top.intent;s.supportQuestion=safeSupport(raw);s.active=false;s.expected=null;s.metrics.escalations++;const changes=extract(raw,s,now());apply(changes);return response(pick(K.answers[action==='human'?'human':top.key],l),['whatsapp','app','continue'],{summary:summary(s),handoff:handoff(s)});}
      if(action==='edit'){s.expected=null;return response(text('Welche Angabe möchtest du ändern? Zum Beispiel „Abholung: Esslingen Bahnhofstraße 4“ oder „doch lieber um 06:00“.','What would you like to change? For example “pickup: Esslingen Bahnhofstraße 4” or “instead at 06:00”.','Hangi bilgiyi değiştirmek istersin? Örneğin “kalkış: Esslingen Bahnhofstraße 4” veya “saat 06:00 olsun”.',l),['whatsapp','reset'],{summary:summary(s)});}
      if(['plan','airport','price','offer','continue'].includes(action)){s.active=true;s.intent=action==='plan'?'booking':action==='continue'?s.intent:action;return continuePlan();}
      if(action==='vehicle')return response(pick(K.answers.vehicle,l),['plan','whatsapp'],{vehicle:true});
      if(/^(danke|vielen dank|thanks|thank you|tesekkurler|tesekkur ederim)$/.test(q))return response(text('Sehr gerne! Wenn du noch eine Frage hast, schreib einfach.','You’re welcome! Feel free to ask another question.','Rica ederim! Başka sorun olursa yazabilirsin.',l),[]);
      if(/^(hallo|hi|hey|guten morgen|guten tag|guten abend|hello|good morning|merhaba|selam|gunaydin)$/.test(q))return response(pick(K.answers.greeting,l),['plan','airport','price','vehicle','human']);
      if(/\b(welche angaben|was weisst|was habe ich|what do you know|my details|bilgilerim|ne biliyorsun)\b/.test(q))return response(text('Das habe ich bisher notiert:','Here is what I have noted:','Şu ana kadar not ettiklerim:',l),['edit','continue'],{summary:summary(s)});
      const fieldQuestions=[['from',/^(wo.*(?:abgeholt|start)|was.*abholadresse|what.*pickup|where.*pickup|nereden)/],['to',/^(wohin|was.*ziel|what.*destination|nereye)/],['date',/^(welches datum|wann.*fahrt|what date|hangi tarih)/],['time',/^(welche uhrzeit|wann.*abholung|what.*pickup time|saat kac)/],['people',/^(wie viele.*personen|how many.*passengers|kac kisi)/]];
      for(const[field,re]of fieldQuestions)if(re.test(q)&&s.trip[field]!==undefined)return response(label(field,l)+': '+value(field,s.trip[field],l),['edit','continue'],{summary:summary(s)});
      const changes=top&&['offtopic','smalltalk','information','app','ios','android'].includes(top.intent)?{}:extract(raw,s,now());
      // Explicit labels are accepted without trying to geocode or guess coordinates.
      for(const[field,re]of [['from',/^(?:abholung|start|pickup|from|kalkis)\s*:\s*(.+)$/i],['to',/^(?:ziel|destination|to|varis)\s*:\s*(.+)$/i]]){const m=raw.match(re);if(m)changes[field]=safe(m[1]).slice(0,180);}
      if(changes._invalid)return response(text('Diese Angabe ist nicht gültig. Bitte prüfe Datum, Uhrzeit oder Anzahl.','That detail is invalid. Please check the date, time or count.','Bu bilgi geçersiz. Tarih, saat veya sayıyı kontrol et.',l),['edit']);
      const meaningful=Object.keys(changes).length>0;
      const correction=/\b(doch|lieber|statt|sondern|korrig|andern|jetzt|instead|change|actually|now|degistir|artik)\b/.test(q)||/^(abholung|ziel|pickup|destination|kalkis|varis)\s*:/.test(q);
      const conflicts=Object.keys(changes).filter(k=>s.trip[k]!==undefined&&s.trip[k]!==changes[k]&&!(['from','to'].includes(k)&&/^(flughafen|airport|havalimani)$/.test(n(s.trip[k]))));
      if(conflicts.length&&!correction){s.pending=changes;return response(text('Ich habe abweichende Angaben erkannt. Soll ich diese Werte ersetzen?','I found different details. Should I replace these values?','Farklı bilgiler gördüm. Bu değerleri değiştireyim mi?',l)+'\n'+conflicts.map(k=>label(k,l)+': '+value(k,s.trip[k],l)+' → '+value(k,changes[k],l)).join('\n'),['confirm','keep']);}
      apply(changes);if(meaningful)s.unknown=0;
      // Large capacity never implies a confirmed vehicle or instant booking.
      if(s.trip.people>=8||s.trip.bags>=8){s.active=false;s.intent=s.trip.bags>=8?'large_luggage':'large_group';return response(pick(K.answers[s.intent],l),['whatsapp','edit'],{summary:summary(s),handoff:handoff(s)});}
      if((top&&top.intent==='group')||((!top||top.intent==='luggage')&&s.trip.people>=5&&s.trip.people<=7)){
        s.unknown=0;if(!s.active)s.intent='group';
        let body=pick(K.answers.group,l);
        if(s.trip.people!==undefined)body=text('Für '+s.trip.people+' Fahrgäste kannst du unser Großraumtaxi bis sieben Fahrgäste anfragen. ','For '+s.trip.people+' passengers you can request our large taxi for up to seven passengers. ',s.trip.people+' yolcu için yedi yolcuya kadar büyük taksimizi talep edebilirsin. ',l)+(s.trip.bags===undefined?text('Wie viel Gepäck habt ihr dabei?','How much luggage do you have?','Ne kadar bagajınız var?',l):text(s.trip.bags+' Gepäckstücke habe ich notiert. Den Platzbedarf bei voller Besetzung stimmt unser Team mit dir ab.',s.trip.bags+' bags noted. Our team will confirm luggage space with full occupancy.',s.trip.bags+' bagaj not edildi. Tam dolulukta bagaj alanını ekibimiz teyit eder.',l));
        if(s.active)return continuePlan(body);
        return response(body,['continue','whatsapp'],{summary:summary(s),handoff:handoff(s)});
      }
      if(top&&['price','fixed_price'].includes(top.intent)&&s.active&&s.trip.from&&s.trip.to)return response(pick(K.answers.price,l),['price','continue','whatsapp'],{summary:summary(s)});
      if(top&&planning.has(top.intent)){s.active=true;s.intent=top.intent;s.unknown=0;return continuePlan(s.expected?'':pick(K.answers[top.key],l));}
      if(top&&['payment','wallet','invoice','receipt','tip','prepayment','vehicle','flight','luggage','child','stroller','bicycle','bulky','pet','senior','medical','meeting','stops','business','hotel','partner','app','ios','android','status','cancel','information','offtopic','smalltalk','service_quality','non_smoking','driver_language'].includes(top.intent)){
        s.unknown=0;let body=hits.map(h=>pick(K.answers[h.key],l)).join('\n\n');
        if(top.intent==='luggage'&&s.trip.bags!==undefined)body=text('Notiert: ','Noted: ','Not edildi: ',l)+s.trip.bags+' '+label('bags',l)+(s.trip.people!==undefined?', '+s.trip.people+' '+label('people',l):'')+'. '+(!s.trip.people?prompt('people',l):text('Unser Team prüft damit die passende Fahrzeuggröße.','Our team can check the suitable vehicle size.','Ekibimiz uygun araç boyutunu kontrol edebilir.',l));
        const acts=['app','ios','android'].includes(top.intent)?['app','whatsapp']:['status','cancel'].includes(top.intent)?['app','whatsapp']:['business','hotel','partner'].includes(top.intent)?['partner','whatsapp']:['bicycle','pet','bulky','child','medical','stroller','invoice'].includes(top.intent)?['whatsapp','continue']:['plan','human'];
        if(s.active)return continuePlan(body);
        return response(body,acts,{vehicle:top.intent==='vehicle',summary:meaningful?summary(s):undefined,handoff:acts.includes('whatsapp')?handoff(s):undefined});
      }
      if(s.active&&meaningful)return continuePlan();
      if(meaningful&&(changes.from||changes.to||changes.date)){s.active=true;s.intent=changes.to&&/flughafen|airport|havalimani/.test(n(changes.to))?'airport':'booking';return continuePlan();}
      if(meaningful)return response(text('Die Angaben habe ich notiert. Möchtest du die Fahrt weiter vorbereiten?','I have noted those details. Would you like to continue preparing the ride?','Bilgileri not ettim. Yolculuğu hazırlamaya devam edelim mi?',l),['continue','whatsapp'],{summary:summary(s),handoff:handoff(s)});
      if(/\b(englisch|english|turkce|turkish|deutsch|german|almanca)\b/.test(q))return response(text('Gerne, wir können auf Deutsch weiterschreiben.','Of course, we can continue in English.','Elbette, Türkçe devam edebiliriz.',l),[]);
      s.unknown++;s.metrics.unknown++;s.supportQuestion=safeSupport(raw);
      if(s.unknown===1)return response(pick(K.answers.unknown,l),['plan','price','human']);
      if(s.unknown===2)return response(text('Wähle bitte: Fahrt vorbereiten, Preis prüfen oder persönliche Hilfe.','Please choose: prepare a ride, check a price or personal help.','Lütfen seç: yolculuk hazırla, fiyat kontrolü veya kişisel yardım.',l),['plan','price','human']);
      s.active=false;s.intent='unknown';return response(text('Ich möchte dir keine falsche Auskunft geben. Unser Team hilft dir persönlich weiter.','I do not want to give incorrect advice. Our team can help personally.','Yanlış bilgi vermek istemem. Ekibimiz kişisel olarak yardımcı olabilir.',l),['whatsapp','reset'],{handoff:handoff(s)});
    }
    return{state:s,turn,summary:()=>summary(s),handoff:()=>handoff(s),greeting:()=>pick(K.answers.greeting,s.language)};
  }
  return{create,recognize,extract,normalize:n,detectLanguage,berlinDate,safe,safeSupport,labels,label,value};
});
