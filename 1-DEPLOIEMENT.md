# 1. Mettre l'application en ligne (GitHub Pages, gratuit)

À faire une seule fois, sur un ordinateur. Durée : environ 15 minutes.

Pourquoi : un iPad ne peut installer une application web que depuis une adresse Internet sécurisée (https). GitHub Pages en fournit une gratuitement. Seul le programme est mis en ligne. Vos stocks ne quittent jamais l'iPad.

## Étapes

1. Créer un compte gratuit sur https://github.com (adresse e-mail, mot de passe, nom d'utilisateur).
2. En haut à droite, bouton **+**, puis **New repository**.
   - Repository name : `congelateurs`
   - Visibilité : **Public** (obligatoire pour GitHub Pages avec un compte gratuit)
   - Cliquer sur **Create repository**.
3. Sur la page du dépôt vide, cliquer sur le lien **uploading an existing file**.
4. Décompresser l'archive `congelateurs.zip` sur l'ordinateur. Ouvrir le dossier `congelateurs`, sélectionner **tout son contenu** (les fichiers `index.html`, `sw.js`, `manifest.webmanifest`, `README.md` et tous les autres : il n'y a aucun sous-dossier) et le faire glisser dans la page. `index.html` doit se trouver à la racine du dépôt.
5. Attendre la fin du chargement, puis cliquer sur **Commit changes**.
6. Onglet **Settings** du dépôt, menu **Pages** (colonne de gauche).
   - Source : **Deploy from a branch**
   - Branch : **main**, dossier **/ (root)**, puis **Save**.
7. Patienter une à deux minutes, puis recharger la page : l'adresse du site s'affiche en haut, sous la forme
   `https://VOTRE-NOM.github.io/congelateurs/`
8. Ouvrir cette adresse sur l'ordinateur pour vérifier que l'accueil « Mes congélateurs » s'affiche.

L'intitulé exact des boutons de GitHub peut évoluer légèrement avec le temps.

## Remarques

- L'adresse est publique, mais chaque visiteur ne voit que **ses propres** données, stockées sur son appareil. Personne ne peut voir vos stocks.
- Connexion Internet nécessaire : pour la première ouverture sur l'iPad, et pour recevoir une mise à jour. Jamais pour l'usage quotidien.
- Alternatives équivalentes si vous préférez : Cloudflare Pages ou Netlify (hébergement statique gratuit). Les fichiers sont les mêmes.
