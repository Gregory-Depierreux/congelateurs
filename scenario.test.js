/* Scénario de test obligatoire (20 étapes) sur la logique de stock.
 * Lancement : npm install --no-save fake-indexeddb && node scenario.test.js
 * IndexedDB est simulée en mémoire : la persistance réelle (étapes 16-17)
 * est vérifiée dans un vrai navigateur par tests/navigateur.py. */
require('fake-indexeddb/auto');
const assert = require('assert');
const path = require('path');
['db', 'stock', 'sauvegarde'].forEach((f) => require(path.join(__dirname, f + '.js')));
const { DB, Stock, Sauvegarde } = globalThis;

let n = 0;
const ok = (texte) => console.log('  ok ' + String(++n).padStart(2, ' ') + ' - ' + texte);
const qte = (S, cong, articleId) => (Stock.vueCongelateur(S, cong).find((v) => v.article.id === articleId) || { quantite: 0 }).quantite;
const refuse = async (p, motif) => { await assert.rejects(p, (e) => e instanceof Stock.ErreurStock && (!motif || motif.test(e.message))); };

(async () => {
  // 1. Créer l'article
  const steak = await Stock.creerArticle({ nom: 'Steak haché', categorie: 'Viande', unite: 'pièce' });
  let S = await Stock.charger();
  assert.strictEqual(S.articles.length, 1);
  await refuse(Stock.creerArticle({ nom: '  STEAK  hache ', unite: 'pièce' }), /existe déjà/);
  ok('article « Steak haché » créé ; doublon « STEAK hache » refusé');

  // 2-3. Entrées cuisine et cave
  await Stock.entree({ congelateurId: 'cuisine', articleId: steak.id, quantite: 10, dateEntree: '2026-11-10', datePeremption: '2027-05-10' });
  ok('10 steaks ajoutés en cuisine');
  await Stock.entree({ congelateurId: 'cave', articleId: steak.id, quantite: 5, dateEntree: '2026-11-10' });
  ok('5 steaks ajoutés en cave');

  // 4. Stocks indépendants
  S = await Stock.charger();
  assert.deepStrictEqual([qte(S, 'cuisine', steak.id), qte(S, 'salle', steak.id), qte(S, 'cave', steak.id)], [10, 0, 5]);
  ok('stocks indépendants : cuisine 10, salle à manger 0, cave 5');

  // 5-6. Deuxième lot en cuisine, autre date
  await Stock.entree({ congelateurId: 'cuisine', articleId: steak.id, quantite: 5, dateEntree: '2026-11-12', datePeremption: '2027-05-12' });
  ok('5 steaks ajoutés en cuisine à une autre date');
  S = await Stock.charger();
  let lots = Stock.lotsActifs(S, steak.id, 'cuisine');
  assert.deepStrictEqual(lots.map((l) => [l.lot.dateEntree, l.reste]), [['2026-11-10', 10], ['2026-11-12', 5]]);
  assert.strictEqual(qte(S, 'cuisine', steak.id), 15);
  ok('deux lots distincts en cuisine (10 + 5), total 15');

  // 7-8. Sortie FIFO
  await Stock.sortie({ congelateurId: 'cuisine', articleId: steak.id, quantite: 3 });
  ok('3 steaks sortis de la cuisine');
  S = await Stock.charger();
  lots = Stock.lotsActifs(S, steak.id, 'cuisine');
  assert.deepStrictEqual(lots.map((l) => l.reste), [7, 5]);
  ok('sortie déduite du lot le plus ancien : 7 + 5 = 12');

  // 9-10. Sortie supérieure au stock
  const avant = (await Stock.charger()).mouvements.length;
  await refuse(Stock.sortie({ congelateurId: 'cuisine', articleId: steak.id, quantite: 13 }), /refusée/);
  ok('tentative de sortie de 13 (stock 12)');
  S = await Stock.charger();
  assert.strictEqual(S.mouvements.length, avant);
  assert.strictEqual(qte(S, 'cuisine', steak.id), 12);
  ok('opération refusée, aucun mouvement écrit, stock inchangé');

  // 11-12. Transfert cuisine -> salle à manger
  await Stock.transfert({ articleId: steak.id, de: 'cuisine', vers: 'salle', quantite: 2 });
  ok('2 steaks transférés de la cuisine vers la salle à manger');
  await refuse(Stock.transfert({ articleId: steak.id, de: 'cuisine', vers: 'salle', quantite: 99 }), /refusé/);
  S = await Stock.charger();
  assert.deepStrictEqual([qte(S, 'cuisine', steak.id), qte(S, 'salle', steak.id), qte(S, 'cave', steak.id)], [10, 2, 5]);
  const lotSalle = Stock.lotsActifs(S, steak.id, 'salle')[0].lot;
  assert.deepStrictEqual([lotSalle.dateEntree, lotSalle.datePeremption], ['2026-11-10', '2027-05-10']);
  ok('trois stocks après transfert : 10 / 2 / 5 ; dates du lot d\'origine conservées ; transfert excessif refusé');

  // 13. Historique
  assert.deepStrictEqual(S.mouvements.map((m) => [m.type, m.quantite]), [
    ['entree', 10], ['entree', 5], ['entree', 5], ['sortie', -3], ['transfert_sortant', -2], ['transfert_entrant', 2]
  ]);
  assert.strictEqual(S.mouvements[4].operationId, S.mouvements[5].operationId);
  ok('historique complet : 3 entrées, 1 sortie, 1 transfert (sortant + entrant, même opération)');

  // 14-15. Correction manuelle
  const lotCave = Stock.lotsActifs(S, steak.id, 'cave')[0].lot;
  await Stock.correction({ lotId: lotCave.id, nouvelleQuantite: 4, remarque: 'Vérification physique' });
  ok('quantité du lot de la cave corrigée de 5 à 4');
  S = await Stock.charger();
  const corr = S.mouvements[S.mouvements.length - 1];
  assert.deepStrictEqual([corr.type, corr.avant, corr.apres, corr.quantite], ['correction', 5, 4, -1]);
  assert.strictEqual(qte(S, 'cave', steak.id), 4);
  ok('la correction apparaît dans l\'historique avec avant = 5 et après = 4');

  // Complément : annulation de la dernière opération, sortie sur plusieurs lots, lot choisi
  await Stock.annulerDerniere();
  S = await Stock.charger();
  assert.strictEqual(qte(S, 'cave', steak.id), 5);
  assert.strictEqual(S.mouvements[S.mouvements.length - 1].type, 'annulation');
  await refuse(Stock.annulerDerniere(), /déjà une annulation/);
  await Stock.correction({ lotId: lotCave.id, nouvelleQuantite: 4 });
  await Stock.sortie({ congelateurId: 'cuisine', articleId: steak.id, quantite: 6 }); // 5 du 1er lot + 1 du 2e
  S = await Stock.charger();
  assert.deepStrictEqual(Stock.lotsActifs(S, steak.id, 'cuisine').map((l) => l.reste), [4]);
  await Stock.annulerDerniere();
  S = await Stock.charger();
  assert.deepStrictEqual(Stock.lotsActifs(S, steak.id, 'cuisine').map((l) => l.reste), [5, 5]);
  await Stock.transfert({ articleId: steak.id, de: 'cuisine', vers: 'salle', quantite: 1 });
  await Stock.annulerDerniere();
  S = await Stock.charger();
  assert.deepStrictEqual([qte(S, 'cuisine', steak.id), qte(S, 'salle', steak.id), qte(S, 'cave', steak.id)], [10, 2, 4]);
  await refuse(Stock.entree({ congelateurId: 'cuisine', articleId: steak.id, quantite: 1.5 }), /entier/);
  await refuse(Stock.entree({ congelateurId: 'cuisine', articleId: steak.id, quantite: 1, dateEntree: '2999-01-01' }), /futur/);
  await refuse(Stock.supprimerArticle(steak.id), /historique/);
  await refuse(Stock.archiverArticle(steak.id, true), /encore en stock/);
  console.log('     (compléments : annulations, sortie sur deux lots, refus de saisies invalides : conformes)');

  // 16-17. Fermer et rouvrir
  const photo = JSON.stringify(await Stock.lireTout());
  await DB.fermer();
  ok('base fermée puis rouverte');
  assert.strictEqual(JSON.stringify(await Stock.lireTout()), photo);
  ok('données identiques après réouverture');

  // 18. Export
  const exp = await Sauvegarde.exporter();
  const v = Sauvegarde.verifier(exp.texte);
  assert.ok(v.ok, v.erreurs.join(' '));
  ok('sauvegarde exportée (' + exp.nomFichier + ', ' + exp.texte.length + ' caractères) et reconnue valide');

  // Protection : fichiers incorrects
  assert.strictEqual(Sauvegarde.verifier('bonjour').ok, false);
  assert.strictEqual(Sauvegarde.verifier('{"format":"autre"}').ok, false);
  assert.strictEqual(Sauvegarde.verifier(exp.texte.slice(0, exp.texte.length - 40)).ok, false);
  assert.strictEqual(Sauvegarde.verifier(exp.texte.replace('"quantite":10', '"quantite":99')).ok, false);

  // 19-20. Restauration après modifications
  await Stock.sortie({ congelateurId: 'cave', articleId: steak.id, quantite: 4 });
  await Stock.entree({ congelateurId: 'cave', nouvelArticle: { nom: 'Saucisses', unite: 'paquet' }, quantite: 8 });
  assert.notStrictEqual(JSON.stringify(await Stock.lireTout()), photo);
  await Sauvegarde.restaurer(v.donnees);
  ok('sauvegarde restaurée après avoir modifié le stock');
  assert.strictEqual(JSON.stringify(await Stock.lireTout()), photo);
  S = await Stock.charger();
  assert.deepStrictEqual([S.articles.length, qte(S, 'cuisine', steak.id), qte(S, 'salle', steak.id), qte(S, 'cave', steak.id)], [1, 10, 2, 4]);
  ok('catalogue, lots et historique intégralement restaurés (' + S.lots.length + ' lots, ' + S.mouvements.length + ' mouvements)');

  // La base reste utilisable après restauration
  await Stock.entree({ congelateurId: 'cave', nouvelArticle: { nom: 'Soupe', unite: 'litre' }, quantite: 1.5 });
  console.log('\nScénario terminé : ' + n + ' vérifications réussies.');
})().catch((e) => { console.error('\nÉCHEC :', e); process.exit(1); });
