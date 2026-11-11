#!/usr/bin/env python3
"""Checks for the documentation foundation; not application/model validation."""
from __future__ import annotations
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
MIRRORS = ('AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'CURSOR.md', 'GEMINI.md')
REQUIRED = ('AI_SHARED_INSTRUCTIONS.md', *MIRRORS, 'README.md', 'NOTES.md',
    '.memory/architecture.md', '.memory/decisions.md', '.memory/todo.md', '.memory/glossary.md',
    'docs/PRODUCT.md', 'docs/DATA_SOURCES.md', 'docs/QUALITY.md', 'docs/ROADMAP.md',
    'docs/INHERITED_PRACTICES.md', '.codex/config.toml', '.gitignore', '.gitattributes',
    '.editorconfig', '.env.example', 'scripts/session-brief.sh',
    'scripts/sync-ai-instructions.sh', 'scripts/check-ai-instructions.sh')

def owned_file(relative):
    p = ROOT / relative
    return p.is_file() and not p.is_symlink() and all(not parent.is_symlink() for parent in p.parents if parent != ROOT.parent)

def check(ai_only=False):
    errors = []
    for name in (('AI_SHARED_INSTRUCTIONS.md', *MIRRORS) if ai_only else REQUIRED):
        if not owned_file(name):
            errors.append(f'Falta archivo normal local: {name}')
    source = ROOT / 'AI_SHARED_INSTRUCTIONS.md'
    if source.is_file() and not source.is_symlink():
        content = source.read_bytes()
        if len(content) > 20000:
            errors.append('El canon supera 20 KB: dividir referencias, no agrandar por defecto el contexto.')
        for name in MIRRORS:
            p = ROOT / name
            if p.is_file() and not p.is_symlink() and p.read_bytes() != content:
                errors.append(f'Copia IA diferente del canon: {name}')
    if not ai_only:
        config = ROOT / '.codex/config.toml'
        expected = {'approval_policy': 'on-request', 'approvals_reviewer': 'auto_review'}
        if config.is_file() and not config.is_symlink():
            try:
                import tomllib
                values = tomllib.loads(config.read_text())
                if values != expected:
                    errors.append('Config Codex: conservar las dos opciones de Auto Review, sin ampliar permisos ni fijar modelo.')
            except Exception as exc:
                errors.append(f'Config Codex no comprobada: {exc}')
        for name in REQUIRED:
            p = ROOT / name
            if p.is_file() and not p.is_symlink() and b'\r' in p.read_bytes():
                errors.append(f'Finales de línea distintos de LF: {name}')
        md_files = [ROOT / n for n in REQUIRED if n.endswith('.md')]
        pattern = re.compile(r'(?<!!)\[[^\]]+\]\(([^\s)]+)(?:\s+"[^"]*")?\)')
        for p in md_files:
            if not p.is_file() or p.is_symlink():
                continue
            for target in pattern.findall(p.read_text()):
                uri = urlsplit(target)
                if uri.scheme or target.startswith('#'):
                    continue
                dest = (p.parent / unquote(uri.path)).resolve()
                if not dest.is_relative_to(ROOT) or not dest.exists():
                    errors.append(f'Enlace local no portable o ausente: {p.relative_to(ROOT)} -> {target}')
    for error in errors:
        print('ERROR:', error, file=sys.stderr)
    if errors:
        return 1
    print('OK: instrucciones sincronizadas' if ai_only else 'OK: base documental, enlaces y configuración de Auto Review. App y modelos no evaluados.')
    return 0

def sync():
    source = ROOT / 'AI_SHARED_INSTRUCTIONS.md'
    if not owned_file('AI_SHARED_INSTRUCTIONS.md'):
        raise SystemExit('Canon ausente o ruta enlazada: no se escribe.')
    targets = [ROOT / name for name in MIRRORS]
    for p in targets:
        if p.is_symlink() or (p.exists() and not p.is_file()):
            raise SystemExit(f'Destino no regular: {p}')
    content = source.read_bytes()
    for p in targets:
        if not p.exists() or p.read_bytes() != content:
            p.write_bytes(content)
    return check(ai_only=True)

def brief():
    print('Proyecto:', ROOT.name)
    own_git = (ROOT / '.git').is_file() or (ROOT / '.git').is_dir()
    print('Git propio:', 'sí' if own_git else 'no inicializado; no se consulta el repositorio padre')
    if own_git:
        for args in (['status', '--short'], ['branch', '--show-current'], ['worktree', 'list']):
            r = subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, text=True)
            if r.returncode:
                print(r.stderr.strip(), file=sys.stderr)
                return r.returncode
            print(r.stdout.strip() or '(sin cambios)')
    print('Continuidad: NOTES.md y .memory/todo.md. Consultar las referencias según el cambio.')
    return 0

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sync-ai', action='store_true')
    parser.add_argument('--ai-only', action='store_true')
    parser.add_argument('--brief', action='store_true')
    args = parser.parse_args()
    if sum((args.sync_ai, args.ai_only, args.brief)) > 1:
        parser.error('Elegir una operación por llamada.')
    return sync() if args.sync_ai else brief() if args.brief else check(args.ai_only)

if __name__ == '__main__':
    raise SystemExit(main())
