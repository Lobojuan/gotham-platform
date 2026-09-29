// Website end-to-end test (run it through tests/e2e/run.sh, which starts the server and a mock AI provider).
//  1. Crawl: every internal link on every page answers 200, every #anchor exists, every page has title, description,
//     canonical, lang and exactly one h1.
//  2. Every page on iPhone SE, iPhone 15, Galaxy A, Pixel 7, iPad and desktop: no JS errors, no failed requests,
//     no sideways scrolling, one header and footer, images with alt text, buttons with names, tap targets >= 40px.
//  3. Journeys: menus (mega menu, phone sheet, dock), carousel, service detail pages, FAQ, the AI panel and the
//     Ask Gotham chat (questions and answers), languages, free tools, registration, 404 and old-address redirects.
// LIVE=1 runs against the real site read-only (no registrations or signups sent); WEBKIT=1 runs iPhones/iPads in WebKit (Safari's engine).
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const LIVE = process.env.LIVE === '1', WEBKIT = process.env.WEBKIT === '1';
const isAnswer = t => LIVE ? t.length > 40 && !/answer you personally/.test(t) : /MOCK-AI/.test(t);
let BROWSERS = {};
// the live site keeps a connection or two open (fonts, bridge), so wait for load plus a moment instead of network idle
const NAV = LIVE ? { waitUntil: 'load', timeout: 60000 } : { waitUntil: 'networkidle' };
const settle = p => LIVE ? p.waitForTimeout(1500) : Promise.resolve();
const engineFor = dev => (WEBKIT && /iphone|ipad/i.test(dev) ? BROWSERS.webkit : BROWSERS.chromium);
const B = process.env.BASE || 'http://127.0.0.1:4199';
const EXE = process.env.CHROMIUM || undefined;
let pass = 0; const fails = [];
const check = (name, cond, info = '') => { if (cond) pass++; else { fails.push(`${name}${info ? ' → ' + info : ''}`); console.log('  FAIL', name, info); } };
const ip = () => `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;   // own rate-limit bucket per context

const DEVICES = [
  ['iphone-se', { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone SE'].userAgent }],
  ['iphone-15', devices['iPhone 14']],
  ['galaxy-a', { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['Galaxy S9+'].userAgent }],
  ['pixel-7', devices['Pixel 7']],
  ['ipad', devices['iPad (gen 7)']],
  ['desktop', { viewport: { width: 1440, height: 900 } }],
];
const SKIP = /^(mailto:|tel:|https?:|javascript:|data:)|^\/(admin|api|media)\b/;

async function crawl(req) {
  const seen = new Map(), queue = ['/', '/classic', '/teaser'], anchors = [];
  while (queue.length) {
    const path = queue.shift(); if (seen.has(path)) continue;
    const r = await req.get(B + path, { maxRedirects: 0 }); const html = r.status() === 200 ? await r.text() : '';
    seen.set(path, { status: r.status(), html });
    check(`GET ${path} answers 200`, r.status() === 200, String(r.status()));
    if (!html) continue;
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      let h = m[1].replace(/&amp;/g, '&'); if (h.startsWith(B)) h = h.slice(B.length);
      if (SKIP.test(h) || h.startsWith('/assets') || /\.(css|js|png|webp|jpg|svg|xml|ico|pdf|ics)(\?|$)/.test(h)) continue;
      if (h.startsWith('#')) { if (h.length > 1) anchors.push([path, h.slice(1)]); continue; }
      if (!h.startsWith('/')) continue;
      const [p, hash] = h.split('#'); const clean = p.split('?')[0] || '/';
      if (hash) anchors.push([clean, hash]);
      if (!seen.has(clean) && !queue.includes(clean)) queue.push(clean);
    }
  }
  const pages = [...seen.entries()].filter(([, v]) => v.status === 200).map(([k]) => k);
  for (const [page, id] of anchors) {
    const html = seen.get(page)?.html || '';
    // anchors that the page's script fills in (tabs, JS-built sections) are checked in the browser pass instead
    check(`anchor ${page}#${id} exists`, new RegExp(`id="${id}"`).test(html) || /^(p-|t-|tool-|tt-)/.test(id), '');
  }
  for (const page of pages) {
    const h = seen.get(page).html;
    check(`${page}: <title>`, /<title>[^<]{10,}<\/title>/.test(h));
    check(`${page}: meta description`, /<meta name="description" content="[^"]{40,}"/.test(h));
    check(`${page}: canonical`, /<link rel="canonical" href="https?:\/\/[^"]+"/.test(h));
    check(`${page}: html lang`, /<html lang="en"/.test(h));
    check(`${page}: exactly one h1`, (h.match(/<h1[\s>]/g) || []).length === 1, String((h.match(/<h1[\s>]/g) || []).length));
    check(`${page}: viewport meta`, /name="viewport" content="width=device-width/.test(h));
  }
  // Carlson Capital Ltd is only the renewable energy and AI/software partner: never in the content of other services
  for (const page of ['/mining', '/invest', '/family', '/register', '/forums', '/teaser', '/services', '/services/market-entry', '/services/compliance-esg',
    '/services/investment-readiness', '/services/family-support', '/services/education', '/services/media-forums']) {
    const h = seen.get(page)?.html || '', main = h.replace(/<header class="gh[\s\S]*?<\/header>|<dialog class="sheet[\s\S]*?<\/dialog>|<footer class="gf[\s\S]*?<\/footer>|<script[\s\S]*?<\/script>/g, '');
    check(`${page}: no Carlson Capital or its number in the page content`, main && !/Carlson|233552395548|55 239 5548/.test(main), (main.match(/.{40}(Carlson|233552395548|55 239 5548).{40}/) || [''])[0]);
  }
  return pages;
}

async function sweep(_b, pages) {
  for (const [dev, opt] of DEVICES) {
    const ctx = await engineFor(dev).newContext({ ...opt, extraHTTPHeaders: { 'x-real-ip': ip() } });
    for (const path of pages) {
      const p = await ctx.newPage(); const errs = [], bad = [];
      p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
      p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|TUNNEL|Failed to load resource|Button failed to load, iconName/.test(m.text())) errs.push(m.text().slice(0, 160)); });
      p.on('requestfailed', r => { if (!/fonts\.g|googleapis|gstatic|\/api\/ask/.test(r.url()) && !/ERR_ABORTED|cancelled/i.test(r.failure()?.errorText || '')) bad.push('failed ' + r.url().replace(B, '') + ' ' + (r.failure()?.errorText || '')); });
      p.on('response', r => { if (r.status() >= 400 && !/fonts\.g|googleapis|gstatic/.test(r.url())) bad.push(r.status() + ' ' + r.url().replace(B, '')); });
      await p.goto(B + path, NAV); await settle(p);
      const r = await p.evaluate(() => {
        const vw = innerWidth, over = [], taps = [], noAlt = [], noName = [];
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('dialog:not([open]), [hidden], .sr-only, svg, .car-stage, .ticker')) continue;
          const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const rc = el.getBoundingClientRect(); if (!rc.width || !rc.height) continue;
          const clipped = () => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') return true; } return false; };
          if (rc.right > vw + 1 && !el.closest('.jump,.tabs,.chat-chips,.ttabs') && !clipped()) over.push(el.tagName + '.' + String(el.className).split(' ')[0]);
          if (innerWidth < 900 && (el.tagName === 'BUTTON' || (el.tagName === 'A' && !el.closest('p,li,dd,td,.crumb,.crumbs,.gf,.src,.entity,label,small')))
              && (rc.height < 40 || rc.width < 40) && el.closest('.v2c,main#main'))
            taps.push((el.textContent.trim() || el.getAttribute('aria-label') || el.tagName).slice(0, 24) + ' ' + Math.round(rc.width) + 'x' + Math.round(rc.height));
          if (el.tagName === 'IMG' && !el.hasAttribute('alt')) noAlt.push(el.src.split('/').pop());
          if (el.tagName === 'BUTTON' && !(el.textContent.trim() || el.getAttribute('aria-label') || el.title)) noName.push(el.className || el.id);
        }
        return { sideways: document.documentElement.scrollWidth - vw, over: over.slice(0, 3), taps: taps.slice(0, 3), noAlt, noName,
          headers: document.querySelectorAll('header.gh').length, footers: document.querySelectorAll('footer.gf').length,
          skip: !!document.querySelector('a[href="#main"]'), dock: !!document.querySelector('nav.dock') };
      });
      const tag = `${dev} ${path}`;
      check(`${tag}: no JS errors`, !errs.length, errs.join(' | '));
      check(`${tag}: no failed requests`, !bad.length, bad.join(' | '));
      check(`${tag}: no sideways scrolling`, r.sideways <= 0 && !r.over.length, `${r.sideways}px ${r.over.join(',')}`);
      check(`${tag}: one header, one footer`, r.headers === 1 && r.footers === 1, `${r.headers}/${r.footers}`);
      check(`${tag}: images have alt text`, !r.noAlt.length, r.noAlt.join(','));
      check(`${tag}: buttons have names`, !r.noName.length, r.noName.join(','));
      check(`${tag}: tap targets >= 40px`, !r.taps.length, r.taps.join(' | '));
      check(`${tag}: skip link`, r.skip);
      await p.close();
    }
    await ctx.close();
    console.log(`  swept ${pages.length} pages on ${dev}`);
  }
}

const waitAnswer = (p, n) => p.waitForFunction(k => document.querySelectorAll('#msgs .m.bot:not(.typing)').length >= k, n, { timeout: 15000 }).then(() => true, () => false);
const lastBot = p => p.evaluate(() => [...document.querySelectorAll('#msgs .m.bot:not(.typing)')].pop()?.textContent || '');

async function journeys(browser) {
  // ---------- desktop ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'x-real-ip': ip() } });
    const p = await ctx.newPage();
    await p.goto(B + '/', NAV); await settle(p);
    await p.click('.nav button.nb[data-nav="services"]');
    check('desktop: Services opens the mega menu', await p.isVisible('#mega-services'));
    await p.click('#mega-services a.mi:has-text("AI & digital")');
    await p.waitForURL(B + '/services/ai');
    check('desktop: mega menu → AI detail page', /AI/.test(await p.textContent('h1')));
    check('desktop: Services is highlighted in the menu on a detail page', await p.evaluate(() => {
      const b = document.querySelector('.nav [data-nav="services"]'); return b.getAttribute('aria-current') === 'page' || b.classList.contains('cur'); }));
    // FAQ accordion
    const faq = p.locator('details.faq').first();
    await faq.locator('summary').click();
    check('FAQ opens on click', await faq.evaluate(d => d.open));
    // AI panel → chat answers
    const q1 = await p.locator('[data-ask]').first().textContent();
    await p.locator('[data-ask]').first().click();
    check('AI panel question opens the chat', await p.isVisible('#chat'));
    check('AI panel question shows in the chat', (await p.textContent('#msgs .m.me')).trim() === q1.trim());
    check('AI answer arrives', await waitAnswer(p, 2) && isAnswer(await lastBot(p)), await lastBot(p));
    await p.fill('#chatI', 'What does the readiness audit cost?'); await p.press('#chatI', 'Enter');
    check('follow-up question in the chat gets an answer', await waitAnswer(p, 3) && (LIVE ? isAnswer(await lastBot(p)) : /readiness audit cost/.test(await lastBot(p))), await lastBot(p));
    await p.click('#chatX');
    check('chat closes', await p.isHidden('#chat'));
    await p.fill('.ai-f input', 'Can you train my staff?'); await p.click('.ai-f button');
    check('typed AI panel question is answered with the service as context', await waitAnswer(p, 4) && (LIVE ? isAnswer(await lastBot(p)) : /train my staff.*about AI in your business/.test(await lastBot(p))), await lastBot(p));
    // services page → detail
    await p.goto(B + '/services', NAV); await settle(p);
    check('services page links all ten practices', await p.locator('.prac a.more').count() === 10);
    await p.locator('.prac a.more').nth(4).click(); await p.waitForURL(/\/services\/creative-studio$/);
    check('"More about this" opens the practice page', /creative-studio/.test(p.url()));
    await p.locator('.others a', { hasText: 'Education' }).click(); await p.waitForURL(/\/services\/education$/);
    check('"Other practices" links work', /education/.test(p.url()));
    // home carousel
    await p.goto(B + '/', NAV); await settle(p);
    const t0 = await p.textContent('[data-car-title]'); await p.click('[data-car-next]'); await p.waitForTimeout(500);
    check('carousel next moves to another practice', (await p.textContent('[data-car-title]')) !== t0);
    {  // mouse: pointing at a side card (no click) turns it to the front
      const sb = await p.locator('.car-stage').boundingBox(), before = await p.textContent('[data-car-title]');
      await p.mouse.move(sb.x + sb.width * .5, sb.y + sb.height * .5);
      const side = await p.locator('.car-card.side').last().boundingBox();
      await p.mouse.move(side.x + side.width / 2, side.y + side.height / 2, { steps: 8 });
      await p.waitForTimeout(1300);
      check('carousel turns when the mouse moves across it (no click)', (await p.textContent('[data-car-title]')) !== before);
      check('carousel settles with one card in front', await p.$$eval('.car-card.front', a => a.length) === 1);
      await p.mouse.move(5, 5); await p.waitForTimeout(400);
    }
    const hrefs = await p.$$eval('.car-card', a => a.map(x => x.getAttribute('href')));
    check('carousel cards open the practice pages', hrefs.length === 10 && hrefs.every(h => /^\/services\/[a-z-]+$/.test(h)), hrefs.join(','));
    // home chat via chip
    await p.click('#chatO'); await p.locator('#chatChips button').first().click();
    check('home chat chip gets an answer', await waitAnswer(p, 2) && isAnswer(await lastBot(p)));
    await p.click('#chatX');
    // language: French, carried to the next page, then back to English
    const h1en = (await p.textContent('h1')).trim();
    await p.click('.langb'); await p.click('#langp [data-lang="fr"]');
    await p.waitForFunction(en => document.querySelector('h1').textContent.trim() !== en, h1en, { timeout: 8000 }).catch(() => {});
    check('French translates the home page', (await p.textContent('h1')).trim() !== h1en);
    await p.goto(B + '/services/ai', NAV); await p.waitForTimeout(800);
    check('French carries to a practice page', /IA|intelligence/i.test(await p.textContent('#get-h') + await p.textContent('h1')), await p.textContent('h1'));
    const untranslated = await p.evaluate(() => [...document.querySelectorAll('main h1, main h2, main h3, main .lead, .faq summary, .ai-q button')].map(e => e.textContent.trim()).filter(t => /\b(the|and|your|what|with)\b/i.test(t) && !/Gotham|Carlson/.test(t)));
    check('practice page fully in French (headings, leads, FAQ, AI questions)', !untranslated.length, untranslated.slice(0, 3).join(' | '));
    await p.click('.langb'); await p.click('#langp [data-lang="es"]'); await p.waitForTimeout(600);
    check('Spanish on a practice page', /IA|inteligencia|negocio/i.test(await p.textContent('main')), (await p.textContent('h1')));
    await p.click('.langb'); await p.click('#langp [data-lang="en"]'); await p.waitForTimeout(300);
    check('back to English', /AI/.test(await p.textContent('h1')));
    // forums: calendar, add to calendar, calendar files
    await p.goto(B + '/forums', NAV); await settle(p);
    await p.waitForSelector('.gcal-d.has', { timeout: 10000 }).catch(() => {});
    check('forums calendar marks the event days', await p.locator('.gcal-d.has').count() >= 1);
    check('forums calendar opens on the next event with its details', await p.locator('.gcal-ev h4').count() >= 1 && await p.locator('.gcal-ev a[href^="/register?e="]').count() >= 1);
    check('subscribe links point to the events feed', /^webcal:\/\/.+\/cal\/events\.ics$/.test(await p.getAttribute('[data-cal-sub]', 'href')) && /calendar\.google\.com.+cid=webcal/.test(await p.getAttribute('[data-cal-gsub]', 'href')));
    await p.locator('#events .addcal summary').first().click();
    const acl = await p.$$eval('#events .addcal[open] a', a => a.map(x => x.getAttribute('href')));
    check('"Add to calendar" offers Google, an .ics file and Outlook.com', acl.length === 3 && /calendar\.google\.com.+action=TEMPLATE.+dates=\d{8}T\d{6}Z\/\d{8}T\d{6}Z/.test(acl[0]) && /^\/cal\/event\/[A-Z0-9]+\.ics$/.test(acl[1]) && /outlook\.live\.com/.test(acl[2]), acl.join(' '));
    const icsOk = await p.evaluate(async u => { const r = await fetch(u); const t = await r.text(); return r.ok && /text\/calendar/.test(r.headers.get('content-type')) && t.startsWith('BEGIN:VCALENDAR') && t.includes('BEGIN:VEVENT'); }, acl[1]);
    const feedOk = await p.evaluate(async () => { const r = await fetch('/cal/events.ics'); return r.ok && (await r.text()).includes('BEGIN:VEVENT'); });
    check('event file and events feed download as valid calendars', icsOk && feedOk);
    // free tools
    await p.goto(B + '/tools', NAV); await settle(p);
    check('tools page shows the health check', await p.isVisible('#hcq fieldset'));
    check('tools page hides the rest of the old one-page site', !(await p.isVisible('#services')) && !(await p.isVisible('#forums')));
    for (const n of ['ty', 'st', 'se', 'sa', 'tin', 'bop', 'bank', 'web']) await p.locator(`#hcq [name="${n}"]`).first().check({ force: true });
    await p.click('#hcq button[type=submit]');
    check('health check gives a checklist', await p.isVisible('#hcr') && (await p.textContent('#hcr')).length > 80);
    await p.click('#tt-ff'); check('funding finder tab opens', await p.isVisible('#tool-ff'));
    await p.click('#tt-vt'); check('VAT check tab opens', await p.isVisible('#tool-vt'));
    // older pages keep their own content and scripts: the shared script must not fill or double-submit anything there
    await p.goto(B + '/terms', NAV); await settle(p);
    check('terms: "Forums, invitations and tickets" heading is intact', /Forums, invitations and tickets/.test(await p.textContent('#events')) && !(await p.$('#events article')));
    await p.goto(B + '/classic', NAV); await settle(p);
    let posts = 0; p.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/register')) posts++; });
    if (!LIVE && await p.$('#briefF')) {
      for (const [sel, v] of [['#b-name', 'E2E Brief'], ['#b-co', 'E2E Co'], ['#b-em', 'e2e@example.com'], ['#b-ph', '0241234567']]) if (await p.$(sel)) await p.fill(sel, v);
      await p.evaluate(() => { const f = document.getElementById('briefF'); (f.querySelector('[type=submit]') || f.querySelector('button')).click(); }); await p.waitForTimeout(1500);
      check('classic page: brief form sends one request, not two', posts <= 1, String(posts));
    }
    // redirects and 404
    const req = ctx.request;
    for (const [from, to] of [['/v2/services', '/services'], ...(LIVE ? [] : [['/wp-login.php', '/admin']]), ['/contact', '/about#contact']]) {
      const r = await req.get(B + from, { maxRedirects: 0 }); check(`${from} redirects to ${to}`, [301, 302, 308].includes(r.status()) && (r.headers().location || '').endsWith(to), r.status() + ' ' + r.headers().location);
    }
    check('unknown page answers 404', (await req.get(B + '/services/does-not-exist')).status() === 404);
    const sm = await (await req.get(B + '/sitemap.xml')).text();
    // French on every page, including the older ones (register, Family Desk, tools, legal)
    {
      const q = await ctx.newPage(); await q.goto(B + '/', NAV); await q.evaluate(() => { try { localStorage.setItem('gc-language', 'fr'); } catch {} });
      for (const path of ['/register', '/family', '/tools', '/privacy', '/terms', '/teaser', '/services/education']) {
        await q.goto(B + path, NAV); await q.waitForTimeout(700);
        const en = await q.evaluate(() => [...document.querySelectorAll('h1, h2, h3, main .lead, main p.lead, summary, button, label:not(.opt), legend')]
          .filter(e => e.offsetParent !== null).map(e => e.textContent.trim()).filter(t => /\b(the|and|your|what|with|how|who)\b/i.test(t) && !/Gotham Consult|Carlson|SMEs at the Centre/.test(t)));
        check(`French ${path}: headings, buttons and labels translated`, !en.length, en.slice(0, 3).join(' | '));
      }
      await q.evaluate(() => { try { localStorage.setItem('gc-language', 'en'); } catch {} }); await q.close();
    }
    check('sitemap lists the ten practice pages and /tools', (sm.match(/\/services\/[a-z-]+</g) || []).length === 10 && /\/tools</.test(sm));
    await ctx.close();
  }
  // ---------- phones ----------
  for (const [dev, opt] of [['iphone-15', devices['iPhone 14']], ['pixel-7', devices['Pixel 7']], ['iphone-se', DEVICES[0][1]]]) {
    const ctx = await engineFor(dev).newContext({ ...opt, extraHTTPHeaders: { 'x-real-ip': ip() } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(B + '/', NAV); await settle(p);
    check(`${dev}: brand name and Carlson Capital visible`, await p.isVisible('header.gh .brand b') && await p.isVisible('header.gh .brand small'));
    await p.tap('.dock [data-open-pane="services"]'); await p.waitForTimeout(400);
    check(`${dev}: dock Services opens the services list`, await p.evaluate(() => document.getElementById('sheet').open && document.querySelector('.panes').dataset.level === '1'));
    await p.tap('#pane-services a.svc:has-text("Market entry")'); await p.waitForURL(/\/services\/market-entry$/);
    check(`${dev}: services list → Market entry page`, /market-entry/.test(p.url()));
    await p.tap('.dock [data-open-pane="root"]'); await p.waitForTimeout(400);
    await p.tap('#sheet .pane.p0 a.row:has-text("Forums")'); await p.waitForURL(/\/forums$/);
    check(`${dev}: menu → Forums`, /forums$/.test(p.url()));
    await p.goto(B + '/services/digital', NAV); await settle(p);
    await p.locator('[data-ask]').nth(2).scrollIntoViewIfNeeded(); await p.locator('[data-ask]').nth(2).tap();
    check(`${dev}: AI question answered in the chat`, await waitAnswer(p, 2) && isAnswer(await lastBot(p)));
    const chatBox = await p.locator('#chat').boundingBox(); const vw = p.viewportSize().width;
    check(`${dev}: chat fits the screen`, chatBox && chatBox.x >= 0 && chatBox.x + chatBox.width <= vw + 1, JSON.stringify(chatBox));
    const inputFont = await p.$eval('#chatI', e => parseFloat(getComputedStyle(e).fontSize));
    check(`${dev}: chat input is 16px (no iOS zoom)`, inputFont >= 16, String(inputFont));
    await p.tap('#chatX');
    await p.tap('.dock [data-open-pane="root"]'); await p.waitForTimeout(300); await p.tap('.sheet-langs [data-lang="fr"]'); await p.waitForTimeout(900);
    check(`${dev}: French from the phone menu`, /Hébergement|numérique|site/i.test(await p.textContent('h1') + await p.textContent('main .lead')), await p.textContent('h1'));
    await p.evaluate(() => { try { localStorage.clear(); } catch {} });
    // registration, shortest path
    await p.goto(B + '/register?e=F1', NAV); await settle(p);
    await p.fill('#nm', 'E2E Test ' + dev); await p.fill('#ph', '024 412 3456'); await p.locator('#cons').tap();
    if (LIVE) check(`${dev}: registration form ready (not sent on the live site)`, await p.isVisible('#goSend') && await p.isChecked('#cons'));
    else { await p.locator('#goSend').tap();
      check(`${dev}: registration with name + WhatsApp succeeds`, await p.waitForSelector('#ok.on', { timeout: 10000 }).then(() => true, () => false)); }
    check(`${dev}: no JS errors during the journeys`, !errs.length, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  BROWSERS = { chromium: browser, webkit: WEBKIT ? await webkit.launch() : null };
  console.log(`site ${B}${LIVE ? ' (live, read-only)' : ''}; iPhones in ${WEBKIT ? 'WebKit (Safari engine)' : 'Chromium emulation'}`);
  const req = (await browser.newContext()).request;
  const t0 = Date.now();
  console.log('1. crawl'); const pages = await crawl(req); console.log(`  ${pages.length} pages: ${pages.join(' ')}`);
  console.log('2. every page on six screens'); await sweep(browser, pages);
  console.log('3. journeys'); await journeys(browser);
  await browser.close(); if (BROWSERS.webkit) await BROWSERS.webkit.close();
  console.log(`\n${pass} checks passed, ${fails.length} failed (${Math.round((Date.now() - t0) / 1000)}s)`);
  if (fails.length) { console.log(fails.slice(0, 60).map(f => ' - ' + f).join('\n')); process.exit(1); }
  console.log('PASSED');
})().catch(e => { console.error('ERROR', e); process.exit(1); });
