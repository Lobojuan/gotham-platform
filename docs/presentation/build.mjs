import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
if(!process.env.RUNTIME_NODE_MODULES)throw new Error('Set RUNTIME_NODE_MODULES');
const runtimeRequire=createRequire(path.join(process.env.RUNTIME_NODE_MODULES,'../package.json'));
const sharp=runtimeRequire('sharp');
const {Presentation,PresentationFile}=await import(pathToFileURL(runtimeRequire.resolve('@oai/artifact-tool')));
const repo=process.env.GOTHAM_REPO || process.cwd();
const workspaceDir=process.env.PRESENTATION_WORKSPACE;
if(!workspaceDir)throw new Error('Set PRESENTATION_WORKSPACE');
const skill=process.env.PRESENTATION_SKILL;
const python=process.env.RUNTIME_PYTHON;
const require=createRequire(path.join(repo,'apps/crm/package.json'));
const QR=require('qrcode');
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')));
const out=path.join(workspaceDir,'output'),tmp=path.join(workspaceDir,'.build');
await fs.mkdir(out,{recursive:true});
const copy=JSON.parse(await fs.readFile(path.join(repo,'docs/presentation/copy.json'),'utf8'));
const outputStem=process.env.PRESENTATION_OUTPUT_STEM || 'Gotham-services-screen';
const ink='#101C2E',gold='#C59946',white='#FFFFFF',light='#E4E8EF';
function text(s,t,x,y,w,h,size=40,color=ink,bold=false){
 const a=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 a.text=t;a.text.style={typeface:'Arial',fontSize:size,color,bold,autoFit:'none'};return a;
}
async function pic(s,name,x,y,w,h,fit='cover'){
 const png=await sharp(path.join(repo,'apps/site/public/img',name)).png().toBuffer();
 s.images.add({blob:png,contentType:'image/png',alt:name,position:{left:x,top:y,width:w,height:h},fit});
}
async function brand(s,dark=true){
 if(dark)await pic(s,'brand/mark-white-128.png',64,40,58,58,'contain');
 text(s,'GOTHAM CONSULT',dark?140:64,50,650,40,28,dark?white:ink,true);
}
function notes(s,body,source){s.speakerNotes.textFrame.setText(body+'\nPublished service source: '+source+'\nContent date: 5 October 2026. No prices, investment returns or delivery guarantees are asserted.');}
for(const [lang,c]of Object.entries(copy)){
const p=Presentation.create({slideSize:{width:1280,height:720}});
const cover=p.slides.add();cover.background.fill=ink;
await pic(cover,'real-airportcity.webp',780,0,500,720);await brand(cover);
text(cover,c.cover,64,211,680,230,70,white,true);
text(cover,c.subtitle,66,489,660,100,lang==='en'?36:33,light);
text(cover,'gothamconsult.com',66,643,680,40,28,gold);
notes(cover,'Introduce Gotham Consult as an Accra-based business development and international projects consultancy. Explain that the next slides describe the services already published on the site. Cover photo is the existing Gotham website Airport City image.','https://gothamconsult.com/about');
const sections=[
 ['Business & investment',['Company setup and market entry','Business plans and financial models','Partner and project due diligence','Compliance and ESG support'],'real-bog.webp','https://gothamconsult.com/services','Discuss the client’s sector and stage. Company setup, investment readiness, market entry and compliance support are delivered with professional partners where required. Do not imply guaranteed funding or regulatory approval.'],
 ['AI, digital & creative services',['AI readiness audits and staff training','Finance and reporting automation','Websites, apps and managed hosting','Jingles, adverts and voiceovers'],'tech.webp','https://gothamconsult.com/services/ai','Show the live website chatbot as an example if internet is available. Scope each automation with the client. Do not claim that a certified GRA integration, automatic bank feeds or a complete payroll system have already been delivered. Technology image comes from existing website assets.'],
 ['Projects, people & partnerships',['Energy, mining and infrastructure','Education and school development','Senior citizens and family support','Forums, media and investor roundtables'],'forum.webp','https://gothamconsult.com/services','These are the remaining published service areas. Explain that specialist lawyers, geologists and engineers join projects where needed. Family support is practical coordination, not an unsupported medical-service promise. Forum image is an existing public website asset.']
];
for(let section=0;section<sections.length;section++){
 const [, ,img,url,note]=sections[section],title=c.titles[section],lines=c.services[section];
 const s=p.slides.add();s.background.fill='#F7F7F4';await brand(s,false);
 text(s,title,64,138,1145,90,56,ink,true);
 for(let i=0;i<lines.length;i++){text(s,String(i+1).padStart(2,'0'),64,278+i*88,55,45,26,gold,true);text(s,lines[i],143,271+i*88,680,80,lang==='en'?34:31,ink);}
 await pic(s,img,895,260,321,386);
 notes(s,note,url);
}
const scan=p.slides.add();scan.background.fill=ink;await brand(scan);
text(scan,c.scan,64,136,1155,80,lang==='en'?60:54,white,true);
const links=[[c.website,'https://gothamconsult.com/','gothamconsult.com',142],[c.follow,'https://www.linkedin.com/company/gotham-consult/','Gotham Consult',755]];
for(const [label,url,caption,x]of links){
 text(scan,label,x-30,239,500,58,34,white,true);
 const bytes=await QR.toBuffer(url,{type:'png',errorCorrectionLevel:'M',width:1200,margin:4,color:{dark:'#000000',light:'#FFFFFF'}});
 await fs.writeFile(path.join(tmp,x===142?'qr-website.png':'qr-linkedin.png'),bytes);
 scan.images.add({blob:bytes,contentType:'image/png',alt:'Scan to open '+url,position:{left:x,top:304,width:330,height:330},fit:'contain'});
 text(scan,caption,x-10,650,450,35,26,white);
}
notes(scan,'Leave this slide on screen after the talk so the audience can scan. The first QR opens the public website, including services, forums and the chatbot. The second opens the LinkedIn company page linked in the website footer. Invite people to follow the page in LinkedIn; scanning alone does not follow an account. Phone: +233 55 041 6627. Email: info@gothamconsult.com.','https://gothamconsult.com/');
const candidate=path.join(tmp,`candidate-${lang}.pptx`);await(await PresentationFile.exportPptx(p)).save(candidate);
const finalPath=path.join(out,`${outputStem}-${lang}.pptx`);
await finalizePresentation({workspaceDir,candidatePath:candidate,finalPath,pythonExecutable:python,
 integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],
 explicitTotalSlideCount:5,fontPolicy:{basis:'design',families:['Arial']},verifyArtifactToolImport:true,
 receiptPath:path.join(tmp,`${outputStem}-validation-${lang}.json`)});
await fs.mkdir(path.join(tmp,lang),{recursive:true});
for(let i=0;i<p.slides.items.length;i++){
 const b=await p.export({slide:p.slides.items[i],format:'png',scale:1.5});
 await fs.writeFile(path.join(tmp,lang,`slide-${i+1}.png`),new Uint8Array(await b.arrayBuffer()));
}
console.log(finalPath);
}
