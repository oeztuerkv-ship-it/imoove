const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(require('node:path').resolve(__dirname,'../app.config.js'),'utf8');
function config(env){const module={exports:{}};vm.runInNewContext(src,{module,require:()=>x=>x,process:{env}});return module.exports({config:{version:'1.0.3',runtimeVersion:{policy:'appVersion'},ios:{buildNumber:'46'},android:{versionCode:6},extra:{}}});}
const old=config({});assert.equal(old.version,'1.0.3');assert.equal(old.extra.googleNavigationEnabled,false);
const nav=config({EXPO_PUBLIC_ENABLE_GOOGLE_NAV:'1'});assert.equal(nav.version,'1.0.4');assert.equal(nav.runtimeVersion,'onroda-google-nav-1');assert.equal(nav.extra.googleNavigationEnabled,true);assert.equal(nav.ios.buildNumber,'47');assert.equal(nav.android.versionCode,7);
assert.throws(()=>config({EXPO_PUBLIC_ENABLE_GOOGLE_NAV:'1',EAS_BUILD:'true'}),/GOOGLE_NAV_IOS_API_KEY/);
const builder=config({EXPO_PUBLIC_ENABLE_GOOGLE_NAV:'1',EAS_BUILD:'true',GOOGLE_NAV_IOS_API_KEY:'test-ios-key',GOOGLE_NAV_ANDROID_API_KEY:'test-android-key'});assert.equal(builder.android.config.googleMaps.apiKey,'test-android-key');assert(!('googleMapsApiKey' in builder.ios.config));assert(!JSON.stringify(builder.extra).includes('test-ios-key'));
console.log('Build config: PASS (original runtime preserved, separate native runtime/build numbers, builder keys required, no keys in extra)');

const prodEnv={EXPO_PUBLIC_ENABLE_GOOGLE_NAV:'1',ONRODA_GOOGLE_NAV_RELEASE:'production'};
const prod=config(prodEnv);
assert.equal(prod.version,'1.0.4');assert.equal(prod.ios.buildNumber,'48');
assert.equal(prod.runtimeVersion,'onroda-google-nav-prod-1');assert.equal(prod.extra.googleNavigationRelease,'production');
assert.notEqual(prod.runtimeVersion,nav.runtimeVersion,'test OTA must not match store binary');
const iosWorker=config({...prodEnv,EAS_BUILD:'true',EAS_BUILD_PLATFORM:'ios',GOOGLE_NAV_IOS_API_KEY:'test-ios-key'});
assert.equal(iosWorker.runtimeVersion,'onroda-google-nav-prod-1');
assert.throws(()=>config({...prodEnv,EAS_BUILD:'true',EAS_BUILD_PLATFORM:'ios',GOOGLE_NAV_ANDROID_API_KEY:'test-android-key'}),/GOOGLE_NAV_IOS_API_KEY/);
const eas=JSON.parse(fs.readFileSync(require('node:path').resolve(__dirname,'../eas.json'),'utf8'));
assert.equal(eas.build.production.distribution,'store');assert.equal(eas.build.production.channel,'production');
assert.equal(eas.build.production.environment,'production');assert.equal(eas.build.production.developmentClient,false);
assert.equal(eas.build.production.ios.env.EXPO_PUBLIC_ENABLE_GOOGLE_NAV,'1');
assert.equal(eas.submit.production.ios.ascAppId,'6773487513');
console.log('Store production config: PASS (existing app, store signing profile, production channel/environment, isolated runtime, build 48, iOS-only key requirement)');
