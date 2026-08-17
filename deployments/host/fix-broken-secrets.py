#!/usr/bin/env python3
"""ซ่อม data/git-apps-store.json: ลบ secret ที่เข้ารหัสเสีย (ciphertext ว่าง) ซึ่งทำให้
backend decrypt ไม่ผ่าน -> readAll() throw -> process ตาย -> crash-loop ทั้งสอง instance

รันด้วย user dup:  python3 fix-store.py [path/to/git-apps-store.json]
"""
import json, os, shutil, sys, time

PFX = 'v1:'
path = sys.argv[1] if len(sys.argv) > 1 else '/home/dup/gatekeeper/data/git-apps-store.json'


def broken(v):
    """ciphertext ที่ decryptSecret() จะ throw: มี prefix แต่ส่วนใดส่วนหนึ่งว่าง"""
    if not isinstance(v, str) or not v.startswith(PFX):
        return False
    parts = v[len(PFX):].split(':')
    return len(parts) != 3 or not all(parts)


apps = json.load(open(path))
removed = []

for a in apps:
    aid = a.get('id')

    if broken(a.get('webhookSecret')):
        removed.append(f'{aid}.webhookSecret')
        a.pop('webhookSecret', None)

    for field in ('envVars', 'buildArgs'):
        items = a.get(field)
        if not items:
            continue
        keep = []
        for e in items:
            if broken(e.get('value')):
                removed.append(f"{aid}.{field}[{e.get('key')}]")
            else:
                keep.append(e)
        a[field] = keep

    conns = a.get('addonConnections')
    if conns:
        keep = []
        for c in conns:
            if broken(c.get('url')):
                removed.append(f"{aid}.addonConnections[{c.get('type', '?')}]")
            else:
                keep.append(c)
        a['addonConnections'] = keep

if not removed:
    print('ไม่พบ secret ที่เสีย — ไม่แก้ไฟล์')
    sys.exit(0)

bak = f'{path}.bak-{time.strftime("%Y%m%d-%H%M%S")}'
shutil.copy2(path, bak)

tmp = path + '.tmp'
with open(tmp, 'w', encoding='utf8') as f:
    json.dump(apps, f, ensure_ascii=False, indent=2)
    f.write('\n')
shutil.copymode(path, tmp)
os.replace(tmp, path)

print(f'backup: {bak}')
for r in removed:
    print(f'ลบทิ้ง: {r}')
print(f'รวม {len(removed)} รายการ — systemd จะ restart backend เองใน ~5 วิ')
