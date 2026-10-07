// Chromium shapes RTL paragraphs correctly; Artifact Tool supplies editable PPTX.
// Render the existing layout from the same reviewed copy, pictures and QR targets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const runtime=createRequire(process.env.RUNTIME_NODE_MODULES+'/../package.json');
const {chromium}=runtime('playwright');
const local=createRequire(path.join(process.env.GOTHAM_REPO,'apps/crm/package.json'));
const QR=local('qrcode'),repo=process.env.GOTHAM_REPO,workspace=process.env.PRESENTATION_WORKSPACE;
const c=JSON.parse(await fs.readFile(path.join(repo,'docs/presentation/copy.json'),'utf8')).ar;
const esc=t=>String(t).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const picture=async name=>'data:image/'+(name.endsWith('.png')?'png':'webp')+';base64,'+(await fs.readFile(path.join(repo,'apps/site/public/img',name))).toString('base64');
const mark=await picture('brand/mark-white-128.png');
const element=(t,x,y,w,h,size,color='#101C2E',bold=false)=>`<div dir="${/[\u0600-\u06ff]/.test(t)?'rtl':'ltr'}" style="left:${x}px;top:${y}px;width:${w}px;min-height:${h}px;font-size:${size}px;color:${color};font-weight:${bold?700:400};text-align:${/[\u0600-\u06ff]/.test(t)?'right':'left'};white-space:pre-line">${esc(t)}</div>`;
const image=(url,x,y,w,h,contain=false)=>`<img src="${url}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;object-fit:${contain?'contain':'cover'}">`;
const brand=dark=>dark?image(mark,64,40,58,58,true)+element('GOTHAM CONSULT',140,50,650,40,28,'#FFFFFF',true):element('GOTHAM CONSULT',64,50,650,40,28,'#101C2E',true);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 for(let n=0;n<5;n++){
  let body='',bg=n===0||n===4?'#101C2E':'#F7F7F4';
  if(n===0){body=image(await picture('real-airportcity.webp'),780,0,500,720)+brand(true)+element(c.cover,64,211,680,230,70,'white',true)+element(c.subtitle,66,489,660,100,33,'#E4E8EF')+element('gothamconsult.com',66,643,680,40,28,'#C59946');}
  else if(n<4){body=brand(false)+element(c.titles[n-1],64,138,1145,90,56,'#101C2E',true);for(let i=0;i<4;i++)body+=element(String(i+1).padStart(2,'0'),64,278+i*88,55,45,26,'#C59946',true)+element(c.services[n-1][i],143,271+i*88,680,80,31);body+=image(await picture(['real-bog.webp','tech.webp','forum.webp'][n-1]),895,260,321,386);}
  else{body=brand(true)+element(c.scan,64,136,1155,80,54,'white',true);for(const [label,url,caption,x] of [[c.website,'https://gothamconsult.com/','gothamconsult.com',142],[c.follow,'https://www.linkedin.com/company/gotham-consult/','Gotham Consult',755]]){const qr=await QR.toDataURL(url,{errorCorrectionLevel:'M',width:1200,margin:4});body+=element(label,x-30,239,500,58,34,'white',true)+image(qr,x,304,330,330,true)+element(caption,x-10,650,450,35,26,'white');}}
  await page.setContent(`<html lang="ar"><style>*{box-sizing:border-box}body{margin:0;background:${bg}}main{width:1280px;height:720px;transform:scale(1.5);transform-origin:0 0;position:relative;font:400 1px/1.2 'Geeza Pro',Arial,sans-serif}main>*{position:absolute}</style><body><main>${body}</main></body></html>`);
  await page.evaluate(()=>document.fonts.ready);await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
  await page.screenshot({path:path.join(workspace,'.build/ar',`slide-${n+1}.png`)});
 }
}finally{await browser.close();}
