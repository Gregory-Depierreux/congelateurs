# Congélateurs

Application familiale de gestion du stock de trois congélateurs (cuisine, salle à manger, cave).
PWA installable sur iPad, sans serveur, sans compte, sans abonnement. Les données restent sur l'appareil.

Version 1.0.0 – novembre 2026.

## Contenu du dossier

| Fichier | Rôle |
| --- | --- |
| `index.html` | Page unique de l'application |
| `css/styles.css` | Apparence |
| `js/db.js` | Base de données locale (IndexedDB) : 5 tables |
| `js/stock.js` | Règles de stock : catalogue, entrées, sorties FIFO, transferts, corrections, annulation |
| `js/sauvegarde.js` | Export, contrôle et restauration d'une sauvegarde |
| `js/app.js` | Écrans et gestes |
| `sw.js` | Fonctionnement hors connexion |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil |
| `docs/` | Guides : déploiement, installation iPad, sauvegarde, utilisation |
| `tests/` | Scénario de test en 20 étapes (logique + navigateur) |

Aucune bibliothèque externe, aucune étape de compilation : les fichiers sont utilisés tels quels.

## Lancer l'application sur un ordinateur (essai)

Dans le dossier du projet :

    python3 -m http.server 8765

Puis ouvrir http://localhost:8765 dans un navigateur. Ne pas ouvrir `index.html` par double-clic : le mode hors connexion exige une adresse `http://localhost` ou `https://`.

Les données d'essai saisies sur l'ordinateur restent sur l'ordinateur. Elles n'apparaissent pas sur l'iPad.

## Mettre en ligne et installer

1. `docs/1-DEPLOIEMENT.md` : mise en ligne gratuite sur GitHub Pages (une seule fois).
2. `docs/2-INSTALLATION-IPAD.md` : ajout à l'écran d'accueil de l'iPad.
3. `docs/3-SAUVEGARDE.md` et `docs/4-UTILISATION.md`.

## Mettre l'application à jour

1. Modifier les fichiers voulus.
2. Dans `sw.js`, changer le numéro de `VERSION` (par exemple `congelateurs-v1.0.1`). Sans ce changement, les iPad gardent l'ancienne version en cache.
3. Remettre les fichiers en ligne.
4. Sur l'iPad, avec Internet : ouvrir l'application, la fermer, la rouvrir. La nouvelle version s'applique au deuxième lancement.

Une mise à jour remplace le code, jamais les données. Si la structure de la base doit changer, augmenter `VERSION_SCHEMA` dans `js/db.js` et ajouter un bloc de migration à l'endroit indiqué ; ne jamais supprimer une table existante.

## Structure des données

- `congelateurs` : id, nom, nom court, couleur, ordre.
- `articles` : id, nom, nom normalisé (unique, sans accents ni majuscules), catégorie, unité, remarque, archivé.
- `lots` : id, article, congélateur, date d'entrée, date de péremption, remarque, lot d'origine (transfert).
- `mouvements` : id, date et heure, type, opération, lot, article, congélateur, quantité signée, avant/après (corrections), opération annulée, remarque.
- `parametres` : seuil d'alerte, rappel de sauvegarde, date de dernière sauvegarde, dernier congélateur utilisé.

Aucune quantité n'est enregistrée : le stock d'un lot est la somme de ses mouvements. Un mouvement n'est jamais modifié ni supprimé.

## Tests

    npm install --no-save fake-indexeddb
    node tests/scenario.test.js          # logique, 20 étapes

    pip install playwright               # nécessite Google Chrome
    python3 -m http.server 8765 &
    python3 tests/navigateur.py          # même scénario en cliquant dans l'interface

État au 12/11/2026 : les deux séries passent sous Chrome (ordinateur, fenêtre aux dimensions d'un iPad). Voir `docs/TESTS.md` pour ce qui a été vérifié et ce qui reste à vérifier sur un iPad réel.
