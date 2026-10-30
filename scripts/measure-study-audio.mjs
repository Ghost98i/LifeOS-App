import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/refinamiento-tanda-3/audio';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage();const results=[];
 for(const phase of ['before','after']) for(const type of ['rain','brown','white']) {
  await page.goto('http://127.0.0.1:5242/artifacts/refinamiento-tanda-3/browser.html?view=ia&state=empty');
  const data=await page.evaluate(async({phase,type})=>{
   const Offline=window.OfflineAudioContext;
   let ctx;
   window.AudioContext=function(){ctx=new Offline(2,48000*25,48000);ctx.resume=()=>Promise.resolve();return ctx;};
   const source=phase==='before'?'/artifacts/refinamiento-tanda-3/before-source/audio.ts':'/src/lib/audio.ts';
   const audio=await import(source);audio.startAmbientTrack(type,1);
   const rendered=await ctx.startRendering();const channel=rendered.getChannelData(0);
   let peak=0,energy=0;for(let i=48000;i<channel.length;i++){peak=Math.max(peak,Math.abs(channel[i]));energy+=channel[i]**2;}
   const seams=(phase==='before'?[2,4,6,8,10,12,14,16,18,20,22,24]:[12,24]).map(second=>({second,step:Math.abs(channel[second*48000]-channel[second*48000-1])}));
   // Transfer compact PCM rather than million-element JSON arrays.
   const right=rendered.getChannelData(1);
   const bytes=new Uint8Array(channel.length*4);const view=new DataView(bytes.buffer);
   for(let i=0;i<channel.length;i++) {
     view.setInt16(i*4,Math.round(Math.max(-1,Math.min(1,channel[i]))*32767),true);
     view.setInt16(i*4+2,Math.round(Math.max(-1,Math.min(1,right[i]))*32767),true);
   }
   let base64='';for(let i=0;i<bytes.length;i+=32768)base64+=String.fromCharCode(...bytes.subarray(i,i+32768));
   return {pcm:btoa(base64),peak,rms:Math.sqrt(energy/(channel.length-48000)),seams};
  },{phase,type});
  const pcm=Buffer.from(data.pcm,'base64');const header=Buffer.alloc(44);
  header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(192000,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  await fs.writeFile(`${out}/${phase}-${type}.wav`,Buffer.concat([header,pcm]));
  delete data.pcm;assert.ok(data.peak<1);assert.ok(data.rms>0);
  results.push({phase,type,...data,bytes:pcm.length+44});
 }
 const levels=results.filter(item=>item.phase==='after').map(item=>item.rms);
 assert.ok(Math.max(...levels)/Math.min(...levels)<1.5,'Rendered texture levels remain within 3.6 dB');
 await fs.writeFile(`${out}/measurements.json`,JSON.stringify({results,listeningPerformed:false,method:'Real OfflineAudioContext, 25s, 48kHz, stereo WAV, left-channel measurements, volume 100%'},null,2));
 console.log('Six rendered previews exported. Finite, unclipped, level-matched output; no subjective listening claim.');
}finally{await browser.close();}
