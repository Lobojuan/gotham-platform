"""Approved free speech locales: deterministic facts and native worker protocols."""
import io,json,os,re,subprocess,sys,types
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];os.chdir(ROOT/'apps/crm')
code=r'''
import assert from 'node:assert/strict';
import {paymentAnswer,timeAnswer,ratesAnswer,welcomeAnswer,unavailableAnswer} from './chat-knowledge.js';
const now=Date.UTC(2026,9,7,15,30),fx={updated:new Date(now).toISOString(),rates:{USD:10,EUR:11},more:{AED:2.72}};
for(const [l,p,t,r,native] of [
 ['de','Wie bezahle ich?','Wie spät ist es in Dubai?','Cedi Wechselkurs USD heute',/Überweisen|Zahlen|Uhrzeit|Markt|KI|Willkommen|Ich/],
 ['ar','كيف أدفع؟','كم الساعة في دبي؟','سعر الصرف سيدي دولار اليوم',/[\u0600-\u06ff]/],
 ['zh','如何付款？','迪拜现在几点？','美元塞地汇率今天',/[\u4e00-\u9fff]/]]) {
 const pay=paymentAnswer(p,l);assert.ok(pay?.includes('+233 55 041 6627'));assert.ok(native.test(pay));assert.ok(!pay.includes('WhatsApp'));
 const clock=timeAnswer(t,l,now);assert.ok(clock.includes('19:30')&&clock.includes('Asia/Dubai'));assert.ok(native.test(clock));
 const rates=ratesAnswer(r,l,fx,now);assert.ok(rates.includes('10')&&rates.includes('USD')&&rates.includes('https://open.er-api.com'));assert.ok(native.test(rates));
 const stale=ratesAnswer(r,l,fx,now+4*864e5);assert.notEqual(stale,rates);
 const unavailable=ratesAnswer(r,l,{},now);assert.ok(unavailable.includes('bog.gov.gh'));assert.ok(native.test(unavailable));
 assert.ok(native.test(welcomeAnswer(l)));assert.ok(native.test(unavailableAnswer(l)));
 console.log('  ok native deterministic welcome, payment, clock and fresh/stale/unavailable FX:',l);
}
'''
subprocess.run(['node','--input-type=module','-e',code],check=True)
calls=[]
class Kokoro:
 def __init__(self,*a,**k):self.tokenizer=types.SimpleNamespace(phonemize=lambda text,**kw:'english-phonemes')
 def create(self,text,**k):calls.append(('zh',text,k));return [0.1],24000
class G2P:
 def __init__(self,version,en_callable):assert version=='1.1';assert en_callable('Gotham Consult')=='english-phonemes'
 def __call__(self,text):print('diagnostics must not corrupt framing');return 'Chinese phonemes',None
class Samples:
 def __getitem__(self,index):return [0.1]
class Arabic:
 sample_rate=44100
 def __call__(self,text,lang,style,steps,speed):calls.append(('ar',lang,steps,speed));return Samples(),[types.SimpleNamespace(item=lambda:1)]
def sf_write(buf,*a,**k):buf.write(b'RIFF-fixture')
replacements={'kokoro_onnx':types.SimpleNamespace(Kokoro=Kokoro),'soundfile':types.SimpleNamespace(write=sf_write),'misaki':types.SimpleNamespace(zh=types.SimpleNamespace(ZHG2P=G2P)),'helper':types.SimpleNamespace(load_text_to_speech=lambda model:Arabic(),load_voice_style=lambda paths:object())}
saved={k:sys.modules.get(k) for k in replacements};saved_streams=(sys.stdin,sys.stdout,sys.argv);saved_env=dict(os.environ)
sys.modules.update(replacements)
try:
 os.environ.update(KOKORO_ZH_VOICES='test-voices',KOKORO_ZH_CONFIG='test-config',SUPERTONIC_STYLE='test-style')
 for lang,script in [('zh','ask-chinese.py'),('ar','ask-arabic.py')]:
  sys.argv=[script,'test-model'];sys.stdin=io.StringIO(json.dumps({'text':'Native payment','language':lang})+'\n'+json.dumps({'text':'wrong language','language':'en'})+'\n')
  output=io.BytesIO();sys.stdout=types.SimpleNamespace(buffer=output)
  exec(compile(Path(script).read_text(),script,'exec'),{'__file__':str(ROOT/'apps/crm'/script)})
  data=output.getvalue();assert data.startswith(b'READY\n');assert data.count(b'RIFF-fixture')==1;assert data.endswith(b'\0\0\0\0')
  assert len(data)==6+4+len(b'RIFF-fixture')+4
  sys.stdout=saved_streams[1];print('  ok native',lang,'worker keeps READY/WAV framing and rejects language mismatch')
 assert calls[0][2]['voice']=='zf_001' and calls[0][2]['is_phonemes'] is True
 assert calls[1]==('ar','ar',8,1.0)
finally:
 sys.stdin,sys.stdout,sys.argv=saved_streams;os.environ.clear();os.environ.update(saved_env)
 for k,old in saved.items():
  if old is None:sys.modules.pop(k,None)
  else:sys.modules[k]=old
models=json.loads(Path('voice-models.json').read_text())
assert all(len(x['sha256'])==64 and x['source'].startswith('https://') for x in models)
assert any(x['file'].startswith('de/') for x in models) and any(x['file'].startswith('zh/') for x in models) and any(x['file'].startswith('ar/') for x in models)
terms=(ROOT/'apps/site/legal/terms.html').read_text();credits=(ROOT/'apps/site/public/downloads/voice-credits.txt').read_text()
assert 'paragraph 5 and Attachment A' in terms and 'supertonic-model-license.txt' in terms and 'OpenRAIL-M' in credits
print('  ok pinned model provenance, synthetic speech notice and Arabic model licence terms')
# Native script, critical qualifiers and model licence remain visible in the page dictionaries.
for lang in ('de','ar','zh'):
 path=ROOT/'apps/site/public/assets/v2'/f'i18n-{lang}.js'
 text=path.read_text();dictionary=json.loads(text[text.index('= {')+2:text.rindex('}')+1])
 assert 'AI speech' in dictionary and 'Supertonic model licence (OpenRAIL-M)' in dictionary
 critical="We do not guarantee any investment outcome, approval, licence, permit or funding decision. No authority's decision is ours to promise."
 assert critical in dictionary and dictionary[critical]!=critical
 assert all(not re.search(r'\{\{N\d+\}\}',v) for v in dictionary.values())
 if lang=='ar':
  paragraph=dictionary['Under the BoG notice, foreign currency invoices are permitted only for expatriates and non-residents, and domestic contracts are listed among transactions that may not be priced in foreign currency. Price and invoice resident customers in cedis unless you hold a specific BoG licence.']
  assert 'ما لم' in paragraph and 'السيدي' in paragraph
 print('  ok native dictionary and unchanged legal qualifier:',lang)
# Regression guard for the visitor-facing partner tagline and official brand spelling.
taglines={
 'fr': ('Nous ne sommes pas un cabinet que l’on consulte une seule fois.','Nous sommes un partenaire auquel vous pouvez faire appel dans la durée.','Confiez-nous la mission','Mettre la rotation automatique en pause','Reprendre la rotation automatique'),
 'es': ('No somos una consultora a la que se acude una sola vez.','Somos un socio al que puede volver cuando lo necesite.','Encárguenos la misión','Pausar la rotación automática','Reanudar la rotación automática'),
 'de': ('Wir sind keine Beratung für eine einmalige Anfrage.','Wir sind ein Partner, auf den Sie langfristig zählen können.','Beauftragen Sie uns','Automatische Drehung pausieren','Automatische Drehung fortsetzen'),
 'ar': ('لسنا جهة استشارية تلجأ إليها لمرة واحدة فحسب.','نحن شريك يمكنك الاعتماد عليه والرجوع إليه كلما احتجت.','دعنا نتولى إنجازها','إيقاف التدوير التلقائي مؤقتًا','استئناف التدوير التلقائي'),
 'zh': ('我们不只是提供一次咨询服务。','更是您可以持续依靠的合作伙伴。','委托我们办理','暂停自动旋转','继续自动旋转'),
}
for lang,expected in taglines.items():
 path=ROOT/'apps/site/public/assets/v2'/f'i18n-{lang}.js'; source=path.read_text()
 dictionary=json.loads(source[source.index('= {')+2:source.rindex('}')+1])
 assert dictionary['Gotham Consult']=='Gotham Consult', f'{lang}: preserve official brand spelling'
 assert dictionary['Not a consultancy you phone once.']==expected[0], f'{lang}: natural tagline opening'
 assert dictionary['A place you keep coming back to.']==expected[1], f'{lang}: natural tagline close'
 assert dictionary['Have it done']==expected[2], f'{lang}: clear action label'
 assert dictionary['Pause auto-rotation']==expected[3], f'{lang}: pause control translation'
 assert dictionary['Resume auto-rotation']==expected[4], f'{lang}: resume control translation'
 if lang=='zh':
  assert not any('哥谭' in value or '迦纳' in value for value in dictionary.values()), 'zh: avoid city-name transliteration and traditional regional spelling in Simplified Chinese'
  law=next(value for key,value in dictionary.items() if key.startswith('A Minerals and Mining Bill, 2026'))
  assert '截至2026年10月1日，该法案尚未生效。' in law, 'zh: natural, unambiguous date and legal status'
  for key, expected in {
   'Ecofin Agency: Ghana trades capital controls for beneficial-ownership scrutiny (9 August 2026)': '（2026年8月9日）',
   'From 1 September 2026 the first GHS 588 of monthly pay is tax-free and the top rate is 35% above GHS 50,000 a month; non-residents pay a flat 25%.': '自2026年9月1日起',
   'Generally yes. Since 1 January 2026, suppliers of services must register for VAT regardless of turnover unless the Commissioner-General permits otherwise.': '自2026年1月1日起',
   "Gotham Consult's price list (excluding VAT), approved 6 October 2026: e.g. market entry from GHS 32,500, Investor Desk GHS 15,000 a month, Family Desk from GHS 2,400 a month.": '于2026年10月6日获批',
  }.items(): assert expected in dictionary[key], f'zh: localized date is day-month-year for {key[:45]}'
 print('  ok professional homepage copy and exact brand spelling:',lang)
carousel_copy={
 'fr': ('Choisissez une activité','La lettre Ghana Business Brief : les changements réglementaires, les financements disponibles et les rendez-vous à suivre. Gratuite, chaque semaine.'),
 'es': ('Elija un área de servicio','Ghana Business Brief: novedades normativas, financiación disponible y encuentros clave. Gratis, cada semana.'),
 'de': ('Fachbereich auswählen','Der Ghana Business Brief: aktuelle Regeländerungen, verfügbare Fördermittel und wichtige Veranstaltungen. Kostenlos, jede Woche.'),
 'ar': ('اختر مجالًا','نشرة Ghana Business Brief الأسبوعية: أبرز التغييرات في القواعد، وفرص التمويل المتاحة، والفعاليات المهمة. مجانًا كل أسبوع.'),
 'zh': ('选择服务领域','《加纳商业简报》：每周梳理政策变化、可用资金和重要行业活动。免费发布。'),
}
for lang,expected in carousel_copy.items():
 source=(ROOT/'apps/site/public/assets/v2'/f'i18n-{lang}.js').read_text()
 dictionary=json.loads(source[source.index('= {')+2:source.rindex('}')+1])
 assert dictionary['Choose a practice']==expected[0], f'{lang}: carousel selector is localized'
 brief='The Ghana Business Brief: what changed, what money is open, which rooms matter. Free, weekly.'
 assert dictionary[brief]==expected[1], f'{lang}: homepage weekly brief is localized'
 print('  ok homepage selector and weekly brief copy:',lang)
# Key investor terms and carousel guidance must not fall back to literal English.
finance_terms={
 'fr':('Plans d’affaires et modèles financiers à trois états (résultat, bilan et trésorerie)','Sur ordinateur : survolez une carte, puis cliquez sur celle de devant. Sur téléphone : faites glisser ou choisissez un domaine ci-dessus, puis touchez la carte de devant.'),
 'es':('Planes de negocio y modelos financieros de tres estados (resultados, balance y flujo de caja)','En ordenador: pase el cursor por una tarjeta y haga clic en la que quede delante. En móvil: deslice o elija un área arriba y toque la tarjeta delantera.'),
 'de':('Geschäftspläne und integrierte Finanzmodelle mit Gewinn- und Verlustrechnung, Bilanz und Cashflow','Am Computer: Zeigen Sie auf eine Karte und klicken Sie auf die vordere Karte. Auf dem Smartphone: Wischen Sie oder wählen Sie oben einen Bereich und tippen Sie auf die vordere Karte.'),
 'ar':('خطط الأعمال ونماذج مالية متكاملة تشمل قائمة الدخل والميزانية العمومية والتدفقات النقدية','على الكمبيوتر: مرّر المؤشر فوق بطاقة، ثم انقر البطاقة الأمامية. على الهاتف: اسحب أو اختر مجالًا أعلاه، ثم اضغط البطاقة الأمامية.'),
 'zh':('商业计划与三表财务模型（利润表、资产负债表和现金流量表）','电脑端：将鼠标移到卡片上，点击转到前方的卡片即可查看。手机端：左右滑动或点击上方服务领域，再点击前方卡片。'),
}
assert dictionary['Business plans & 3-statement models']==finance_terms[lang][0], f'{lang}: financial model term is precise'
assert dictionary['Point at a card and it turns to you. Click the one in front to open it.']==finance_terms[lang][1], f'{lang}: desktop and touch carousel guidance is clear'

# Arabic and Chinese page bodies use --font (not only --sans); shared chrome must
# load the corresponding web fonts and inherit the locale stack in its footer.
site_css=(ROOT/'apps/site/public/assets/v2/v2.css').read_text()
chrome_css=(ROOT/'apps/site/chrome_css.py').read_text()
build=(ROOT/'apps/site/build.py').read_text()
globe=(ROOT/'apps/site/public/assets/v2/globe.js').read_text()
assert 'html[lang="ar"]{--font:"Noto Sans Arabic"' in site_css
assert 'html[lang="zh"]{--font:"Noto Sans SC"' in site_css
assert '"Noto Sans Arabic"' in chrome_css and '"Noto Sans SC"' in chrome_css
assert 'footer.v2c.gf { font: inherit;' in chrome_css
assert 'family=Noto+Sans+Arabic' in build and 'family=Noto+Sans+SC' in build and 'family=Noto+Serif+SC' in build
assert "document.documentElement.lang" in globe and "localStorage.getItem('gc-language')" in globe
assert '"Noto Sans Arabic"' in globe and '"Noto Sans SC"' in globe
assert 'globe.js?v=8' in (ROOT/'apps/site/pages/index.html').read_text()
print('  ok Arabic/Chinese native-script fonts cover page bodies and shared chrome')
print('  ok globe card and canvas labels follow page locale with native-script fonts')
print('PASSED')
