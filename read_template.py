import zipfile, xml.etree.ElementTree as ET, re, sys

out = open('template_output.txt', 'w', encoding='utf-8')

with zipfile.ZipFile('Template.xlsx') as z:
    out.write('=== ZIP CONTENTS ===\n')
    for f in z.namelist():
        out.write(f + '\n')

    # shared strings
    strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        tree = ET.parse(z.open('xl/sharedStrings.xml'))
        root = tree.getroot()
        ns = root.tag.split('}')[0].strip('{') if '}' in root.tag else ''
        def tag(t): return '{'+ns+'}'+t if ns else t
        for si in root.findall(tag('si')):
            text = ''.join(t.text or '' for t in si.iter(tag('t')))
            strings.append(text)
        out.write(f'\n=== SHARED STRINGS ({len(strings)}) ===\n')
        for i,s in enumerate(strings):
            out.write(f'  [{i}] {s}\n')

    # workbook sheets
    wb_tree = ET.parse(z.open('xl/workbook.xml'))
    wb_root = wb_tree.getroot()
    ns2 = wb_root.tag.split('}')[0].strip('{') if '}' in wb_root.tag else ''
    def tag2(t): return '{'+ns2+'}'+t if ns2 else t
    sheets = wb_root.find(tag2('sheets'))
    sheet_list = [(s.get('name'), s.get('r:id') or s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')) 
                  for s in sheets.findall(tag2('sheet'))]
    out.write(f'\n=== SHEETS ===\n')
    for name, rid in sheet_list:
        out.write(f'  {name} (rid={rid})\n')

    # rels to find sheet files
    rels_tree = ET.parse(z.open('xl/_rels/workbook.xml.rels'))
    rels_root = rels_tree.getroot()
    rid_to_file = {}
    for rel in rels_root:
        rid_to_file[rel.get('Id')] = rel.get('Target')

    for sheet_name, rid in sheet_list:
        target = rid_to_file.get(rid, '')
        path = 'xl/' + target if not target.startswith('/') else target.lstrip('/')
        if path not in z.namelist():
            out.write(f'\nSheet {sheet_name}: file {path} not found\n')
            continue
        out.write(f'\n=== SHEET: {sheet_name} ===\n')
        ws_tree = ET.parse(z.open(path))
        ws_root = ws_tree.getroot()
        ns3 = ws_root.tag.split('}')[0].strip('{') if '}' in ws_root.tag else ''
        def tag3(t): return '{'+ns3+'}'+t if ns3 else t
        sd = ws_root.find(tag3('sheetData'))
        if sd is None:
            out.write('  (no sheetData)\n')
            continue
        for row in sd.findall(tag3('row')):
            rnum = row.get('r')
            cells = []
            for c in row.findall(tag3('c')):
                coord = c.get('r','')
                ctype = c.get('t','')
                v_el = c.find(tag3('v'))
                val = v_el.text if v_el is not None else ''
                if ctype == 's' and val:
                    val = strings[int(val)] if int(val) < len(strings) else val
                cells.append(f'{coord}={repr(val)}')
            out.write(f'  Row {rnum}: {", ".join(cells)}\n')

out.close()
print('Done')
