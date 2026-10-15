# Kalpe Budget — consignes pour Claude

## Une seule source de code
`index.html`, `src/styles.css`, `src/core.js`, `src/app.js` alimentent trois sorties :
1. l'application web (PWA) servie depuis le dépôt ;
2. l'artefact Claude « Kalpe Budget » (https://claude.ai/artifact/MDSkk3VGaTpahMkrjqgNZZ), généré par
   `python3 scripts/build-artifact.py <sortie.html>` ;
3. le lanceur téléphone `telephone/kalpe-telephone.html`, qui télécharge à chaque ouverture le dernier
   commit de la branche par défaut (API GitHub + jsDelivr) et le garde en cache hors connexion.

## Règle de synchronisation
Toute modification de l'artefact passe par les sources ci-dessus, jamais par l'artefact seul :
modifier les sources → `npm test` → commit + push sur la branche par défaut → régénérer l'artefact avec
le script et le republier à la même URL. Le téléphone reçoit alors la mise à jour à sa prochaine ouverture.

## Données personnelles
Le dépôt est public : n'y commitez jamais de données financières réelles (exports, sauvegardes JSON).
