# Rétro-ingénierie fonctionnelle — Money Manager (Realbyte Inc.)

Analyse réalisée à partir de la fiche Play Store (4,6★, 459 k avis, plus de 15 M de téléchargements, « Choix de la rédaction ») et des écrans publics.
Il s'agit d'une **rétro-ingénierie fonctionnelle** : aucun code, aucune ressource graphique et aucune marque de Realbyte n'est réutilisé.
Kalpe reproduit les *fonctions* et les *parcours*, avec sa propre implémentation.

## 1. Architecture de l'information

| Money Manager | Kalpe | Statut |
|---|---|---|
| Barre du bas : Trans. / Stats / Comptes / Plus | Identique (`#bottomNav`) | ✅ |
| En-tête : ‹ mois › + favoris ☆ + recherche 🔍 + filtres | ‹ mois › + ☆ + ⌕ + glisser gauche/droite | ✅ (filtres avancés : à faire) |
| Sous-onglets Daily / Calendar / Weekly / Monthly / Total | Quotidien / Calendrier / Hebdo / Mensuel / Total | ✅ |
| Bandeau Revenus (bleu) / Dépenses (rouge) / Total | Identique | ✅ |
| Bouton flottant « + » rouge | Identique | ✅ |

## 2. Modèle de données déduit

```
Transaction { id, type: income|expense|transfer, date, amount,
              accountId, toAccountId (transfert), fee (frais de transfert),
              categoryId, note, description, createdAt }
Compte      { id, name, group: cash|bank|card|savings|invest|loan|other, initial }
Catégorie   { id, name, icon }   — listes séparées revenus / dépenses
Budget      { categoryId → montant mensuel }
Favori      { modèle de transaction réutilisable (sans date) }
Paramètres  { devise, décimales, jour de début du mois, début de semaine }
```

Points clés observés sur les captures :
- **Transferts** (« HIBD → HIBD Travel », « minimum fees ») : n'affectent pas revenus/dépenses mais déplacent le solde entre comptes ; les frais sont débités du compte source.
- **Jour de début de mois paramétrable** (utile si le salaire tombe le 25) : toutes les vues mensuelles s'y adaptent.
- **Ligne de transaction** : catégorie à gauche, note + compte au centre, montant coloré à droite ; en-tête de jour avec n° du jour, pastille du jour de semaine (samedi bleu, dimanche rouge), total du jour.

## 3. Fonctionnalités reproduites

- **Transactions** : saisie revenu / dépense / transfert, modification, suppression, **copie**, bouton **Continuer** (saisie en rafale), mise en **favori**.
- **Calendrier** : totaux par jour, sélection d'un jour, second appui = saisie à cette date.
- **Hebdo / Mensuel** : agrégats par semaine du mois et par mois de l'année (clic sur un mois → vue quotidienne).
- **Total** : suivi global du budget, répartition par compte, dépense moyenne/jour, export CSV du mois.
- **Stats** : anneau (donut) par catégorie avec %, détail par catégorie, **tendance sur 6 mois**.
- **Budget** : budget mensuel par catégorie, barre de progression, reste / dépassement.
- **Comptes** : groupes, soldes, actifs / passifs / patrimoine net, historique du mois par compte.
- **Plus** : devise (€, FCFA…), décimales, début du mois/semaine, gestion des catégories, export CSV compatible Excel FR (`;` + BOM UTF-8), sauvegarde/restauration JSON, données de démonstration.
- **PWA** : installable sur téléphone, fonctionne hors ligne, mode sombre automatique.

## 4. Écarts restants (feuille de route)

| Fonction Money Manager | Priorité | Commentaire |
|---|---|---|
| Sous-catégories | Moyenne | Ajouter `parentId` sur Catégorie |
| Transactions récurrentes / échéances | Haute | Générateur au démarrage |
| Cartes de crédit : date de relevé / paiement | Moyenne | Champs supplémentaires sur le compte |
| Code PIN / verrouillage | Moyenne | Web Crypto + chiffrement local |
| Photos de reçus | Basse | IndexedDB pour les pièces jointes |
| Multi-devises avec taux | Basse | |
| Synchronisation PC (Wi-Fi) / cloud | Moyenne | Backend optionnel |
| Filtres avancés dans la recherche | Basse | Par compte, catégorie, montant min/max |

## 5. Angle « Achats / entrepreneur »

Le modèle étant générique, Kalpe peut servir de journal de dépenses professionnelles : créer des comptes par entité (caisse, banque société, carte affaires), des catégories par famille d'achats, des budgets par famille, puis exporter en CSV vers Excel pour le contrôle de gestion.
