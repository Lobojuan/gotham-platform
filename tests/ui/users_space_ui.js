// Focused back-office account-management journey. Run after touch_targets_ui.js
// in tests/e2e/run.sh, against its disposable database and local server.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const B = process.env.BASE || 'http://127.0.0.1:4199';
const ok = (value, message) => { if (!value) throw new Error(message); console.log('  ok', message); };

(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
 const probe = await browser.newContext({ extraHTTPHeaders: { 'x-real-ip': '10.91.17.2' } });
 let ownerPassword = process.env.ADMIN_PASSWORD || 'e2e-owner-pass';
 let login = await probe.request.post(B + '/api/login', { data: { email: 'admin', password: ownerPassword } });
 if (!login.ok()) {
  ownerPassword = 'e2e-owner-pass-touch-2026';
  login = await probe.request.post(B + '/api/login', { data: { email: 'admin', password: ownerPassword } });
 }
 ok(login.ok(), 'owner test account is available');
 await probe.close();

 const owner = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'x-real-ip': '10.91.17.3' } });
 const page = await owner.newPage();
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.goto(B + '/admin');
 await page.fill('#e', 'admin'); await page.fill('#pw', ownerPassword); await page.click('#lbtn');
 const mustSetOwnerPassword = await page.waitForSelector('#pwform', { state: 'visible', timeout: 1500 }).then(() => true).catch(() => false);
 if (mustSetOwnerPassword) {
  const firstPassword = `Test-owner-${Date.now()}-pass!`;
  await page.fill('#fp-cur', ownerPassword); await page.fill('#fp-new', firstPassword); await page.fill('#fp-new2', firstPassword); await page.click('#pwform button.btn-dark');
  ownerPassword = firstPassword;
 }
 await page.waitForSelector('#app', { state: 'visible' });
 await page.click('#nav a[data-v="users"]'); await page.waitForSelector('#users-add-top');
 ok(await page.isVisible('#users-add-top'), 'System → Users has a clear Add user action');
 ok((await page.textContent('#view')).includes('Manage who can sign in'), 'Users page explains its purpose');

 const suffix = Date.now();
 const createUser = async (name, role) => {
  await page.click('#users-add-top');
  await page.fill('#u-name', name);
  await page.fill('#u-email', `${role}${suffix}@gothamconsult.com`);
  await page.selectOption('#u-role', role);
  await page.click('#u-add');
  await page.waitForSelector('#u-out .pwcard');
  const password = await page.locator('#u-out .pwshow code').textContent();
  ok(password.length >= 12, `owner creates a ${role} user and receives its one-time password`);
  return { email: `${role}${suffix}@gothamconsult.com`, password };
 };

 const admin = await createUser('Test Admin', 'admin');
 await page.click('#nav a[data-v="settings"]');
 await page.click('#view a[href="#users"]'); await page.waitForSelector('#users-add-top');
 ok(await page.isVisible('#users-add-top'), 'Settings provides a direct shortcut back to Users');
 const staff = await createUser('Test Staff', 'staff');

 const finishFirstPassword = async (email, password, nextPassword) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'x-real-ip': `10.91.18.${email.startsWith('admin') ? 3 : 4}` } });
  const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto(B + '/admin'); await p.fill('#e', email); await p.fill('#pw', password); await p.tap('#lbtn');
  await p.waitForSelector('#pwform');
  await p.fill('#fp-cur', password); await p.fill('#fp-new', nextPassword); await p.fill('#fp-new2', nextPassword); await p.tap('#pwform button.btn-dark');
  await p.waitForSelector('#app', { state: 'visible' });
  return { context: c, page: p, nextPassword };
 };

 const adminFlow = await finishFirstPassword(admin.email, admin.password, `Test-admin-${suffix}-pass!`);
 await adminFlow.page.click('#hamb'); await adminFlow.page.waitForSelector('#side.open');
 await adminFlow.page.click('#nav a[data-v="users"]'); await adminFlow.page.waitForSelector('#view .team');
 ok(!(await adminFlow.page.locator('#users-add-top').count()), 'admin can find Users but does not see owner-only Add user');
 ok((await adminFlow.page.textContent('#view')).includes('Only the owner can add users'), 'admin sees who can manage accounts');
 const forbidden = await adminFlow.page.evaluate(async () => (await fetch('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Should not exist', email: 'forbidden@example.test', role: 'staff' }) })).status);
 ok(forbidden === 401, 'server denies an admin attempt to add a user');

 const staffFlow = await finishFirstPassword(staff.email, staff.password, `Test-staff-${suffix}-pass!`);
 ok(!(await staffFlow.page.locator('#nav a[data-v="users"]').count()), 'staff navigation does not expose Users');
 const rosterStatus = await staffFlow.page.evaluate(async () => (await fetch('/api/users')).status);
 ok(rosterStatus === 403, 'server also blocks staff from reading team names and email addresses');
 await staffFlow.page.evaluate(() => { location.hash = '#users'; }); await staffFlow.page.waitForTimeout(200);
 ok((await staffFlow.page.evaluate(() => location.hash)) === '#dash', 'staff direct-link attempt is redirected out of Users');
 for (const f of [owner, adminFlow.context, staffFlow.context]) await f.close();
 await browser.close();
 if (errors.length) throw new Error('browser errors: ' + errors.join('; '));
 console.log('PASSED: Users workspace role and mobile flows');
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
