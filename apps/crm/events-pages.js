/* Public event pages: /events (all of them) and /events/<slug> (one event, before and after it happens).
   Rendered on the server so Google reads the full page. The site build provides event-shell.html:
   the site's own header, footer, styles and scripts, with %%TITLE%% %%DESC%% %%OG%% %%HEAD%% %%BODY%% to fill. */
import fs from 'node:fs';
import path from 'node:path';

const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TZ = { timeZone: 'Africa/Accra' };
const day = d => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...TZ });
const shortDay = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...TZ });
const time = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...TZ });
const paras = t => String(t || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
/* the date under a photo only when it is the real date: a WhatsApp file name gives the day it was SENT */
const TRUE_DATE = new Set(['camera', 'video', 'manual', 'filename']);

export const isPast = i => i.phase === 'past' || (i.starts_at ? new Date(i.ends_at || i.starts_at) < Date.now() - 3 * 3600e3 : i.phase !== 'open' && i.phase !== 'teaser');
/* the web address: the slug set in the back office, else one made from the title */
export const slugOf = i => i.slug || String(i.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || i.code.toLowerCase();
export const eventUrl = (site, i) => `${site}/events/${encodeURIComponent(slugOf(i))}`;

let shellCache = { t: 0, html: null };
export function shell(siteDir) {
  const f = path.join(siteDir, 'event-shell.html');
  try { const t = fs.statSync(f).mtimeMs; if (t !== shellCache.t) shellCache = { t, html: fs.readFileSync(f, 'utf8') }; return shellCache.html; }
  catch { return null; }
}
export function fill(html, { title, desc, canon, og, head, body }) {
  return html
    .replace(/https?:\/\/[^"\s]*\/event-shell(?=")/g, canon)
    .replace(/https?:\/\/[^"\s]*\/%%OG%%/g, og)
    .split('%%TITLE%%').join(esc(title))
    .split('%%DESC%%').join(esc(desc))
    .replace('%%HEAD%%', head || '')
    .replace('%%BODY%%', () => body);
}

const cover = (i, size = 'hero') => i.cover_image && i.cover_image.sizes && (i.cover_image.sizes[size] || i.cover_image.sizes.card);
const pic = (s, alt, cls = '', lazy = true) => s ? `<picture${cls ? ` class="${cls}"` : ''}><source srcset="${esc(s.webp)}" type="image/webp"><img src="${esc(s.jpg)}" alt="${esc(alt)}" width="${s.w}" height="${s.h}"${lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high"'}></picture>` : '';

function card(site, i) {
  const past = isPast(i), c = cover(i, 'card'), n = (i.images || []).length;
  const vids = (i.images || []).filter(m => m.kind === 'video').length;
  return `<a class="evc${past ? ' past' : ''}" href="/events/${encodeURIComponent(slugOf(i))}">
    <div class="evc-img">${c ? pic(c, '') : '<span class="evc-ph"></span>'}${i.starts_at ? `<span class="evc-d"><b>${new Date(i.starts_at).toLocaleDateString('en-GB', { day: 'numeric', ...TZ })}</b>${new Date(i.starts_at).toLocaleDateString('en-GB', { month: 'short', ...TZ })}</span>` : ''}</div>
    <div class="evc-b"><span class="evc-k">${past ? 'Past event' : 'Upcoming'}${i.starts_at ? ' · ' + shortDay(i.starts_at) : ''}</span><b>${esc(i.title)}</b>
    ${i.venue ? `<span class="evc-v">${esc(i.venue)}</span>` : ''}
    ${past && n ? `<span class="evc-m">${n - vids ? `${n - vids} photos` : ''}${n - vids && vids ? ' · ' : ''}${vids ? `${vids} video${vids > 1 ? 's' : ''}` : ''}</span>` : ''}
    <span class="evc-go">${past ? 'See the photos' : 'Details and registration'} <span class="arrow">→</span></span></div></a>`;
}

export function indexPage(site, events) {
  const at = i => i.starts_at ? +new Date(i.starts_at) : Infinity;   // dates first, "date to follow" last
  const up = events.filter(i => !isPast(i)).sort((a, b) => at(a) - at(b) || String(a.title).localeCompare(b.title));
  const past = events.filter(isPast).sort((a, b) => (b.starts_at ? +new Date(b.starts_at) : 0) - (a.starts_at ? +new Date(a.starts_at) : 0));
  const body = `<section class="phero evp-top" aria-labelledby="h1"><div class="wrap">
    <nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/forums">Forums</a><span aria-hidden="true">/</span><span>Events</span></nav>
    <p class="eyebrow">Events</p><h1 id="h1">Gotham Consult events: <span class="serif">upcoming and past.</span></h1>
    <p class="lead">Forums, round tables and boot camps in Accra for business owners, investors and partners. Photos and videos from the ones that already happened.</p></div></section>
  <section class="sec"><div class="wrap">
    <div class="sec-head"><p class="eyebrow">Upcoming</p><h2>Coming up</h2></div>
    ${up.length ? `<div class="evc-grid">${up.map(i => card(site, i)).join('')}</div>` : '<p class="lead">New dates are announced soon. <a href="/forums#brief">Get the weekly brief</a> to hear first.</p>'}
  </div></section>
  ${past.length ? `<section class="sec" style="padding-top:0"><div class="wrap"><div class="sec-head"><p class="eyebrow">Past events</p><h2>Where we have been</h2></div>
    <div class="evc-grid">${past.map(i => card(site, i)).join('')}</div></div></section>` : ''}`;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Gotham Consult events', url: `${site}/events`,
    hasPart: events.map(i => ({ '@type': 'WebPage', name: i.title, url: eventUrl(site, i) })) };
  return { title: 'Events in Accra: Forums and Round Tables | Gotham Consult', desc: 'Upcoming Gotham Consult forums, round tables and boot camps in Accra, with photos and videos from past events for SMEs and investors in Ghana.',
    canon: `${site}/events`, body, head: `<script type="application/ld+json">${JSON.stringify(ld)}</script>` };
}

export function eventPage(site, i, others, opts = {}) {
  const past = isPast(i), url = eventUrl(site, i), hero = cover(i, 'hero');
  const media = (i.images || []).filter(m => m.kind !== 'video' || (m.status === 'ready' && m.url));
  const photos = media.filter(m => m.kind !== 'video'), videos = media.filter(m => m.kind === 'video');
  const reg = `/register?e=${encodeURIComponent(i.code)}`;
  const price = Number(i.price) ? `${i.currency || 'GHS'} ${Number(i.price).toLocaleString('en-GH')}` : 'Free';
  const facts = [
    i.starts_at && ['Date', day(i.starts_at)],
    i.starts_at && !past && ['Time', time(i.starts_at) + (i.ends_at ? '–' + time(i.ends_at) : '')],
    i.venue && ['Venue', i.venue],
    !past && ['Entry', price + (i.approval ? ' · by invitation' : '')]
  ].filter(Boolean);
  const share = encodeURIComponent(`${i.title}${i.starts_at && !past ? ' · ' + day(i.starts_at) : ''}\n${url}`);
  const mDate = m => m.taken_at && TRUE_DATE.has(m.date_source) ? shortDay(m.taken_at) : '';
  const cap = m => [m.caption, mDate(m)].filter(Boolean).map(esc).join(' · ');
  const gallery = !media.length ? '' : `<section class="sec" id="gallery" style="padding-top:0" aria-labelledby="g-h"><div class="wrap">
    <div class="sec-head split"><div><p class="eyebrow">${past ? 'Photos and video' : 'From the last one'}</p><h2 id="g-h">${past ? 'How it went.' : 'A look inside.'}</h2></div>
    <p class="lead">${[photos.length && `${photos.length} photo${photos.length > 1 ? 's' : ''}`, videos.length && `${videos.length} video${videos.length > 1 ? 's' : ''}`].filter(Boolean).join(' and ')}.${photos.length ? ' Tap a photo to see it large.' : ''}</p></div>
    ${videos.map(v => `<figure class="evp-vid${v.h > v.w ? ' tall' : ''}"><video controls playsinline preload="none" poster="${esc(v.sizes.poster ? v.sizes.poster.jpg : '')}" width="${v.w}" height="${v.h}"><source src="${esc(v.url)}" type="video/mp4"></video>${cap(v) ? `<figcaption>${cap(v)}</figcaption>` : ''}</figure>`).join('')}
    <div class="evp-gal">${photos.map((m, n) => { const s = m.sizes.card || m.sizes.thumb, big = m.sizes.hero || s;
      return `<figure><a href="${esc(big.jpg)}" data-lb="${n}" data-big="${esc(big.webp)}" data-cap="${cap(m)}">${pic(s, m.alt || m.caption || (i.title + ', photo ' + (n + 1)))}</a>${cap(m) ? `<figcaption>${cap(m)}</figcaption>` : ''}</figure>`; }).join('')}</div>
    <p class="fine" style="margin-top:12px">Photos and video: Gotham Consult. If you appear here and would rather not, <a href="mailto:info@gothamconsult.com?subject=${encodeURIComponent('Photo on ' + i.title)}">email us</a> and we remove it.</p>
  </div></section>
  <dialog class="lb" id="lb" aria-label="Photo"><button class="lb-x" type="button" aria-label="Close">✕</button><button class="lb-p" type="button" aria-label="Previous">‹</button><img alt=""><button class="lb-n" type="button" aria-label="Next">›</button><p></p></dialog>`;
  const speakers = (i.speakers || []).filter(s => s && s.name);
  const body = `<section class="evp-hero${hero ? '' : ' plain'}" aria-labelledby="h1">
    ${hero ? pic(hero, '', 'evp-bg', false) : ''}<div class="wrap">
    <nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/events">Events</a><span aria-hidden="true">/</span><span>${esc(i.title)}</span></nav>
    <p class="eyebrow">${past ? 'Past event' : i.approval ? 'Upcoming · by invitation' : 'Upcoming'}</p>
    <h1 id="h1">${esc(i.title)}</h1>
    ${i.subtitle || i.summary ? `<p class="lead">${esc(i.summary || i.subtitle)}</p>` : ''}
    ${facts.length ? `<dl class="evp-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${!past && i.starts_at ? `<div class="evp-cd" data-cd="${new Date(i.starts_at).toISOString()}" aria-label="Time until the event"><span><b data-d>–</b>days</span><span><b data-h>–</b>hours</span><span><b data-m>–</b>minutes</span></div>` : ''}
    <div class="evp-acts">${!past ? `<a class="btn btn-gold" href="${reg}">${i.approval ? 'Request your invitation' : 'Reserve your seat'} <span class="arrow">→</span></a>
      ${i.starts_at ? `<a class="btn btn-ghost" href="/cal/event/${encodeURIComponent(i.code)}.ics" download>Add to calendar</a>` : ''}` : media.length ? `<a class="btn btn-gold" href="#gallery">See the photos <span class="arrow">↓</span></a>` : ''}
      <a class="btn btn-ghost" href="https://wa.me/?text=${share}" target="_blank" rel="noopener">Share on WhatsApp</a></div>
  </div></section>
  <section class="sec evp-body"><div class="wrap evp-grid">
    <div class="evp-main prose">
      ${past && i.recap ? `<h2>What happened</h2>${paras(i.recap)}` : ''}
      ${i.description ? `${past && i.recap ? '<h2>About the event</h2>' : '<h2>About this event</h2>'}${paras(i.description)}` : ''}
      ${!i.description && !(past && i.recap) ? `<p class="lead">${past ? 'Photos and video from the day are below.' : 'Full programme and speakers are announced here soon.'}</p>` : ''}
    </div>
    <aside class="evp-side">
      ${(i.agenda || []).length ? `<div class="evp-box"><h3>Programme</h3><ol class="evp-ag">${i.agenda.map(a => `<li><span>${esc(a.time)}</span>${esc(a.what)}</li>`).join('')}</ol></div>` : ''}
      ${(i.documents || []).length ? `<div class="evp-box"><h3>Downloads</h3>${i.documents.map(d => `<a class="evp-doc" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label || d.name)} <small>PDF · ${d.kb} KB</small></a>`).join('')}</div>` : ''}
      <div class="evp-box"><h3>Questions?</h3><p>WhatsApp <a href="https://wa.me/233550416627">+233 55 041 6627</a> or <a href="mailto:info@gothamconsult.com">info@gothamconsult.com</a>.</p></div>
    </aside></div></section>
  ${speakers.length ? `<section class="sec" style="padding-top:0" aria-labelledby="s-h"><div class="wrap"><div class="sec-head"><p class="eyebrow">Speakers</p><h2 id="s-h">${past ? 'Who spoke.' : 'Who is speaking.'}</h2></div>
    <div class="evp-spk">${speakers.map(s => `<div class="evp-sp">${s.photo && s.photo.sizes.thumb ? pic(s.photo.sizes.thumb, s.name) : `<span class="evp-av">${esc(s.name.split(/\s+/).map(w => w[0]).slice(0, 2).join(''))}</span>`}<b>${esc(s.name)}</b><span>${esc(s.role || '')}</span></div>`).join('')}</div></div></section>`
    : !past ? `<section class="sec" style="padding-top:0"><div class="wrap"><div class="evp-box soon"><b>Speakers are announced here soon.</b> <a href="/forums#brief">Get the weekly brief</a> to hear first.</div></div></section>` : ''}
  ${gallery}
  ${others.length ? `<section class="sec" style="padding-top:0"><div class="wrap"><div class="sec-head"><p class="eyebrow">More events</p><h2>Also from Gotham</h2></div>
    <div class="evc-grid">${others.slice(0, 3).map(o => card(site, o)).join('')}</div><p style="margin-top:14px"><a href="/events">All events <span class="arrow">→</span></a></p></div></section>` : ''}
  <script>(function(){var c=document.querySelector('[data-cd]');if(c){var t=Date.parse(c.dataset.cd),q=function(s){return c.querySelector(s)};var f=function(){var s=Math.max(0,(t-Date.now())/1e3);q('[data-d]').textContent=Math.floor(s/86400);q('[data-h]').textContent=Math.floor(s%86400/3600);q('[data-m]').textContent=Math.floor(s%3600/60);if(s<=0)c.hidden=true};f();setInterval(f,3e4)}
  var lb=document.getElementById('lb');if(!lb||!lb.showModal)return;var as=[].slice.call(document.querySelectorAll('[data-lb]')),k=0,img=lb.querySelector('img'),p=lb.querySelector('p');
  var show=function(n){k=(n+as.length)%as.length;img.src=as[k].dataset.big;p.textContent=as[k].dataset.cap||''};
  as.forEach(function(a,n){a.addEventListener('click',function(e){e.preventDefault();show(n);lb.showModal()})});
  lb.querySelector('.lb-x').onclick=function(){lb.close()};lb.querySelector('.lb-p').onclick=function(){show(k-1)};lb.querySelector('.lb-n').onclick=function(){show(k+1)};
  lb.addEventListener('click',function(e){if(e.target===lb)lb.close()});document.addEventListener('keydown',function(e){if(!lb.open)return;if(e.key==='ArrowLeft')show(k-1);if(e.key==='ArrowRight')show(k+1)})})();</script>`;

  const org = { '@type': 'Organization', name: 'Gotham Consult', url: site };
  const img = [hero && hero.jpg, ...photos.slice(0, 5).map(m => (m.sizes.hero || m.sizes.card).jpg)].filter(Boolean);
  const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: site + '/' }, { '@type': 'ListItem', position: 2, name: 'Events', item: site + '/events' },
    { '@type': 'ListItem', position: 3, name: i.title, item: url }] }];
  if (i.starts_at) ld.push({ '@context': 'https://schema.org', '@type': 'Event', name: i.title, description: i.summary || i.subtitle || String(i.description || '').slice(0, 300),
    startDate: new Date(i.starts_at).toISOString(), ...(i.ends_at ? { endDate: new Date(i.ends_at).toISOString() } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: /online/i.test(i.venue || '') ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    location: /online/i.test(i.venue || '') ? { '@type': 'VirtualLocation', url } : { '@type': 'Place', name: i.venue || 'Accra', address: { '@type': 'PostalAddress', addressLocality: 'Accra', addressCountry: 'GH' } },
    ...(img.length ? { image: img } : {}), organizer: org, url,
    ...(!past ? { offers: { '@type': 'Offer', price: Number(i.price) || 0, priceCurrency: 'GHS', availability: 'https://schema.org/InStock', url: site + reg, validFrom: new Date(Date.now() - 864e5).toISOString().slice(0, 10) } } : {}) });
  const desc = (i.summary || i.subtitle || String(i.description || '').replace(/\s+/g, ' ').slice(0, 150) || `${past ? 'Photos and video from' : 'Register for'} ${i.title}, a Gotham Consult event in Accra.`).slice(0, 160);
  return { title: `${i.title}${i.starts_at ? ' · ' + shortDay(i.starts_at) : ''} | Gotham Consult`.slice(0, 110), desc, canon: url,
    og: (i.cover_image && i.cover_image.sizes.og && i.cover_image.sizes.og.jpg) || (hero && hero.jpg) || `${site}/img/og/forum.jpg`,
    head: ld.map(x => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n'), body };
}
