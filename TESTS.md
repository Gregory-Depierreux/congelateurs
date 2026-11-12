# Compte rendu des tests – 12 novembre 2026

## Ce qui a été réellement exécuté

Deux séries automatiques, toutes deux réussies :

1. `tests/scenario.test.js` – la logique de stock, avec une base IndexedDB simulée en mémoire. 20 vérifications.
2. `tests/navigateur.py` – l'application complète pilotée dans Google Chrome (ordinateur, fenêtre 1180 × 820, soit un iPad en paysage), en cliquant sur les vrais boutons. 19 vérifications, aucune erreur JavaScript.

| Étape du cahier des charges | Logique | Chrome |
| --- | --- | --- |
| 1. Créer l'article steak haché | réussi | réussi |
| 2. Ajouter 10 steaks en cuisine | réussi | réussi |
| 3. Ajouter 5 steaks en cave | réussi | réussi |
| 4. Stocks indépendants | réussi | réussi |
| 5. Ajouter 5 steaks en cuisine à une autre date | réussi | réussi |
| 6. Deux lots distincts | réussi | réussi |
| 7. Sortir 3 steaks de la cuisine | réussi | réussi |
| 8. Déduction sur le lot le plus ancien (7 + 5) | réussi | réussi |
| 9. Sortie supérieure au stock | réussi | réussi |
| 10. Opération refusée, stock inchangé | réussi | réussi |
| 11. Transférer 2 steaks cuisine → salle à manger | réussi | réussi |
| 12. Trois stocks après transfert (10 / 2 / 5) | réussi | réussi |
| 13. Historique de toutes les opérations | réussi | réussi |
| 14. Modifier manuellement une quantité | réussi | réussi |
| 15. Correction visible dans l'historique | réussi | réussi |
| 16. Fermer et rouvrir | simulé (base refermée) | réussi (Chrome fermé puis relancé) |
| 17. Persistance des données | simulé | réussi |
| 18. Exporter une sauvegarde | réussi | réussi (fichier téléchargé) |
| 19. Restaurer la sauvegarde | réussi | réussi |
| 20. Catalogue, lots et historique restaurés | réussi | réussi |

Vérifications supplémentaires réussies : doublon « STEAK hache » non créé, sortie répartie sur deux lots, annulation d'une sortie, d'une correction et d'un transfert, refus d'une quantité décimale pour une unité entière, refus d'une date d'entrée future, refus de supprimer un article ayant un historique, refus d'un fichier de sauvegarde modifié ou tronqué, rechargement de l'application hors connexion, affichage en portrait (820 px) et sur téléphone (390 px).

Anomalies trouvées et corrigées pendant les tests : boutons de confirmation bloqués par la protection contre les doubles appuis ; barre de recherche trop haute sur l'écran de sortie ; message de confirmation qui restait affiché après un changement d'écran ; réaffichages qui pouvaient se chevaucher.

## Ce qui n'a PAS été testé

Aucun test n'a été fait sur un iPad réel ni dans Safari. Restent à vérifier par vous, une fois l'application en ligne :

- [ ] Ajout à l'écran d'accueil depuis Safari et ouverture en plein écran.
- [ ] Ouverture en mode Avion après installation.
- [ ] Données toujours présentes après redémarrage de l'iPad.
- [ ] « Enregistrer une sauvegarde » : la fenêtre de partage propose bien « Enregistrer dans Fichiers ».
- [ ] « Choisir un fichier de sauvegarde » : le fichier se sélectionne bien depuis Fichiers / iCloud Drive.
- [ ] Confort tactile : taille des boutons, clavier numérique sur les quantités, sélecteur de date.

La mise en ligne sur GitHub Pages n'a pas été effectuée ni testée : elle nécessite votre compte.
