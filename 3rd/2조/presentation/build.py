#!/usr/bin/env python3
"""Build one offline HTML with CSS, JS, captured JSON and an OFL-licensed font."""
import base64
import json
import html as html_lib
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

def main():
    data = json.loads((HERE / 'data/demo.json').read_text())
    if data.get('format') != 'scl-presentation' or len(data.get('scenarios', [])) != 5:
        raise ValueError('Export and validate the presentation data first')
    font = (HERE / 'vendor/PretendardVariable.woff2').read_bytes()
    if not font.startswith(b'wOF2'):
        raise ValueError('Not a WOFF2 font')
    css = ((HERE / 'src/deck.css').read_text() + '\n' + (HERE / 'src/visuals.css').read_text()).replace('/*INLINE_FONT*/', base64.b64encode(font).decode())
    # Package the actual FE code and captured JSON into a network-disabled srcdoc.
    demo_js = (HERE / 'vendor/offline-demo.js').read_text().replace('</script', '<\\/script')
    demo_js = re.sub(r'(?m)^[ \t]+$', '', demo_js)
    demo_css = (HERE / 'vendor/offline-demo.css').read_text()
    demo_css = re.sub(r'@font-face\s*\{[^}]*\}', '', demo_css)
    demo_css = re.sub(r'(?m)^[ \t]+$', '', demo_css)
    demo_font = '@font-face{font-family:Pretendard;src:url(data:font/woff2;base64,' + base64.b64encode(font).decode() + ') format("woff2");font-weight:100 900}'
    demo_json = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    demo_document = (
        """<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>"""
        + demo_font + demo_css
        + '</style></head><body data-demo-stage="analysis"><div id="root"></div><script id="offline-demo-data" type="application/json">'
        + demo_json + '</script><script>' + demo_js + '</script></body></html>'
    )
    html = (HERE / 'src/deck.html').read_text()
    for token, value in {
        '/*INLINE_STYLE*/': css,
        '/*INLINE_DEMO_DOCUMENT*/': html_lib.escape(demo_document),
        '/*INLINE_DATA*/': json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c'),
        '/*INLINE_NOTES*/': json.dumps(json.loads((HERE / 'src/notes.json').read_text()), ensure_ascii=False).replace('<', '\\u003c'),
        '/*INLINE_SCRIPT*/': (HERE / 'src/deck.js').read_text() + '\n' + (HERE / 'src/visuals.js').read_text(),
        '/*FONT_LICENSE*/': (HERE / 'vendor/Pretendard-LICENSE.txt').read_text().replace('<', '&lt;'),
    }.items():
        if html.count(token) != 1:
            raise ValueError('Missing or duplicate build token: ' + token)
        html = html.replace(token, value)
    target = HERE / 'index.html'
    target.write_text(html)
    print(f'Built {target} ({target.stat().st_size:,} bytes)')

if __name__ == '__main__':
    main()
