import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
const dir='artifacts/refinamiento-tanda-3';
const normaliseLines=text=>text.replaceAll('\r\n','\n');
const original=JSON.parse((await fs.readFile(`${dir}/initial-hashes.json`,'utf8')).replace(/^\uFEFF/,''));
const allowed=new Set(['src/components/EstudiosView.tsx','src/components/FocusTimer.tsx','src/components/NotasView.tsx','src/components/ProjectsManager.tsx','src/components/IAView.tsx','src/lib/audio.ts','src/index.css']);
const changed=[];
for(const item of original){
 const hash=crypto.createHash('sha256').update(await fs.readFile(item.Path)).digest('hex').toUpperCase();
 if(hash!==item.Hash){const file=path.relative(process.cwd(),item.Path).replaceAll('\\','/');assert.ok(allowed.has(file),file);changed.push(file);}
}
const printer=ts.createPrinter({removeComments:true});
function inspect(text){
 const source=ts.createSourceFile('view.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const mutations=[];const handlers={};
 const print=node=>printer.printNode(ts.EmitHint.Unspecified,node,source);
 function walk(node){
  if(ts.isCallExpression(node)&&['onUpdateState','saveToolChange','saveAIChange','saveNoteChange','saveStudyChange'].includes(node.expression.getText(source))&&node.arguments[0]&&ts.isArrowFunction(node.arguments[0]))mutations.push(print(node.arguments[0]));
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&/^(handle|saveNoteChange|closeEditor)/.test(node.name.text)&&node.initializer)handlers[node.name.text]=print(node.initializer);
  ts.forEachChild(node,walk);
 }walk(source);return {mutations:mutations.sort(),handlers};
}
const checks=[];
for(const name of ['EstudiosView','NotasView','ProjectsManager','IAView','FocusTimer']){
 const before=inspect(await fs.readFile(`${dir}/before-source/${name}.tsx`,'utf8'));
 const after=inspect(await fs.readFile(`src/components/${name}.tsx`,'utf8'));
 assert.deepEqual(after.mutations,before.mutations,`${name}: persisted mutations must remain identical`);
 if(name==='EstudiosView')assert.deepEqual(after.handlers,before.handlers,'Academic handlers unchanged');
 if(name==='NotasView') for(const key of ['saveNoteChange','closeEditor','handleAddPostit','handleStartEdit','handleSaveEdit','handleTogglePin','handleToggleArchive','handleConvertToTask','handleDeletePostit','handlePlaceInGym','handleRemoveFromGym'])assert.equal(after.handlers[key],before.handlers[key],key);
 if(name==='FocusTimer')for(const key of Object.keys(before.handlers).filter(key=>!['handleToggleTrack','handleVolumeChange','handleApplyPreset','handleToggleManualListen'].includes(key)))assert.equal(after.handlers[key],before.handlers[key],key);
 checks.push({name,persistedMutationsUnchanged:after.mutations.length});
}
const oldAudio=await fs.readFile(`${dir}/before-source/audio.ts`,'utf8');const audio=await fs.readFile('src/lib/audio.ts','utf8');
assert.ok(normaliseLines(audio.slice(audio.indexOf('// Web Audio'),audio.indexOf('// Ambient Noise Mixer')))===normaliseLines(oldAudio.slice(0,oldAudio.indexOf('// Ambient Noise Mixer'))),'Interaction sounds used by previous modules unchanged');
assert.ok(normaliseLines(await fs.readFile('src/index.css','utf8')).replace('@import "./styles/refinement-tanda-3.css";\n','')===normaliseLines(await fs.readFile(`${dir}/before-source/index.css`,'utf8')),'Only the scoped CSS import is added');
await fs.writeFile(`${dir}/preservation.json`,JSON.stringify({changed,checks,previousModulesAndContractsUnchanged:true,noteEditorAndStudyHandlersUnchanged:true,interactionSoundsUnchanged:true},null,2));
console.log('Preservation passed: prior modules/contracts, mutation bodies, academic handlers, note editor and interaction sounds unchanged.');
