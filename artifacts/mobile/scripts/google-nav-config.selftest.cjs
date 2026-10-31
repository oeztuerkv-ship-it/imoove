const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(require('node:path').resolve(__dirname,'../app.config.js'),'utf8');
function config(env){const module={exports:{}};vm.runInNewContext(src,{module,require:()=>x=>x,process:{env}});return module.exports({config:{version:'1.0.3',runtimeVersion:{policy:'appVersion'},ios:{buildNumber:'46'},android:{versionCode:6},extra:{}}});}
const old=config({});assert.equal(old.version,'1.0.3');assert.equal(old.extra.googleNavigationEnabled,false);
const nav=config({EXPO_PUBLIC_ENABLE_GOOGLE_NAV:'1'});assert.equal(nav.version,'1.0.4');assert.equal(nav.runtimeVersion,'onroda-google-nav-1');assert.equal(nav.extra.googleNavigationEnabled,true);assert.equal(nav.ios.buildNumber,'47');assert.equal(nav.android.versionCode,7);
assert.throws(()=>config({EXPO_PUBLIC_ENABLE_GOOGLE_NAV:'1',EAS_BUILD:'true'}),/GOOGLE_NAV_IOS_API_KEY/);
const builder=config({EXPO_PUBLIC_ENABLE_GOOGLE_NAV:'1',EAS_BUILD:'true',GOOGLE_NAV_IOS_API_KEY:'test-ios-key',GOOGLE_NAV_ANDROID_API_KEY:'test-android-key'});assert.equal(builder.android.config.googleMaps.apiKey,'test-android-key');assert(!('googleMapsApiKey' in builder.ios.config));assert(!JSON.stringify(builder.extra).includes('test-ios-key'));
console.log('Build config: PASS (original runtime preserved, separate native runtime/build numbers, builder keys required, no keys in extra)');
