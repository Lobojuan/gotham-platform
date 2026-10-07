"""Mark generated Arabic paragraphs RTL without changing their logical text order.

Artifact Tool preserves Arabic text but exposes alignment rather than paragraph
bidi direction. This narrow OOXML fix runs on the generated candidate before
package, geometry and import validation. Browser/PDF shaping is reviewed too.
"""
from pathlib import Path
import re,sys,zipfile,xml.etree.ElementTree as ET
p=Path(sys.argv[1]);ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
ET.register_namespace('a',ns['a'])
with zipfile.ZipFile(p) as source,zipfile.ZipFile(p.with_suffix('.rtl.pptx'),'w',zipfile.ZIP_DEFLATED) as target:
 for entry in source.infolist():
  data=source.read(entry.filename)
  if re.fullmatch(r'ppt/slides/slide\d+\.xml',entry.filename):
   root=ET.fromstring(data)
   for paragraph in root.findall('.//a:p',ns):
    text=''.join(n.text or '' for n in paragraph.findall('.//a:t',ns))
    if re.search(r'[\u0600-\u06ff]',text):
     prop=paragraph.find('a:pPr',ns)
     if prop is None:prop=ET.Element('{'+ns['a']+'}pPr');paragraph.insert(0,prop)
     prop.set('rtl','1');prop.set('algn','r')
   data=ET.tostring(root,encoding='utf-8',xml_declaration=True)
  target.writestr(entry,data)
p.with_suffix('.rtl.pptx').replace(p)
