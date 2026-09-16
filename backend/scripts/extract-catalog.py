"""Read-only XLSX extraction using Python's standard library; preserves identifier strings."""
import argparse
import hashlib
import json
import posixpath
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
if args.source.resolve() == args.output.resolve():
    raise SystemExit('Source and output must differ')
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
headers = ['Группы', 'UUID', 'Код', 'Наименование', 'Внешний код', 'Артикул', 'Штрихкод EAN13']
keys = ['group', 'sourceUuid', 'sourceCode', 'name', 'externalCode', 'sku', 'barcodesRaw']
raw = args.source.read_bytes()
with zipfile.ZipFile(args.source) as book:
    workbook = ET.fromstring(book.read('xl/workbook.xml'))
    sheets = workbook.findall('m:sheets/m:sheet', ns)
    if len(sheets) != 1:
        raise SystemExit('Expected exactly one sheet; review workbook before import')
    rels = ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))
    rid = sheets[0].get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    target = next(x.get('Target') for x in rels if x.get('Id') == rid)
    sheet_path = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
    strings = []
    if 'xl/sharedStrings.xml' in book.namelist():
        for item in ET.fromstring(book.read('xl/sharedStrings.xml')).findall('m:si', ns):
            strings.append(''.join(x.text or '' for x in item.findall('.//m:t', ns)))
    rows = []
    for row in ET.fromstring(book.read(sheet_path)).findall('m:sheetData/m:row', ns):
        values = [None] * 7
        for cell in row:
            ref = cell.get('r', '')
            col = ''.join(c for c in ref if c.isalpha())
            if col not in list('ABCDEFG'):
                raise SystemExit('Unexpected column: ' + ref)
            if cell.find('m:f', ns) is not None:
                raise SystemExit('Formula in identifier source: ' + ref)
            value = cell.find('m:v', ns)
            value = value.text if value is not None else None
            if cell.get('t') == 's' and value is not None:
                value = strings[int(value)]
            elif cell.get('t') == 'inlineStr':
                value = ''.join(x.text or '' for x in cell.findall('.//m:t', ns))
            values[ord(col) - ord('A')] = value
        if int(row.get('r')) == 1:
            if values != headers:
                raise SystemExit('Unexpected column headers')
        elif any(v is not None for v in values):
            rows.append({'rowNumber': int(row.get('r')), **dict(zip(keys, values))})
result = {'sourceName': args.source.name, 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'rows': rows}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'rows': len(rows), 'sourceSha256': result['sourceSha256']}))
