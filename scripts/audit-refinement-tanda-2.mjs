import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import assert from 'node:assert/strict';
const dir='artifacts/refinamiento-tanda-2';
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
const original=JSON.parse((await fs.readFile(`${dir}/initial-src-hashes.json`,'utf8')).replace(/^\uFEFF/,''));
const allowed=new Set(['ConfigView.tsx','PrivacySecuritySection.tsx','FinanzasView.tsx','FinanceHero.tsx','FinanceAnalyticsView.tsx','FinanceFutureView.tsx','FinanceAccountsView.tsx','FinanceReconcileModal.tsx','index.css','presentationAudit.test.ts','financeAgreements13.test.ts']);
const changed=[];
for(const file of original) {
 if(hash(await fs.readFile(file.Path))!==file.Hash) {
  changed.push(path.relative(process.cwd(),file.Path));
  assert.ok(allowed.has(path.basename(file.Path)),`Unexpected source edit: ${file.Path}`);
 }
}
const contracts=JSON.parse((await fs.readFile(`${dir}/initial-contract-hashes.json`,'utf8')).replace(/^\uFEFF/,''));
for(const file of contracts) assert.equal(hash(await fs.readFile(file.Path)),file.Hash,`Contract modified: ${file.Path}`);
const printer=ts.createPrinter({removeComments:true});
function callbacks(sourceText) {
 const source=ts.createSourceFile('module.tsx',sourceText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const found={};
 function walk(node) {
  if(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^(handle|saveEdit)/.test(node.name.text) && node.initializer && (ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer))) {
   found[node.name.text]=printer.printNode(ts.EmitHint.Unspecified,node.initializer,source);
  }
  ts.forEachChild(node,walk);
 }
 walk(source);return found;
}
const handlerChecks=[];
for(const name of ['ConfigView.tsx','PrivacySecuritySection.tsx','FinanzasView.tsx','FinanceAnalyticsView.tsx','FinanceReconcileModal.tsx']) {
 const before=callbacks(await fs.readFile(`${dir}/before-source/${name}`,'utf8'));
 const after=callbacks(await fs.readFile(`src/components/${name}`,'utf8'));
 assert.deepEqual(after,before,`${name} operational callback changed`);
 handlerChecks.push({file:name,unchangedCallbacks:Object.keys(before).length});
}
await fs.writeFile(`${dir}/preservation-audit.json`,JSON.stringify({changed,contractsUnchanged:true,domainAndPreviousModulesUnchanged:true,handlerChecks},null,2));
console.log(`Preservation audit passed: ${handlerChecks.reduce((n,x)=>n+x.unchangedCallbacks,0)} operational callbacks unchanged; domain, contracts and previous modules unchanged.`);
