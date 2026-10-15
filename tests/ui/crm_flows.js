// CRM end to end in a browser: laptop and phone. Needs seed_demo.py + seed_crm.py on :4199.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const B = process.env.BASE || 'http://127.0.0.1:4199', PW = process.env.ADMIN_PW || 'Admin2025-qa!';
const ok = m => console.log('  ok', m);
(async () => {
 const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
 for (const d of [{ n: 'laptop', w: 1366, h: 820, m: false }, { n: 'phone', w: 390, h: 844, m: true }]) {
  console.log(d.n);
  const c = await b.newContext({ viewport: { width: d.w, height: d.h }, isMobile: d.m, hasTouch: d.m, extraHTTPHeaders: { 'x-real-ip': '10.66.' + (d.m ? 2 : 1) + '.9' } });
  await c.route('https://fonts.googleapis.com/**', route => route.abort());
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message + ' @ ' + (e.stack||'').split('\n').slice(0,3).join(' | ')));
  const tap = s => d.m ? p.tap(s) : p.click(s);
  await p.goto(B + '/admin'); await p.fill('#e', 'admin'); await p.fill('#pw', PW); await tap('#lbtn'); await p.waitForSelector('#app', { state: 'visible' });
  await p.waitForSelector('.kpi'); ok('dashboard loads with KPIs');
  await p.waitForSelector('.command-head'); ok('dashboard opens the CRM command centre');
  await p.waitForSelector('.command-grid'); ok('calendar, event readiness and market-watch panels are connected');
  if (await p.locator('.command-grid .command-card-head').count() !== 3) throw new Error('command-centre cards did not all render');
  ok('schedule, event readiness and sourced market-watch cards render');
  // new deal from + New, for a brand-new company
  const co = 'Volta Logistics ' + d.n;
  await tap('#newb'); await tap('#newm [data-new="deal"]'); await p.waitForSelector('#nd-c');
  await p.fill('#nd-c', co); await p.fill('#nd-p', 'Akosua Darko'); await p.fill('#nd-ph', '0244777888');
  await p.fill('#nd-t', 'Fleet compliance review'); await p.fill('#nd-v', '18,500'); await p.fill('#nd-n', 'Site visit'); await tap('#nd-go');
  await p.waitForSelector('#dstg'); ok('deal created from New → Deal, with a new company');
  await tap('#dstg [data-s="meeting"]'); await p.waitForTimeout(700);
  if (!(await p.getAttribute('#dstg [data-s="meeting"]', 'class')).includes('on')) throw new Error('stage did not move'); ok('moved to Meeting from the drawer');
  await p.fill('#dn-b', 'Met Akosua, wants the review before the GRA audit'); await tap('#dn-k [data-k="meeting"]'); await tap('#dn-s'); await p.waitForTimeout(800);
  if (!(await p.textContent('#drb')).includes('GRA audit')) throw new Error('note missing'); ok('meeting note added to the deal');
  await p.keyboard.press('Escape');
  // pipeline shows it in the Meeting column
  await p.evaluate(() => location.hash = 'pipe'); await p.waitForSelector('.col[data-stage="meeting"] .dcard');
  const inMeeting = await p.$$eval('.col[data-stage="meeting"] .dcard b', els => els.map(e => e.textContent));
  if (!inMeeting.includes('Fleet compliance review')) throw new Error('not on the board: ' + inMeeting); ok('board shows it under Meeting');
  if (!d.m) { // drag and drop on a laptop
   await p.dragAndDrop('.dcard:has-text("Fleet compliance review")', '.col[data-stage="proposal"]'); await p.waitForTimeout(900);
   await p.evaluate(() => location.hash = 'dash'); await p.evaluate(() => location.hash = 'pipe'); await p.waitForSelector('.col[data-stage="proposal"] .dcard');
   const inProp = await p.$$eval('.col[data-stage="proposal"] .dcard b', els => els.map(e => e.textContent));
   if (!inProp.includes('Fleet compliance review')) throw new Error('drag did not save'); ok('drag to Proposal saved');
  }
  // global search → company record
  await p.fill('#gq', co.split(' ')[0] + ' ' + co.split(' ')[1]); await p.waitForSelector('#sres.on a'); await tap('#sres a');
  await p.waitForSelector('.rhead'); if (!(await p.textContent('.rhead h2')).includes('Volta')) throw new Error('search went elsewhere'); ok('search opens the company record');
  // log a call with a follow-up
  await tap('#rn-k [data-k="call"]'); await p.fill('#rn-b', 'Called Akosua, sending the quote'); await p.selectOption('#rn-f', '1'); await tap('#rn-s');
  await p.waitForFunction(() => document.querySelector('.tl') && document.querySelector('.tl').textContent.includes('sending the quote'));
  if (!(await p.textContent('.rec')).includes('Follow up with')) throw new Error('follow-up task missing'); ok('call logged, follow-up task for tomorrow created');
  // tick the task off from the record
  await tap('.rec [data-tdone]'); await p.waitForTimeout(1200); ok('task ticked off from the record');
  // tasks view: quick add
  await p.evaluate(() => location.hash = 'tasks'); await p.waitForSelector('#qa-t');
  await p.fill('#qa-t', 'Book the Tang Palace AV team ' + d.n); await tap('#qa-p [data-d="1"]'); await tap('#qa-go'); await p.waitForTimeout(900);
  if (!(await p.textContent('#tlist')).includes('Book the Tang Palace AV team ' + d.n)) throw new Error('quick add'); ok('task quick-added for tomorrow');
  // reports render and export
  await p.evaluate(() => location.hash = 'reports'); await p.waitForSelector('.bars');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-csv="recv"]')]); if (!(await dl.suggestedFilename()).endsWith('.csv')) throw new Error('csv'); ok('reports render, CSV downloads');
  // back button works (hash routing)
  await p.goBack(); await p.waitForTimeout(500); if (!(await p.evaluate(() => location.hash)).includes('tasks')) throw new Error('back button'); ok('browser Back returns to the previous screen');
  if (d.m) { const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (over) throw new Error('sideways scroll on phone'); ok('no sideways scrolling on the phone'); }
  if (errs.length) throw new Error('JS errors: ' + errs.join('; '));
  await c.close();
 }
 // staff see none of it
 await b.close(); console.log('\nALL CRM UI FLOWS PASSED');
})().catch(e => { console.error('FAIL', e.message); process.exit(1) });
