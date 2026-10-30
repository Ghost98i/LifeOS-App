import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const phase = process.argv[2] || 'before';
const dir = `artifacts/refinamiento-tanda-3/${phase}`; await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe', headless: true });
try {
 const context = await browser.newContext();
 await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
 const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message)); const results = [];
 const screens=['estudios','notas','herramientas','proyectos','ia'].filter(view=>!process.argv[3]||view===process.argv[3]);
 for (const [width,height] of [[1920,1080],[2560,1440],[768,1024],[390,844]]) for(const theme of ['light','dark']) for(const view of screens) for(const state of ['empty','filled']) {
  await page.setViewportSize({width,height});
  await page.goto(`http://127.0.0.1:5242/artifacts/refinamiento-tanda-3/browser.html?view=${view}&state=${state}&theme=${theme}`);
  await page.locator('h1').waitFor(); await page.evaluate(()=>document.fonts.ready);
  if(view==='herramientas') await page.getByRole('button',{name:/^Herramientas/}).click();
  await page.waitForTimeout(200);
  await page.screenshot({path:`${dir}/${view}-${state}-${theme}-${width}.png`,fullPage:true});
  results.push({view,state,theme,width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
 }
 let combined=results;
 if(process.argv[3]){const previous=JSON.parse(await fs.readFile(`${dir}/results.json`,'utf8'));const key=item=>`${item.view}/${item.state}/${item.theme}/${item.width}`;const all=new Map(previous.results.map(item=>[key(item),item]));results.forEach(item=>all.set(key(item),item));combined=[...all.values()];}
 await fs.writeFile(`${dir}/results.json`,JSON.stringify({results:combined,errors},null,2));
 console.log(`${phase}: ${results.length} captures, ${errors.length} page errors, ${results.filter(x=>x.overflow).length} overflow cases`);
} finally {await browser.close();}
