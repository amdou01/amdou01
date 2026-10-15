#!/usr/bin/env python3
"""Génère la page autonome de l'artefact Claude à partir des sources du dépôt.

Usage : python3 scripts/build-artifact.py <fichier-de-sortie.html>

L'artefact, l'application hébergée et le lanceur téléphone (telephone/kalpe-telephone.html)
partagent ainsi exactement le même code : index.html, src/styles.css, src/core.js, src/app.js.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main(out):
    idx = (ROOT / 'index.html').read_text(encoding='utf-8')
    body = idx.split('<body>', 1)[1].split('<script src="src/core.js">', 1)[0]
    css = (ROOT / 'src/styles.css').read_text(encoding='utf-8')
    core = (ROOT / 'src/core.js').read_text(encoding='utf-8')
    app = (ROOT / 'src/app.js').read_text(encoding='utf-8')
    page = (
        '<title>Kalpe Budget</title>\n<meta name="theme-color" content="#f04b4b">\n'
        f'<style>\n{css}\n</style>\n{body}\n'
        # Mode intégré : export affiché à copier, données d'exemple au premier lancement.
        '<script>window.KALPE_EMBED = true;</script>\n'
        f'<script>\n{core}\n</script>\n<script>\n{app}\n</script>\n'
    )
    pathlib.Path(out).write_text(page, encoding='utf-8')
    print(f'{out} ({len(page)} octets)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
