# Kalpe Budget

Application web mobile (PWA) de gestion des dépenses, revenus, comptes et budgets, conçue par rétro-ingénierie fonctionnelle de **Money Manager** (Realbyte Inc.).
Voir l'analyse : [`docs/RETRO-INGENIERIE-MONEY-MANAGER.md`](docs/RETRO-INGENIERIE-MONEY-MANAGER.md).

## Fonctionnalités
- Saisie de revenus, dépenses et transferts entre comptes (avec frais)
- Vues **Quotidien, Calendrier, Hebdo, Mensuel, Total**
- **Statistiques** par catégorie (anneau + tendance sur 6 mois)
- **Budgets** mensuels par catégorie
- **Comptes** : soldes, actifs / passifs, patrimoine net
- Recherche, favoris, copie de transaction, saisie en rafale
- Export CSV (Excel FR), sauvegarde/restauration JSON
- Hors ligne, installable sur téléphone, mode sombre — données stockées localement

## Lancer
Aucune dépendance.
```bash
npm start          # http://localhost:8080
npm test           # tests unitaires de la logique métier (Node ≥ 18)
```
Le site peut aussi être publié tel quel sur GitHub Pages.

## Structure
```
index.html             coquille de l'application
src/core.js            logique métier pure (agrégats, soldes, budgets, CSV) — testée
src/app.js             interface (rendu, formulaires, navigation)
src/styles.css         styles (clair/sombre)
sw.js, manifest.webmanifest, icons/   PWA
tests/core.test.js     tests unitaires
telephone/             lanceur à installer sur le téléphone (mises à jour automatiques)
scripts/build-artifact.py  génère l'artefact Claude depuis les mêmes sources
```

## Sur le téléphone
Copiez `telephone/kalpe-telephone.html` sur le téléphone et ouvrez-le avec Chrome (Android) ou Safari (iPhone).
À chaque ouverture, il récupère la dernière version publiée ici ; hors connexion, il utilise la dernière version téléchargée.
Les données restent sur le téléphone : pensez à faire une sauvegarde (Plus › Sauvegarder) de temps en temps.
