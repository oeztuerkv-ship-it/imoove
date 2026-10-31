const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.resolve(__dirname, '../plugins/withGoogleNavigationSdk.js'), 'utf8');
const moduleStub = { exports: {} };
vm.runInNewContext(source, { module: moduleStub, require: () => ({
  withInfoPlist: (config) => config,
  withGradleProperties: (config) => config,
  withAppBuildGradle: (config, transform) => ({ gradle: transform({ modResults: { contents: config.gradle } }).modResults.contents }),
}) });
const apply = moduleStub.exports;
for (const gradle of ['android {\n}\ndependencies {\n}\n', 'android {\n compileOptions {\n }\n}\ndependencies {\n}\n']) {
  const once = apply({ gradle }).gradle;
  assert(once.includes('coreLibraryDesugaringEnabled true'));
  assert(once.includes("coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs_nio:2.0.4'"));
  assert(once.includes("exclude group: 'com.google.android.gms', module: 'play-services-maps'"));
  assert.equal(apply({ gradle: once }).gradle, once, 'prebuild is idempotent');
  assert.equal((once.match(/configurations\.configureEach/g) || []).length, 1);
}
console.log('Google Navigation Gradle plugin: PASS (Maps duplicate excluded, desugaring, modern/legacy templates, idempotent)');
