import ast

lines = open('/home/z/audit/repos/saos-runtime/.github/workflows/grid-watchdog.yml').read().splitlines()
opens = [(i, l.strip().split("'")[1]) for i, l in enumerate(lines) if "python3 - <<'" in l]
print('opens:', [(i, t) for i, t in opens])
ok = 0
for oi, tag in opens:
    base = len(lines[oi]) - len(lines[oi].lstrip())
    end = None
    for j in range(oi + 1, len(lines)):
        if lines[j].rstrip("\n") == " " * base + tag:
            end = j
            break
    body = "\n".join(l[base:] if l.startswith(" " * base) else l for l in lines[oi + 1:end])
    try:
        ast.parse(body)
        ok += 1
        print(f'{tag}: OK ({end - oi - 1} lines)')
    except SyntaxError as e:
        print(f'{tag}: SYNTAX-FAIL line {e.lineno}: {e.msg}')
        bl = body.splitlines()
        if e.lineno and e.lineno <= len(bl):
            print('  →', bl[e.lineno - 1][:120])
print(f'python-blocks-ok={ok}/{len(opens)}')
