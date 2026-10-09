/* Gotham Consult · hero globe: the real Earth, turning.
   NASA Blue Marble by day, NASA city lights by night, and clouds. Day and night follow the
   sun's real position at this moment. Gold routes run from Accra to the cities our partners
   come from, and a card beside the globe tells you something about each: how far it is from
   Accra and what time it is there now.
   - Canvas 2D, no WebGL and no library: every pixel is looked up from the image, so it runs
     on any iPhone or Android browser. Only the turning changes per frame; everything else
     about each pixel (where it sits on the sphere, its shading) is worked out once.
   - Pictures load after the page is up; until then a dark globe with the routes is shown.
   - Smaller pictures and a lower frame rate on phones; stops when off screen or in a
     background tab; one still frame when the visitor prefers reduced motion. */
(() => {
  const canvas = document.getElementById('globe');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = () => innerWidth < 700;
  const rad = d => d * Math.PI / 180, TAU = Math.PI * 2;
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  const IMG = f => new URL('/img/earth/' + f, HERE).href;

  const ACCRA = [5.6, -0.19];
  /* [name, lat, lon, time zone, currency]: the main business cities of the world, all linked to Accra */
  const CITIES = [
    ['London', 51.5, -0.13, 'Europe/London', 'GBP'], ['Copenhagen', 55.68, 12.57, 'Europe/Copenhagen', 'DKK'], ['Berlin', 52.52, 13.4, 'Europe/Berlin', 'EUR'],
    ['Paris', 48.86, 2.35, 'Europe/Paris', 'EUR'], ['Amsterdam', 52.37, 4.9, 'Europe/Amsterdam', 'EUR'], ['Stockholm', 59.33, 18.07, 'Europe/Stockholm', 'SEK'],
    ['Zurich', 47.37, 8.54, 'Europe/Zurich', 'CHF'], ['Madrid', 40.42, -3.7, 'Europe/Madrid', 'EUR'], ['Istanbul', 41.01, 28.98, 'Europe/Istanbul', 'TRY'],
    ['Dubai', 25.2, 55.27, 'Asia/Dubai', 'AED'], ['Riyadh', 24.71, 46.68, 'Asia/Riyadh', 'SAR'], ['Mumbai', 19.08, 72.88, 'Asia/Kolkata', 'INR'],
    ['Singapore', 1.35, 103.82, 'Asia/Singapore', 'SGD'], ['Shanghai', 31.23, 121.47, 'Asia/Shanghai', 'CNY'], ['Hong Kong', 22.32, 114.17, 'Asia/Hong_Kong', 'HKD'],
    ['Tokyo', 35.68, 139.69, 'Asia/Tokyo', 'JPY'], ['Sydney', -33.87, 151.21, 'Australia/Sydney', 'AUD'],
    ['New York', 40.71, -74.0, 'America/New_York', 'USD'], ['Washington', 38.9, -77.04, 'America/New_York', 'USD'], ['Toronto', 43.65, -79.38, 'America/Toronto', 'CAD'],
    ['Houston', 29.76, -95.37, 'America/Chicago', 'USD'], ['São Paulo', -23.55, -46.63, 'America/Sao_Paulo', 'BRL'],
    ['Lagos', 6.52, 3.38, 'Africa/Lagos', 'NGN'], ['Abidjan', 5.36, -4.01, 'Africa/Abidjan', 'XOF'], ['Dakar', 14.72, -17.47, 'Africa/Dakar', 'XOF'],
    ['Casablanca', 33.57, -7.59, 'Africa/Casablanca', 'MAD'], ['Cairo', 30.04, 31.24, 'Africa/Cairo', 'EGP'], ['Nairobi', -1.29, 36.82, 'Africa/Nairobi', 'KES'],
    ['Kigali', -1.95, 30.06, 'Africa/Kigali', 'RWF'], ['Johannesburg', -26.2, 28.05, 'Africa/Johannesburg', 'ZAR']];
  const MOBILE_CITIES = ['London', 'Copenhagen', 'Paris', 'Dubai', 'New York', 'Shanghai', 'Tokyo', 'São Paulo', 'Johannesburg', 'Nairobi', 'Lagos', 'Singapore'];
  const LABEL = ['London', 'Copenhagen', 'Dubai', 'Mumbai', 'Singapore', 'Shanghai', 'Tokyo', 'Sydney', 'New York', 'Houston', 'São Paulo',
    'Dakar', 'Cairo', 'Nairobi', 'Johannesburg'];   // the rest sit too close to a neighbour to label all the time

  /* ---- words (the site's translator cannot see inside a canvas, so the card carries its own) ---- */
  // The route/page language is authoritative. A stale browser preference must not
  // make this canvas/card switch to (for example) Chinese on an Arabic URL.
  const lang = () => {
    const page = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
    if (['en', 'fr', 'es', 'de', 'ar', 'zh'].includes(page)) return page;
    try { const saved = localStorage.getItem('gc-language') || 'en'; return ['en', 'fr', 'es', 'de', 'ar', 'zh'].includes(saved) ? saved : 'en'; }
    catch { return 'en'; }
  };
  const T = {
    en: { km: 'km from Accra', local: 'Local time', same: 'same time as Accra', ahead: n => `${n} h ahead of Accra`, behind: n => `${n} h behind Accra`,
      route: 'Partner route', live: 'Live', f1t: 'Accra · 5.6°N, 0.2°W', f1: 'The capital closest to 0° 0°, where the Equator meets the Prime Meridian.',
      f2t: 'Accra time', f2: 'Ghana keeps GMT all year. No daylight saving, easy to plan calls from Europe.',
      f3t: 'Home of the AfCFTA Secretariat', f3: 'The African Continental Free Trade Area is run from Accra.',
      f4t: 'Real sunlight', f4: 'Day and night on this globe follow the sun right now. The lights are cities.',
      aria: 'The Earth turning a full circle, with day and night as they are now and routes from Accra to 30 business cities worldwide', next: 'Next',
      day: 'Daylight there now', night: 'Night there now', sunB: 'The point on Earth where the sun is straight overhead at this minute. It crosses the whole planet every 24 hours.', fx: n => `1 ${n} =`, sunAt: 'Sun overhead', cities: n => `${n} cities linked`, routes: 'of routes', gmt: 'GMT' },
    fr: { km: 'km d’Accra', local: 'Heure locale', same: 'même heure qu’Accra', ahead: n => `${n} h de plus qu’Accra`, behind: n => `${n} h de moins qu’Accra`,
      route: 'Route partenaire', live: 'En direct', f1t: 'Accra · 5,6°N, 0,2°O', f1: 'La capitale la plus proche de 0° 0°, où l’Équateur croise le méridien de Greenwich.',
      f2t: 'Heure d’Accra', f2: 'Le Ghana reste à l’heure GMT toute l’année, sans heure d’été : simple pour caler des appels depuis l’Europe.',
      f3t: 'Siège du Secrétariat de la ZLECAf', f3: 'La Zone de libre-échange continentale africaine est pilotée depuis Accra.',
      f4t: 'Lumière réelle', f4: 'Le jour et la nuit sur ce globe suivent le soleil en ce moment. Les lumières sont des villes.',
      aria: 'La Terre qui fait un tour complet, avec le jour et la nuit en ce moment et les routes depuis Accra', next: 'Suivant',
      day: 'Il fait jour là-bas', night: 'Il fait nuit là-bas', sunB: 'Le point de la Terre où le soleil est au zénith en ce moment. Il fait le tour de la planète en 24 heures.', fx: n => `1 ${n} =`, sunAt: 'Soleil au zénith', cities: n => `${n} villes reliées`, routes: 'de routes', gmt: 'GMT' },
    es: { km: 'km de Accra', local: 'Hora local', same: 'misma hora que Accra', ahead: n => `${n} h más que Accra`, behind: n => `${n} h menos que Accra`,
      route: 'Ruta de socios', live: 'En directo', f1t: 'Accra · 5,6°N, 0,2°O', f1: 'La capital más cercana a 0° 0°, donde el Ecuador cruza el meridiano de Greenwich.',
      f2t: 'Hora de Accra', f2: 'Ghana mantiene GMT todo el año, sin horario de verano: fácil para planificar llamadas desde Europa.',
      f3t: 'Sede de la Secretaría de la AfCFTA', f3: 'El Área de Libre Comercio Continental Africana se dirige desde Accra.',
      f4t: 'Luz real', f4: 'El día y la noche en este globo siguen al sol ahora mismo. Las luces son ciudades.',
      aria: 'La Tierra dando una vuelta completa, con el día y la noche de ahora y rutas desde Accra', next: 'Siguiente',
      day: 'Allí es de día', night: 'Allí es de noche', sunB: 'El punto de la Tierra donde el sol está en el cenit en este momento. Da la vuelta al planeta cada 24 horas.', fx: n => `1 ${n} =`, sunAt: 'Sol en el cenit', cities: n => `${n} ciudades conectadas`, routes: 'de rutas', gmt: 'GMT' } };
  Object.assign(T, {
    de:{km:'km von Accra',local:'Ortszeit',same:'gleiche Zeit wie in Accra',ahead:n=>`${n} Std. vor Accra`,behind:n=>`${n} Std. hinter Accra`,route:'Partnerverbindung',live:'Live',f1t:'Accra · 5.6°N, 0.2°W',f1:'Die Hauptstadt am nächsten bei 0° 0°, wo sich Äquator und Nullmeridian treffen.',f2t:'Uhrzeit in Accra',f2:'Ghana nutzt ganzjährig GMT ohne Sommerzeit. Das erleichtert die Planung von Gesprächen aus Europa.',f3t:'Sitz des AfCFTA-Sekretariats',f3:'Die Afrikanische Kontinentale Freihandelszone wird von Accra aus verwaltet.',f4t:'Aktuelles Sonnenlicht',f4:'Tag und Nacht auf diesem Globus folgen dem aktuellen Sonnenstand. Die Lichter zeigen Städte.',aria:'Die Erde dreht sich vollständig, mit aktuellem Tag und Nacht und Verbindungen von Accra zu 30 Wirtschaftsstädten weltweit',next:'Weiter',day:'Dort ist gerade Tag',night:'Dort ist gerade Nacht',sunB:'Der Punkt auf der Erde, an dem die Sonne gerade senkrecht steht. Er umrundet die Erde alle 24 Stunden.',fx:n=>`1 ${n} =`,sunAt:'Sonne im Zenit',cities:n=>`${n} verbundene Städte`,routes:'Verbindungen',regions:'Europa, Golfregion, Asien, Amerika und Afrika',gmt:'GMT'},
    ar:{km:'كم من أكرا',local:'الوقت المحلي',same:'نفس توقيت أكرا',ahead:n=>`متقدّم على أكرا بمقدار ${n} ساعات`,behind:n=>`متأخر عن أكرا بمقدار ${n} ساعات`,route:'مسار الشراكة',live:'مباشر',f1t:'أكرا · 5.6°N, 0.2°W',f1:'أقرب عاصمة إلى الإحداثيات 0° 0°، حيث يلتقي خط الاستواء بخط الطول الرئيسي.',f2t:'توقيت أكرا',f2:'تلتزم غانا بتوقيت GMT طوال العام، دون توقيت صيفي، مما يسهّل تنسيق المكالمات من أوروبا.',f3t:'مقر أمانة AfCFTA',f3:'تُدار منطقة التجارة الحرة القارية الأفريقية من أكرا.',f4t:'ضوء الشمس الفعلي',f4:'يتبع الليل والنهار على هذا المجسّم موقع الشمس الآن. وتمثّل الأضواء المدن.',aria:'الأرض تدور دورة كاملة، مع الليل والنهار الحاليين ومسارات من أكرا إلى 30 مدينة أعمال حول العالم',next:'التالي',day:'النهار الآن هناك',night:'الليل الآن هناك',sunB:'النقطة التي تكون الشمس عمودية فوقها في هذه اللحظة. وتدور حول الأرض كل 24 ساعة.',fx:n=>`1 ${n} =`,sunAt:'الشمس في سمت الرأس',cities:n=>`${n} مدينة متصلة`,routes:'من المسارات',regions:'أوروبا والخليج وآسيا والأمريكتان وأفريقيا',gmt:'GMT'},
    zh:{km:'公里，距阿克拉',local:'当地时间',same:'与阿克拉同一时间',ahead:n=>`比阿克拉早 ${n} 小时`,behind:n=>`比阿克拉晚 ${n} 小时`,route:'合作伙伴连线',live:'实时',f1t:'阿克拉 · 5.6°N, 0.2°W',f1:'最接近赤道与本初子午线交点（0° 0°）的首都。',f2t:'阿克拉时间',f2:'加纳全年使用 GMT，不实行夏令时，便于安排与欧洲的通话。',f3t:'AfCFTA 秘书处所在地',f3:'非洲大陆自由贸易区由阿克拉的秘书处负责管理。',f4t:'实时日照',f4:'地球上的昼夜按照太阳此刻的位置显示，灯光代表城市。',aria:'地球完整旋转一周，展示当前昼夜及阿克拉与全球 30 座商业城市的连线',next:'下一项',day:'当地现在是白天',night:'当地现在是夜晚',sunB:'此刻太阳直射地球的位置，每 24 小时绕地球一周。',fx:n=>`1 ${n} =`,sunAt:'太阳直射点',cities:n=>`连接 ${n} 座城市`,routes:'条连线',regions:'欧洲、海湾地区、亚洲、美洲和非洲',gmt:'GMT'}
  });
  const nativeCities={
   ar:['لندن','كوبنهاغن','برلين','باريس','أمستردام','ستوكهولم','زيورخ','مدريد','إسطنبول','دبي','الرياض','مومباي','سنغافورة','شنغهاي','هونغ كونغ','طوكيو','سيدني','نيويورك','واشنطن','تورونتو','هيوستن','ساو باولو','لاغوس','أبيدجان','داكار','الدار البيضاء','القاهرة','نيروبي','كيغالي','جوهانسبرغ'],
   zh:['伦敦','哥本哈根','柏林','巴黎','阿姆斯特丹','斯德哥尔摩','苏黎世','马德里','伊斯坦布尔','迪拜','利雅得','孟买','新加坡','上海','香港','东京','悉尼','纽约','华盛顿','多伦多','休斯敦','圣保罗','拉各斯','阿比让','达喀尔','卡萨布兰卡','开罗','内罗毕','基加利','约翰内斯堡']
  };
  const cityName=name=>name==='Accra'?({ar:'أكرا',zh:'阿克拉'})[lang()]||name:nativeCities[lang()]?.[CITIES.findIndex(row=>row[0]===name)]||name;
  T.fr.regions='Europe, Golfe, Asie, Amériques et Afrique'; T.es.regions='Europa, Golfo, Asia, Américas y África';
  const L = () => T[lang()] || T.en;
  const LOC = () => ({ fr: 'fr-FR', es: 'es-ES', de:'de-DE', ar:'ar-u-nu-latn', zh:'zh-CN' })[lang()] || 'en-GB';

  /* ---- geometry ---- */
  const vec = (lat, lon) => [Math.cos(rad(lat)) * Math.cos(rad(lon)), Math.cos(rad(lat)) * Math.sin(rad(lon)), Math.sin(rad(lat))];
  const km = (a, b) => { const [p1, l1] = a.map(rad), [p2, l2] = b.map(rad);
    const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
  function slerp(a, b, t) {
    const d = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), s = Math.sin(d) || 1;
    const k1 = Math.sin((1 - t) * d) / s, k2 = Math.sin(t * d) / s;
    return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2, d];
  }
  const arcs = CITIES.map(([name, lat, lon, tz, cur], i) => {
    const a = vec(...ACCRA), b = vec(lat, lon), d = slerp(a, b, 0)[3], steps = 56, path = [];
    for (let s = 0; s <= steps; s++) { const t = s / steps, p = slerp(a, b, t), h = 1 + Math.sin(Math.PI * t) * (0.04 + d * 0.075); path.push([p[0] * h, p[1] * h, p[2] * h]); }
    return { name, lat, lon, tz, cur, path, phase: i * 0.37, dist: Math.round(km(ACCRA, [lat, lon]) / 10) * 10 };
  });

  const GRID = [];
  for (let la = -60; la <= 60; la += 30) { const pts = []; for (let lo = -180; lo <= 180; lo += 6) pts.push(vec(la, lo)); GRID.push({ pts, key: la === 0 }); }
  for (let lo = -180; lo < 180; lo += 30) { const pts = []; for (let la = -84; la <= 84; la += 6) pts.push(vec(la, lo)); GRID.push({ pts, key: lo === 0 }); }
  /* The view: turn about the pole by lonC, then tip towards the viewer by TILT.
     x right, y up, z towards the viewer. */
  const TILT = rad(12), ca = Math.cos(TILT), sa = Math.sin(TILT);
  let lonC = rad(14);
  function view(p) {
    const cl = Math.cos(lonC), sl = Math.sin(lonC);
    const x1 = p[0] * cl + p[1] * sl, y1 = -p[0] * sl + p[1] * cl, z1 = p[2];
    return [y1, z1 * ca - x1 * sa, z1 * sa + x1 * ca];
  }

  /* ---- the sun, from the date and time (good to about a degree, plenty for day and night) ---- */
  let sD = 0, cD = 1, sunLon = 0, sunAt = 0;
  function sun(now) {
    if (now - sunAt < 30000 && sunAt) return; sunAt = now;
    const d = new Date(), start = Date.UTC(d.getUTCFullYear(), 0, 0), doy = (d - start) / 864e5;
    const decl = rad(-23.44 * Math.cos(TAU / 365.24 * (doy + 10)));
    const g = TAU / 365.24 * (doy - 81), eot = 9.87 * Math.sin(2 * g) - 7.53 * Math.cos(g) - 1.5 * Math.sin(g);   // minutes
    const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    sunLon = rad(-15 * (utcH - 12 + eot / 60)); sD = Math.sin(decl); cD = Math.cos(decl);
  }

  /* ---- pictures ---- */
  let tex = null;   // { day, night, cloud, TW, TH, CW, CH }
  const pixels = (img, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };
  const load = src => new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async'; i.onload = () => ok(i); i.onerror = no; i.src = src; });
  async function loadTextures() {
    const big = canvas.getBoundingClientRect().width * Math.min(2, devicePixelRatio || 1) > 620;
    try {
      const [d, n, c] = await Promise.all([load(IMG(big ? 'day-2k.webp' : 'day-1k.webp')), load(IMG(big ? 'night-2k.webp' : 'night-1k.webp')), load(IMG('clouds-1k.webp'))]);
      const TW = d.naturalWidth, TH = d.naturalHeight;
      tex = { day: pixels(d, TW, TH), night: pixels(n, TW, TH), cloud: pixels(c, 1024, 512), TW, TH, CW: 1024, CH: 512, born: performance.now() };
      sphere = null; draw(performance.now());
    } catch { /* keep the dark globe */ }
  }

  /* ---- the sphere as pixels: worked out once per size ---- */
  let sphere = null, sp = document.createElement('canvas'), spx = sp.getContext('2d');
  function buildSphere(S) {
    const n = S * S, idx = new Int32Array(n), uB = new Float32Array(n), row = new Int32Array(n), crow = new Int32Array(n),
      sLat = new Float32Array(n), cLat = new Float32Array(n), shade = new Float32Array(n), alpha = new Uint8ClampedArray(n);
    const { TW, TH, CW, CH } = tex; let k = 0; const r = S / 2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const X = (x + 0.5 - r) / r, Y = (r - y - 0.5) / r, q = X * X + Y * Y;
      if (q > 1.0 + 2 / r) continue;
      const Z = Math.sqrt(Math.max(0, 1 - q));
      const y1 = X, x1 = Z * ca - Y * sa, z1 = Y * ca + Z * sa;   // back to the Earth's own frame
      const lat = Math.asin(Math.max(-1, Math.min(1, z1))), lonRel = Math.atan2(y1, x1);
      idx[k] = (y * S + x) * 4;
      uB[k] = (lonRel + Math.PI) / TAU * TW;
      row[k] = Math.min(TH - 1, Math.floor((Math.PI / 2 - lat) / Math.PI * TH)) * TW;
      crow[k] = Math.min(CH - 1, Math.floor((Math.PI / 2 - lat) / Math.PI * CH)) * CW;
      sLat[k] = Math.sin(lat); cLat[k] = Math.cos(lat);
      shade[k] = 0.62 + 0.38 * Math.pow(Z, 0.55);                          // edge darkening
      alpha[k] = Math.max(0, Math.min(255, (1 - Math.sqrt(q)) * r * 255 + 255)); k++;
    }
    sp.width = S; sp.height = S;
    const img = spx.createImageData(S, S);
    const cosCol = new Float32Array(TW);
    return { S, k, idx, uB, row, crow, sLat, cLat, shade, alpha, img, cosCol };
  }
  let cloudLon = 0;
  function paintEarth(now) {
    const S = Math.max(160, Math.min(small() ? 380 : 700, Math.round(2 * R * dpr)));
    if (!sphere || sphere.S !== S) sphere = buildSphere(S);
    sun(now);
    const { k, idx, uB, row, crow, sLat, cLat, shade, alpha, img, cosCol } = sphere, buf = img.data;
    const { day, night, cloud, TW, CW } = tex;
    const du = lonC / TAU * TW, cdu = (lonC + cloudLon) / TAU * CW, cs = CW / TW;
    for (let u = 0; u < TW; u++) cosCol[u] = Math.cos((u + 0.5) / TW * TAU - Math.PI - sunLon);
    for (let i = 0; i < k; i++) {
      let u = uB[i] + du; u -= Math.floor(u / TW) * TW; const ui = u | 0;
      const d = sLat[i] * sD + cLat[i] * cD * cosCol[ui];
      let t = (d + 0.1) / 0.24; t = t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);           // soft line between day and night
      const light = (d > 0 ? Math.min(1.08, 0.3 + d * 1.1) : 0.3) * t;
      const o = (row[i] + ui) * 4;
      let cu = ui * cs + cdu; cu -= Math.floor(cu / CW) * CW;
      const c = cloud[(crow[i] + (cu | 0)) * 4] / 255 * 0.78;
      const nt = (1 - t) * 1.7, s = shade[i];
      const r = (day[o] * light + night[o] * nt), g = (day[o + 1] * light + night[o + 1] * nt), b = (day[o + 2] * light + night[o + 2] * nt);
      const cl = 245 * light + 14 * (1 - t);                                               // clouds: bright by day, faint by night
      const p = idx[i];
      buf[p] = (r * (1 - c) + cl * c) * s; buf[p + 1] = (g * (1 - c) + cl * c) * s; buf[p + 2] = (b * (1 - c) + (cl + 6) * c) * s + (1 - s) * 40;
      buf[p + 3] = alpha[i];
    }
    spx.putImageData(img, 0, 0);
    const fade = Math.min(1, (now - tex.born) / 700);
    ctx.globalAlpha = fade; ctx.drawImage(sp, cx - R, cy - R, 2 * R, 2 * R); ctx.globalAlpha = 1;
  }

  /* ---- drawing ---- */
  let W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1, last = 0, running = false, visible = true, spin = 0, dragX = null, dragLon = 0, moved = 0, focus = null;
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) * 0.41; cx = W / 2; cy = H / 2;
    draw(performance.now());
  }
  function draw(now) {
    const t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    // atmosphere
    const g = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.2);
    g.addColorStop(0, 'rgba(120,180,255,.38)'); g.addColorStop(0.35, 'rgba(90,150,240,.14)'); g.addColorStop(1, 'rgba(64,120,220,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, TAU); ctx.fill();
    if (!tex || (now - tex.born) < 700) {
      const b = ctx.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R);
      b.addColorStop(0, '#1C2E4A'); b.addColorStop(1, '#0A1424');
      ctx.fillStyle = b; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    }
    if (tex) paintEarth(now);
    // the grid of latitude and longitude; the Equator and Greenwich meet at 0° 0°, a short way off Accra
    ctx.lineWidth = 0.7;
    for (const gl of GRID) {
      ctx.strokeStyle = gl.key ? 'rgba(240,190,90,.42)' : 'rgba(170,205,255,.11)'; ctx.setLineDash(gl.key ? [3, 4] : []);
      ctx.beginPath(); let pen = false;
      for (const q of gl.pts) { const v = view(q); if (v[2] > 0.02) { const X = cx + v[0] * R, Y = cy - v[1] * R; pen ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); pen = true; } else pen = false; }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // routes
    const list = small() ? arcs.filter(a => MOBILE_CITIES.includes(a.name) || a === focus) : arcs;
    ctx.lineCap = 'round';
    for (const arc of list) {
      const P = arc.path.map(view), n = P.length - 1, on = arc === focus;
      ctx.lineWidth = on ? 2.2 : 1; ctx.strokeStyle = on ? 'rgba(244,198,106,.95)' : 'rgba(244,198,106,.3)';
      ctx.beginPath(); let pen = false;
      for (const p of P) { if (p[2] > 0 || p[0] * p[0] + p[1] * p[1] > 1.0005) {   /* in front, or lifted clear of the rim */ const X = cx + p[0] * R, Y = cy - p[1] * R; pen ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); pen = true; } else pen = false; }
      ctx.stroke();
      const head = reduce ? 1 : ((t * 0.28 + arc.phase) % 1.4) / 1.2;
      if (head > 0 && head <= 1.05) {
        const h = Math.min(n, Math.round(head * n)), tail = Math.max(0, h - 12);
        for (let k = tail; k < h; k++) {
          const p = P[k], q = P[k + 1]; if (!q || !(p[2] > 0 || p[0] * p[0] + p[1] * p[1] > 1.0005) || !(q[2] > 0 || q[0] * q[0] + q[1] * q[1] > 1.0005)) continue;
          ctx.strokeStyle = `rgba(150,245,215,${(k - tail) / 12})`; ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(cx + p[0] * R, cy - p[1] * R); ctx.lineTo(cx + q[0] * R, cy - q[1] * R); ctx.stroke();
        }
      }
      const end = P[n];
      if (end[2] > 0) {
        const X = cx + end[0] * R, Y = cy - end[1] * R, pulse = reduce ? .6 : (Math.sin(t * 2 + arc.phase * 9) + 1) / 2;
        ctx.fillStyle = `rgba(110,232,200,${.18 + pulse * .22})`; ctx.beginPath(); ctx.arc(X, Y, (on ? 5 : 3) + pulse * 5, 0, TAU); ctx.fill();
        ctx.fillStyle = on ? '#F4C66A' : '#6EE8C8'; ctx.beginPath(); ctx.arc(X, Y, on ? 3.2 : 2.3, 0, TAU); ctx.fill();
        if ((on || (!small() && LABEL.includes(arc.name))) && end[2] > .3) label(small() ? cityName(arc.name) : `${cityName(arc.name)} ${clockOf(arc.tz)}`, X + 8, Y + 4, on);
      }
    }
    // Accra
    const A = view(vec(...ACCRA));
    if (A[2] > 0) {
      const X = cx + A[0] * R, Y = cy - A[1] * R, p = reduce ? .5 : (Math.sin(t * 2.4) + 1) / 2;
      ctx.fillStyle = `rgba(240,190,90,${.2 + p * .25})`; ctx.beginPath(); ctx.arc(X, Y, 6 + p * 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#F4C66A'; ctx.beginPath(); ctx.arc(X, Y, 3.8, 0, TAU); ctx.fill();
      label(cityName('Accra'), X + 9, Y - 8, true);
    }
  }
  const clocks = {}; let clockAt = 0;
  function clockOf(tz) {   // local time, worked out once a minute rather than every frame
    const m = Math.floor(Date.now() / 60000); if (m !== clockAt) { clockAt = m; for (const k in clocks) delete clocks[k]; }
    return clocks[tz] ||= new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  }
  function label(text, x, y, strong) {
    const locale = lang();
    ctx.direction = locale === 'ar' ? 'rtl' : 'ltr'; ctx.textAlign = 'left';
    const font = locale === 'ar' ? '"Noto Sans Arabic","Geeza Pro",Arial,sans-serif'
      : locale === 'zh' ? '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
      : '"Hanken Grotesk",system-ui,sans-serif';
    ctx.font = `${strong ? 700 : 500} ${strong ? 12 : 11}px ${font}`;
    const tw = ctx.measureText(text).width; if (x + tw > W - 4) x = x - tw - 16;   // near the right edge: write it on the left of the dot
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,10,20,.75)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = strong ? '#fff' : 'rgba(225,235,248,.9)'; ctx.fillText(text, x, y);
  }

  /* ---- turning ---- */
  const SPEED = TAU / 48;           // a full 360° turn every 48 seconds, west to east like the real thing
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    if (now - last >= (small() ? 40 : 30) || !last) {        // about 25 frames a second on phones, 33 on computers
      if (dragX === null) { spin *= 0.94; lonC -= (SPEED + spin) * Math.max(dt, 0.016) ; }
      cloudLon += 0.004 * dt;
      last = now; draw(now);
    }
    requestAnimationFrame(loop);
  }
  function setRunning(on) {
    on = on && !reduce && visible && !document.hidden;
    if (on === running) return;
    running = on; last = 0; if (on) requestAnimationFrame(loop);
  }
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(e => { visible = e[0].isIntersecting; setRunning(true); }).observe(canvas);
  document.addEventListener('visibilitychange', () => setRunning(true));
  // drag to spin it (a sideways swipe on phones; up and down still scrolls the page)
  canvas.addEventListener('pointerdown', e => { dragX = e.clientX; dragLon = lonC; moved = 0; spin = 0; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (dragX === null) return;
    const nl = dragLon - (e.clientX - dragX) / (R * 1.1); spin = (lonC - nl) * 8; lonC = nl; moved += Math.abs(e.movementX || 1);
    if (!running) draw(performance.now());
  });
  const up = () => { if (dragX !== null && moved < 4) card(1); dragX = null; spin = Math.max(-1.5, Math.min(1.5, spin)); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', () => { dragX = null; });

  const total = arcs.reduce((n, a) => n + a.dist, 0);
  /* ---- the card: one thing worth knowing, every few seconds ---- */
  const wrap = canvas.parentElement, box = document.createElement('div');
  box.className = 'globe-card'; box.setAttribute('aria-live', 'polite'); box.setAttribute('translate', 'no');
  wrap.appendChild(box); wrap.querySelector('.globe-tag')?.remove();
  const tzDiff = tz => { try {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(x => x.type === 'timeZoneName').value;
      const m = p.match(/GMT([+-]\d+)(?::(\d+))?/); return m ? (+m[1]) + (m[2] ? Math.sign(+m[1]) * (+m[2]) / 60 : 0) : 0;
    } catch { return null; } };
  const clock = tz => new Date().toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const facts = () => { const w = L(); return [
    { t: lang()==='ar' ? `${cityName('Accra')} · <bdi dir="ltr">5.6°N, 0.2°W</bdi>` : w.f1t, b: w.f1 },
    { t: `${w.f2t} · ${clock('Africa/Accra')}`, b: w.f2, live: true },
    { t: w.f3t, b: w.f3 },
    { t: w.f4t, b: w.f4, live: true },
    (() => { sun(performance.now()); const sl = Math.asin(sD) * 180 / Math.PI, so = ((sunLon * 180 / Math.PI + 540) % 360) - 180;
      const deg = (v, p, n) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? p : n}`;
      return { t: `${w.sunAt} · ${deg(sl, 'N', 'S')}, ${deg(so, 'E', 'W')}`, b: w.sunB, live: true }; })(),
    { t: w.cities(arcs.length), b: `${Math.round(total / 1000).toLocaleString(LOC())} 000 km ${w.routes}: ${w.regions || 'Europe, the Gulf, Asia, the Americas and Africa'}.` }]; };
  const order = []; { const f = [0, 1, 5, 4, 2, 3], c = arcs.map((_, i) => i); let a = 0, b = 0; while (a < f.length || b < c.length) { if (b < c.length) order.push(['c', c[b++]]); if (b < c.length) order.push(['c', c[b++]]); if (a < f.length) order.push(['f', f[a++]]); } }
  let at = -1, cardTimer = 0;
  function card(step) {
    at = (at + step + order.length) % order.length;
    const [kind, i] = order[at], w = L(); let html;
    if (kind === 'c') {
      const a = arcs[i]; focus = a;
      const d = tzDiff(a.tz), diff = d === null ? '' : d === 0 ? w.same : d > 0 ? w.ahead(String(d)) : w.behind(String(-d));
      sun(performance.now());
      const up = Math.sin(rad(a.lat)) * sD + Math.cos(rad(a.lat)) * cD * Math.cos(rad(a.lon) - sunLon) > 0;
      const fx = RATES && (RATES[a.cur] || (RATES.more || {})[a.cur]);
      html = `<p class="gc-k">${w.route}</p><p class="gc-t">${cityName(a.name)}</p>
        <p class="gc-b"><b>${a.dist.toLocaleString(LOC())}</b> ${w.km}</p>
        <p class="gc-b">${w.local} <b>${clock(a.tz)}</b>${diff ? ' · ' + diff : ''}</p>
        <p class="gc-b"><span class="gc-sun ${up ? 'd' : 'n'}" aria-hidden="true"></span>${up ? w.day : w.night}${fx ? ` · ${w.fx(a.cur)} <b><bdi dir="ltr">GHS ${fx.toLocaleString(LOC(), { maximumFractionDigits: fx < 1 ? 4 : 2 })}</bdi></b>` : ''}</p>`;
    } else {
      focus = null; const f = facts()[i];
      html = `<p class="gc-k">${f.live ? `<span class="gc-live"></span>${w.live}` : cityName('Accra')}</p><p class="gc-t">${f.t}</p><p class="gc-b">${f.b}</p>`;

    }
    box.innerHTML = html + `<button type="button" class="gc-next" aria-label="${w.next}">›</button>`;
    box.querySelector('.gc-next').addEventListener('click', e => { e.stopPropagation(); card(1); restart(); });
    canvas.setAttribute('aria-label', w.aria);
    box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
    if (!running) draw(performance.now());
  }
  /* glide towards the featured place, then carry on turning */
  let target = null;
  const glide = () => {
    if (target !== null && dragX === null && !reduce) {
      let d = ((target - lonC) % TAU + TAU * 1.5) % TAU - Math.PI;
      if (Math.abs(d) < 0.01) target = null; else lonC += d * 0.06;
    } else if (reduce && target !== null) { lonC = target; target = null; draw(performance.now()); }
    requestAnimationFrame(glide);
  };
  const restart = () => { clearInterval(cardTimer); cardTimer = setInterval(() => { if (visible && !document.hidden) card(1); }, 6500); };
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setTimeout(() => card(0), 120)));

  /* ---- the live strip over the globe: Accra's clock, where the sun is overhead right now, the routes, the cedi ---- */
  let RATES = null;
  fetch('/api/rates').then(r => r.json()).then(j => { if (j && j.rates) { RATES = { ...j.rates, more: j.more || {} }; hud(); if (focus) card(0); } }).catch(() => {});
  const hudBox = document.createElement('div'); hudBox.className = 'globe-hud'; hudBox.setAttribute('translate', 'no'); wrap.appendChild(hudBox);
  function hud() {
    sun(performance.now()); const w = L();
    hudBox.innerHTML = `<span class="gh-live"><i></i>${cityName('Accra')} <b>${clock('Africa/Accra')}</b> ${w.gmt}</span>
      ${RATES ? `<span class="gh-fx">GHS <b>$${RATES.USD.toFixed(2)}</b> <b>€${RATES.EUR.toFixed(2)}</b> <b>£${RATES.GBP.toFixed(2)}</b></span>` : ''}`;

  }
  hud(); setInterval(() => { if (visible && !document.hidden) hud(); }, 30000);
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setTimeout(hud, 120)));

  resize(); setRunning(true); card(1); restart(); glide();
  const go = () => loadTextures();
  if (document.readyState === 'complete') setTimeout(go, 200); else addEventListener('load', () => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 300)), { once: true });
})();
