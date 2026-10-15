// Public post-registration business-support form: validation, CRM request payload,
// truthful confirmation, WhatsApp draft routing, and phone layout.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4199';
const ok = (value, message) => { if (!value) throw new Error(message); console.log('  ok', message); };

(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let body = null, requestCount = 0;
  await page.route('**/api/site-enquiry', route => {
   requestCount++;
   body = route.request().postDataJSON();
   return route.fulfill({ json: { ok: true, deal_id: 123, reference: 'GC-EF-00123', email_queued: true, team_alerts_queued: 2 } });
  });
  await page.goto(BASE + '/event-help');
  ok(await page.locator('h1').innerText() === 'How can we support your business?', 'follow-up page explains its purpose');
  ok((await page.locator('main').innerText()).includes('Your event registration stays unchanged'), 'page clearly separates follow-up from event registration');
  const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
   send: document.querySelector('#eventHelpForm button[type="submit"]').getBoundingClientRect().toJSON() }));
  ok(layout.scroll <= layout.width && layout.send.width >= 44 && layout.send.height >= 44, 'phone layout has no horizontal overflow and a usable submit target');
  await page.fill('#eh-name', 'Test Visitor');
  await page.fill('#eh-email', 'test@example.test');
  await page.check('input[name="need"][value="AI, IT and business software"]');
  await page.fill('#eh-challenge', 'We need help selecting software and improving our online presence.');
  await page.click('#eventHelpForm button[type="submit"]');
  ok(requestCount === 0 && !(await page.locator('#eh-success').isVisible()), 'privacy consent is required before any CRM request');
  await page.check('#eh-consent');
  await page.click('#eventHelpForm button[type="submit"]');
  await page.waitForSelector('#eh-success.on');
  ok(body?.type === 'event' && body.item_code === 'F1' && body.email === 'test@example.test' && body.consent === true,
   'form sends the event follow-up and consent to the CRM');
  ok(body.topic.includes('AI, IT and business software') && body.message.includes('online presence'), 'selected help areas and challenge reach the CRM');
  ok(requestCount === 1 && (await page.locator('#eh-reference').innerText()) === 'GC-EF-00123', 'success appears only after a stored CRM response with its reference');
  ok((await page.locator('#eh-result-message').innerText()).includes('email') && (await page.locator('#eh-result-message').innerText()).includes('Joy and Uffe'), 'confirmation reports the queued email and team alerts');
  const wa = await page.locator('#eh-whatsapp').getAttribute('href');
  ok(wa.startsWith('https://wa.me/233552395548?text=') && decodeURIComponent(wa).includes('Uffe'), 'technology enquiries get an optional Uffe WhatsApp draft');
  ok(await page.locator('#eh-whatsapp').getAttribute('target') === '_blank' && requestCount === 1, 'WhatsApp remains an explicit user action and sends nothing automatically');
  ok(errors.length === 0, 'no browser JavaScript errors');
  await context.close();

  const offline = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await offline.route('https://fonts.googleapis.com/**', route => route.abort());
  const retry = await offline.newPage();
  await retry.route('**/api/site-enquiry', route => route.fulfill({ status: 503, json: { error: 'mail_unavailable' } }));
  await retry.goto(BASE + '/event-help');
  await retry.fill('#eh-name', 'Retry Visitor'); await retry.fill('#eh-email', 'retry@example.test');
  await retry.fill('#eh-challenge', 'I need help with business planning.'); await retry.check('#eh-consent');
  await retry.click('#eventHelpForm button[type="submit"]');
  await retry.waitForFunction(() => document.querySelector('#eh-status').classList.contains('error'));
  ok(await retry.locator('#eventHelpForm').isVisible() && !(await retry.locator('#eh-success').isVisible()), 'failed CRM submission remains retryable and does not claim success');
  await offline.close();
  console.log('PASSED event-help browser flow');
 } finally {
  await browser.close();
 }
})().catch(error => { console.error(error); process.exit(1); });
