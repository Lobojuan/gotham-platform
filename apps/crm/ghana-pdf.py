"""Read BoG's published PDF tables; discard the large PUBLIC watermark.
No PDF scripts are executed. JSON output contains only selected public numbers.
"""
import io, json, re, sys
import pdfplumber

def parse(raw):
    result = {}
    labels = {
        'Total Exports': 'exports', '... Gold Exports': 'gold',
        '... Cocoa Exports': 'cocoa', '... Oil Exports': 'oil',
        '... Other Exports': 'other', 'Trade Balance': 'tradeBalance',
        'Gross International Reserves (GIR)': 'reserves',
        'Monetary Policy Rate': 'policy', '91-Day Bill (interest equivalent)': 'treasury91',
        '... Agriculture (%)': 'agriculture', '... Industry (%)': 'industry',
        '... Services (%)': 'services',
    }
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        for page in pdf.pages:
            page = page.filter(lambda o: o.get('object_type') != 'char' or o['size'] < 20)
            words = page.extract_words(x_tolerance=1, y_tolerance=2)
            dates = [w for w in words if re.fullmatch(r'20\d{2}:\d{2}', w['text'])]
            if not dates: continue
            columns = sorted([(float(w['x0']+w['x1'])/2, w['text'].replace(':','-')) for w in dates])
            # A row's rightmost value must match a dated column, never a footnote.
            for line in (page.extract_text() or '').splitlines():
                for label, key in labels.items():
                    if not line.startswith(label+' '): continue
                    candidates = [w for w in words if re.fullmatch(r'-?\d[\d,]*\.\d+', w['text'])]
                    # Locate the label's first word, then the words on its baseline.
                    anchors = [w for w in words if not re.fullmatch(r'[\d.,:-]+', w['text'])]
                    for a in anchors:
                        row = sorted([w for w in words if abs(w['top']-a['top']) < 3], key=lambda w:w['x0'])
                        rowtext = ' '.join(w['text'] for w in row)
                        normalize = lambda s: re.sub(r'[^A-Za-z]', '', s)
                        if not normalize(rowtext).startswith(normalize(label)): continue
                        values=[]
                        for w in candidates:
                            if abs(w['top']-a['top']) >= 3: continue
                            center=(w['x0']+w['x1'])/2
                            col=min(columns, key=lambda c:abs(c[0]-center))
                            if abs(col[0]-center) > 16: continue
                            values.append((col[1],float(w['text'].replace(',',''))))
                        if not values: continue
                        period,value=max(values)
                        if key in ('exports','gold','cocoa','oil','other','tradeBalance','reserves'): value/=1000
                        result[key]={'value':value,'period':period,'unit':'USD bn' if key in ('exports','gold','cocoa','oil','other','tradeBalance','reserves') else '%'}
                        annual=[(p,v) for p,v in values if p.endswith('-12')]
                        if annual and key in ('exports','gold','cocoa','oil','other','tradeBalance'):
                            p,v=max(annual);result[key+'Annual']={'value':v/1000,'period':p[:4],'unit':'USD bn'}
                        break
    required=['exports','tradeBalance','reserves','policy','exportsAnnual','goldAnnual','cocoaAnnual','oilAnnual','otherAnnual']
    if any(k not in result for k in required): raise ValueError('BoG table format changed')
    if not (0<result['exports']['value']<200 and 0<result['policy']['value']<100): raise ValueError('BoG values out of range')
    if abs(sum(result[k+'Annual']['value'] for k in ('gold','cocoa','oil','other'))-result['exportsAnnual']['value'])>.01:
        raise ValueError('BoG exports do not reconcile')
    return result

if __name__=='__main__':
    try: print(json.dumps(parse(sys.stdin.buffer.read())))
    except Exception:
        print('BoG table could not be verified',file=sys.stderr);sys.exit(1)
