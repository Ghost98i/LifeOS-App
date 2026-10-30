import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
assert.equal(JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId,'demo-lifeos');
for(const script of ['scripts/run-all-emulator-tests.mjs','scripts/verify-study-offline.mjs']){
 const result=spawnSync(process.execPath,[script],{stdio:'inherit',env:process.env});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
