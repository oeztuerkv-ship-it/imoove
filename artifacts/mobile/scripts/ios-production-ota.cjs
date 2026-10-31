#!/usr/bin/env node
/** --check/--prepare never publish. Run --publish only after Vedat's explicit OTA release approval. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const mobile = path.resolve(__dirname, '..');
const root = path.resolve(mobile, '../..');
const runtime = 'onroda-google-nav-prod-1';
const mode = process.argv.find(x => ['--check','--prepare','--publish'].includes(x)) || '--check';
function run(bin, args, options = {}) {
  const r = spawnSync(bin, args, { cwd: mobile, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (r.status !== 0) throw Error(`${bin} failed; see the private operation log (exit ${r.status})`);
  return r.stdout;
}
function quote(value) { return "'" + value.replace(/'/g, "'\\''") + "'"; }
// Use the same EAS environment as the store binary; profile env is merged below.
if (mode !== '--check' && !process.argv.includes('--environment-loaded')) {
  const command = [quote(process.execPath), quote(__filename), mode, '--environment-loaded'].join(' ');
  const r = spawnSync('eas', ['env:exec','production',command,'--non-interactive'], { cwd: mobile, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
try {
  const eas = JSON.parse(fs.readFileSync(path.join(mobile,'eas.json'),'utf8'));
  const profile = eas.build.production;
  if (profile.channel !== 'production' || profile.environment !== 'production' || profile.distribution !== 'store') throw Error('Production profile mismatch');
  const env = { ...process.env, ...profile.env, ...profile.ios?.env };
  delete env.EAS_BUILD; // Local OTA config evaluation is not a native build worker.
  const app = JSON.parse(run('npx',['expo','config','--type','public','--json'],{env}));
  if (app.ios.bundleIdentifier !== 'com.vedat.mobile' || app.runtimeVersion !== runtime || app.extra.googleNavigationEnabled !== true) throw Error('Refusing wrong app/runtime/native capability');
  if (new URL(env.EXPO_PUBLIC_API_URL).hostname !== 'api.onroda.de') throw Error('Refusing wrong backend host');
  const source = run('git',['rev-parse','HEAD'],{cwd:root}).trim();
  console.log(JSON.stringify({operation:mode,version:app.version,build:app.ios.buildNumber,bundleId:app.ios.bundleIdentifier,runtime,channel:'production',source}));
  if (mode === '--check') process.exit(0);
  if (run('git',['branch','--show-current'],{cwd:root}).trim() !== 'main') throw Error('Production OTA must use main');
  if (run('git',['status','--porcelain','--','artifacts/mobile','pnpm-lock.yaml'],{cwd:root}).trim()) throw Error('Commit relevant mobile changes first');
  const remote = run('git',['ls-remote','origin','refs/heads/main'],{cwd:root}).split(/\s/)[0];
  if (source !== remote) throw Error('Push reviewed main before preparing OTA');
  const out = fs.mkdtempSync(path.join(os.tmpdir(),'onroda-ios-production-ota-'));
  fs.chmodSync(out,0o700);
  const log = fs.openSync(path.join(out,'operation.log'),'w',0o600);
  run('npx',['expo','export','--platform','ios','--output-dir',path.join(out,'export')],{env,stdio:['ignore',log,log]});
  const meta = JSON.parse(fs.readFileSync(path.join(out,'export','metadata.json'),'utf8'));
  const bundle = fs.readFileSync(path.join(out,'export',meta.fileMetadata.ios.bundle));
  const hash = crypto.createHash('sha256').update(bundle).digest('base64url');
  const plan = { source,runtime,channel:'production',platform:'ios',bundleHash:hash,published:false };
  if (mode === '--publish') {
    const outputPath = path.join(out,'update-private.json');
    const fd = fs.openSync(outputPath,'w',0o600);
    run('eas',['update','--channel','production','--platform','ios','--skip-bundler','--input-dir',path.join(out,'export'),'--environment','production','--message','ONRODA iOS production update','--json','--non-interactive'],{env,stdio:['ignore',fd,log]});
    fs.closeSync(fd);
    const updates = JSON.parse(fs.readFileSync(outputPath,'utf8'));
    if (updates.length !== 1 || updates[0].platform !== 'ios' || updates[0].runtimeVersion !== runtime) throw Error('Unexpected published update metadata');
    plan.published = true; plan.updateId = updates[0].id; plan.group = updates[0].group;
  }
  fs.closeSync(log);
  fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify(plan,null,2),{mode:0o600});
  console.log(JSON.stringify({...plan,planFile:path.join(out,'plan.json')}));
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
