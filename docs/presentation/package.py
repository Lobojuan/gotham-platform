"""Package reviewed Artifact Tool renders as screen PDFs and a trilingual browser presentation."""
import json
import os
import shutil
import subprocess
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

repo = Path(os.environ.get('GOTHAM_REPO', Path.cwd()))
workspace = Path(os.environ['PRESENTATION_WORKSPACE'])
stem = os.environ.get('PRESENTATION_OUTPUT_STEM', 'Gotham-services-screen')
copy = json.loads((repo / 'docs/presentation/copy.json').read_text())
public = repo / 'apps/site/public/downloads'
public.mkdir(parents=True, exist_ok=True)
for lang in copy:
    pdf = workspace / 'output' / f'Gotham-services-{lang}.pdf'
    c = canvas.Canvas(str(pdf), pagesize=(960, 540))
    c.setTitle('Gotham Consult services — ' + lang)
    c.setAuthor('Gotham Consult')
    for n in range(1, 6):
        c.drawImage(ImageReader(str(workspace / '.build' / lang / f'slide-{n}.png')), 0, 0, 960, 540)
        if n == 5:
            c.linkURL('https://gothamconsult.com/', (106.5, 64.5, 354, 312), relative=0)
            c.linkURL('https://www.linkedin.com/company/gotham-consult/', (566.25, 64.5, 813.75, 312), relative=0)
        c.showPage()
    c.save()
    shutil.copyfile(pdf, public / f'gotham-services-{lang}.pdf')
    shutil.copyfile(workspace / 'output' / f'{stem}-{lang}.pptx', public / f'gotham-services-{lang}.pptx')
    target = public / 'gotham-services' / lang
    target.mkdir(parents=True, exist_ok=True)
    node = os.environ['RUNTIME_NODE']
    for n in range(1, 6):
        subprocess.run([node, '-e', "const sharp=require(process.env.RUNTIME_NODE_MODULES+'/sharp');sharp(process.argv[1]).webp({lossless:true}).toFile(process.argv[2]);", str(workspace / '.build' / lang / f'slide-{n}.png'), str(target / f'slide-{n}.webp')], check=True)
template = (repo / 'docs/presentation/player.html').read_text()
(public / 'gotham-services.html').write_text(template.replace('__COPY__', json.dumps(copy, ensure_ascii=False)))
print('Published assets staged:', public)
