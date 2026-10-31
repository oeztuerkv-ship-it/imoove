const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'../../..'),ts=require(root+'/node_modules/typescript');
const events={},calls=[];let permission='granted',routeDeferred=null,platform='ios';
const controller={
 areTermsAccepted:async()=>true,init:async()=>{calls.push('init');return 'OK'},
 startUpdatingLocation:()=>calls.push('locations'),setBackgroundLocationUpdatesEnabled:v=>calls.push('background:'+v),setAudioGuidanceType:v=>calls.push('audio:'+v),
 stopGuidance:async()=>{calls.push('stop')},setDestination:async w=>{calls.push('destination:'+w.position.lat);if(routeDeferred)await routeDeferred;return 'OK'},
 startGuidance:async()=>{calls.push('start')},cleanup:async()=>calls.push('cleanup'),
 getRouteSegments:async()=>[{segmentLatLngList:[{lat:48,lng:9},{lat:49,lng:10}]}],
 getCurrentTimeAndDistance:async()=>({meters:1500,seconds:300})
};
const api={navigationController:controller};for(const event of ['LocationChanged','RemainingTimeOrDistanceChanged','RouteChanged','ReroutingRequestedByOffRoute'])api['setOn'+event]=callback=>events[event]=callback;
let hooks=[],cursor=0,effects=[];
const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
const React={createElement:(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}}),
 useRef:value=>{let i=cursor++;return hooks[i]??(hooks[i]={current:value})},
 useCallback:(value,deps)=>{let i=cursor++;if(!hooks[i]||!equal(hooks[i].deps,deps))hooks[i]={value,deps};return hooks[i].value},
 useEffect:(fn,deps)=>{let i=cursor++;if(!hooks[i]||!equal(hooks[i].deps,deps)){const prev=hooks[i];hooks[i]={deps};effects.push(()=>{prev?.cleanup?.();hooks[i].cleanup=fn()})}}
};
const SDK={NavigationProvider:'Provider',NavigationView:'NativeView',useNavigation:()=>api,NavigationSessionStatus:{OK:'OK'},RouteStatus:{OK:'OK'},CameraPerspective:{TILTED:0},AudioGuidance:{SILENT:0,VOICE_ALERTS_AND_GUIDANCE:4,BLUETOOTH_AUDIO:8}};
function load(file){let m={exports:{}};const src=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const req=r=>r==='react'?React:r==='react-native'?{StyleSheet:{absoluteFillObject:{}},View:'View',Platform:{get OS(){return platform}},PixelRatio:{getPixelSizeForLayoutSize:v=>Math.round(v*3)}}:r==='@googlemaps/react-native-navigation-sdk'?SDK:r==='@/utils/safeExpoLocation'?{requestForegroundPermissionsSafe:async()=>({status:permission}),getBackgroundPermissionsSafe:async()=>({status:'granted'})}:r==='@/utils/googleNavSession'?load(root+'/artifacts/mobile/utils/googleNavSession.ts'):require(r);
 vm.runInThisContext('(function(require,module,exports){'+src+'\n})',{filename:file})(req,m,m.exports);return m.exports;}
// Failed arrival PATCH leaves local hasArrived=true; native guidance must continue.
const navSource=fs.readFileSync(root+'/artifacts/mobile/app/driver/navigation.tsx','utf8');
const activeExpression=navSource.match(/active=\{(!isPickupPhase \|\| !\(isPrivateMemo[\s\S]+?)\}\n\s+soundEnabled/)[1];
const guidanceActive=(overrides={})=>vm.runInNewContext(activeExpression,{isPickupPhase:true,isPrivateMemo:false,hasArrived:true,activeRide:{status:'accepted'},rideFleetStatus:'accepted',...overrides});
assert(guidanceActive(),'failed server arrival must not pause Google');
assert.equal(guidanceActive({rideFleetStatus:'driver_waiting'}),false);
assert.equal(guidanceActive({activeRide:{status:'driver_waiting'}}),false);
assert(guidanceActive({isPickupPhase:false,rideFleetStatus:'driver_waiting'}),'destination guidance resumes');
assert.equal(guidanceActive({isPrivateMemo:true}),false,'private memo has no server arrival');
assert(guidanceActive({isPrivateMemo:true,hasArrived:false}));
const component=load(root+'/artifacts/mobile/components/driver/GoogleNavDriveView.tsx').GoogleNavDriveView;
let inner,lastElement;const render=props=>{const provider=component(props);assert.equal(provider.type,'Provider');inner=provider.props.children.props.children.type;cursor=0;effects=[];lastElement=inner(props);for(const f of effects)f();return provider;};
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate)};
(async()=>{
 const fixes=[],routes=[],errors=[];
 let props={routeIdentity:'ride:pickup',destination:{lat:48,lon:9},onFix:f=>fixes.push(f),onRouteChanged:p=>routes.push(p),onSessionError:e=>errors.push(e)};
 const first=render(props);lastElement.props.onNavigationViewControllerCreated({setFollowingPerspective:async p=>calls.push('perspective:'+p)});lastElement.props.onMapReady();await settle();
 assert.equal(calls.filter(x=>x==='init').length,1);assert.equal(calls.filter(x=>x==='start').length,1);assert(calls.includes('perspective:0'));assert.equal(routes.length,1);
 const second=render({...props,bottomInset:300});await settle();assert.equal(lastElement.props.mapPadding.bottom,300);platform='android';render({...props,bottomInset:300});assert.equal(lastElement.props.mapPadding.bottom,900,'Android requires physical pixels above the ride sheet');platform='ios';assert.equal(first.props.termsAndConditionsDialogOptions,second.props.termsAndConditionsDialogOptions,'provider options must keep native controller stable');assert.equal(calls.filter(x=>x==='init').length,1,'GPS rerender must not reinitialize');
 events.LocationChanged({lat:48, lng:9,speed:10,time:Date.now(),accuracy:5});assert.equal(fixes.length,1);events.LocationChanged({lat:48,lng:9,speed:10,time:Date.now()-60000});assert.equal(fixes.length,1);
 render({...props,soundEnabled:false});await settle();assert(calls.includes('audio:0'));
 let release;routeDeferred=new Promise(r=>release=r);render({...props,routeIdentity:'ride:dest-old',destination:{lat:49,lon:10}});await settle();const before=calls.filter(x=>x==='start').length;
 props={...props,routeIdentity:'ride:dest-new',destination:{lat:50,lon:11}};render(props);release();routeDeferred=null;await settle();assert.equal(calls.filter(x=>x==='start').length,before+1,'superseded route cannot start');assert.equal(calls.filter(x=>x.startsWith('destination:')).at(-1),'destination:50');
 render({...props,active:false});await settle();const paused=calls.filter(x=>x==='start').length;assert.equal(paused,before+1);
 for(const h of hooks)h?.cleanup?.();await settle();assert.equal(calls.filter(x=>x==='cleanup').length,1);assert.deepEqual(errors,[]);
 console.log('GoogleNavDriveView lifecycle: PASS (init once, tilted camera, native mute, fresh fixes, route sharing, latest destination, pause, cleanup)');
})().catch(e=>{console.error(e);process.exitCode=1});
