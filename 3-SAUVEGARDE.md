# 3. Sauvegarder et restaurer

Les données sont enregistrées sur l'iPad à chaque opération : fermer l'application ou éteindre l'iPad ne fait rien perdre. La sauvegarde protège contre le reste : iPad perdu, cassé, remplacé, réinitialisé, ou icône supprimée par erreur.

Il n'existe **aucune sauvegarde automatique vers iCloud**. La sauvegarde se fait à la main, en trois gestes.

## Faire une sauvegarde

1. Accueil, bouton **Sauvegarde**.
2. Toucher **Enregistrer une sauvegarde**.
3. Dans la fenêtre de partage, choisir **Enregistrer dans Fichiers**, sélectionner **iCloud Drive** (créer par exemple un dossier « Congélateurs »), puis **Enregistrer**.

Le fichier s'appelle `congelateurs_AAAA-MM-JJ_HHhMM.json`. Il contient tout : catalogue, lots, historique complet et réglages. La date de la dernière sauvegarde s'affiche sur l'accueil et dans la rubrique Sauvegarde.

Si vous fermez la fenêtre de partage sans enregistrer, l'application indique que la sauvegarde a été abandonnée et ne change pas la date.

Rythme conseillé : une fois par mois, et après chaque gros rangement. Un bandeau jaune apparaît sur l'accueil quand la dernière sauvegarde a plus de 30 jours (délai réglable). Conservez plusieurs fichiers : ils sont très petits.

## Restaurer une sauvegarde

1. Accueil, **Sauvegarde**, puis **Choisir un fichier de sauvegarde…**
2. Sélectionner le fichier dans Fichiers.
3. L'application contrôle le fichier, puis affiche sa date et son contenu, à côté du contenu actuel.
4. Toucher **Remplacer mes données** pour confirmer, ou **Annuler**.

La restauration **remplace tout** : ce qui a été saisi après la sauvegarde est perdu. L'application vous avertit si c'est le cas.

## Protections

- Un fichier qui n'est pas une sauvegarde de l'application est refusé.
- Un fichier incomplet, abîmé ou modifié à la main est refusé (somme de contrôle, nombre d'enregistrements, cohérence entre lots et mouvements).
- En cas de refus, les données actuelles ne sont pas touchées.
- La restauration s'écrit en une seule fois : elle réussit entièrement ou pas du tout.

## Changer d'iPad

1. Ancien iPad : faire une sauvegarde dans iCloud Drive.
2. Nouvel iPad : installer l'application (guide 2), puis restaurer ce fichier.
