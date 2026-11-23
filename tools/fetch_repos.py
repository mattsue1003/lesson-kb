# 用法：python3 tools/fetch_repos.py repos.js（需要 git credential 裡的 GitHub token）
import json, subprocess, sys, concurrent.futures as cf, os
tok = subprocess.run(['git','credential','fill'], input='protocol=https\nhost=github.com\n\n', capture_output=True, text=True).stdout
tok = dict(l.split('=',1) for l in tok.splitlines() if '=' in l)['password']
L = json.load(open('links.json'))
names = sorted({l['url'].split('github.io/')[1].strip('/').split('/')[0] for v in L.values() for l in v if 'github.io/' in l['url']})
def get(path):
    r = subprocess.run(['curl','-sf','-H',f'Authorization: Bearer {tok}','-H','Accept: application/vnd.github+json', 'https://api.github.com'+path], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 else None
def one(n):
    repo = get(f'/repos/mattsue1003/{n}')
    if not repo: return n, None
    b = repo['default_branch']; t = get(f'/repos/mattsue1003/{n}/git/trees/{b}?recursive=1') or {}
    files = [{'p': x['path'], 's': x.get('size', 0)} for x in t.get('tree', []) if x['type'] == 'blob']
    return n, {'branch': b, 'files': files, 'private': repo['private']}
out = {}
with cf.ThreadPoolExecutor(8) as ex:
    for n, v in ex.map(one, names): out[n] = v
CODE = ('.html', '.htm', '.js', '.css', '.json', '.md', '.txt', '.csv', '.py', '.svg')
compact = {}
for n, v in out.items():
    if not v: continue
    f = [x for x in v['files'] if not x['p'].split('/')[-1].startswith('.')]
    code = [x for x in f if x['p'].lower().endswith(CODE) and not x['p'].startswith('node_modules/')]
    main = next((x for x in f if x['p'] == 'index.html'), None) or next((x for x in f if x['p'].endswith('.html')), None)
    compact[n] = {'b': v['branch'], 'm': main['p'] if main else '', 'ms': main['s'] if main else 0,
                  'n': len(f), 'nc': len(code), 'ts': sum(x['s'] for x in f)}
open(sys.argv[1], 'w', encoding='utf-8').write('// 由 tools/fetch_repos.py 產生：每個教案網頁的 GitHub 原始檔資訊\nwindow.KB_REPOS=' + json.dumps(compact, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(out), 'fail', [n for n,v in out.items() if not v])
