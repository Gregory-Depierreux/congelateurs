/* Logique de stock : catalogue, entrées, sorties FIFO, transferts,
 * corrections, annulation. Chaque opération tient dans une seule transaction. */
(function (root) {
  'use strict';
  const DB = root.DB;
  const req = DB.req;

  const UNITES = ['pièce', 'paquet', 'boîte', 'sachet', 'kg', 'gramme', 'litre', 'autre'];
  const UNITES_DECIMALES = ['kg', 'gramme', 'litre', 'autre'];
  const CATEGORIES = ['Viande', 'Poisson', 'Légumes', 'Fruits', 'Plats préparés', 'Pain et viennoiseries', 'Produits divers'];
  const TYPES = {
    entree: 'Entrée',
    sortie: 'Sortie',
    transfert_entrant: 'Transfert entrant',
    transfert_sortant: 'Transfert sortant',
    correction: 'Correction',
    annulation: 'Annulation'
  };
  const PARAMS_DEFAUT = { seuilAlerteJours: 30, rappelSauvegardeJours: 30, derniereSauvegarde: null, dernierCongelateur: 'cuisine' };

  /* Erreur « normale » (saisie refusée), à afficher telle quelle à l'utilisateur. */
  class ErreurStock extends Error {
    constructor(message) { super(message); this.name = 'ErreurStock'; }
  }

  // ---------- Outils ----------
  function normaliser(nom) {
    return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function arrondi(n) { return Math.round(n * 1000) / 1000; }
  function deuxChiffres(n) { return String(n).padStart(2, '0'); }
  function aujourdhui() {
    const d = new Date();
    return d.getFullYear() + '-' + deuxChiffres(d.getMonth() + 1) + '-' + deuxChiffres(d.getDate());
  }
  function dateValide(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [a, m, j] = s.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1, j));
    return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
  }
  function estDecimale(unite) { return UNITES_DECIMALES.includes(unite); }
  function pas(unite) { return unite === 'gramme' ? 50 : (unite === 'kg' || unite === 'litre') ? 0.5 : 1; }

  function verifierQuantite(q, unite, zeroPermis) {
    const n = arrondi(Number(q));
    if (!Number.isFinite(n) || n < 0 || (n === 0 && !zeroPermis)) throw new ErreurStock('La quantité doit être un nombre supérieur à zéro.');
    if (!estDecimale(unite) && !Number.isInteger(n)) throw new ErreurStock('Pour l\'unité « ' + unite + ' », la quantité doit être un nombre entier.');
    return n;
  }
  function nouvelleOperation() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function numeroLot(id) { return 'L-' + String(id).padStart(4, '0'); }
  function triFifo(a, b) { return a.lot.dateEntree.localeCompare(b.lot.dateEntree) || a.lot.id - b.lot.id; }

  /* Répartit une quantité sur des lots déjà triés : le premier lot est vidé avant de toucher au suivant. */
  function repartition(lots, quantite) {
    const prises = [];
    let restant = quantite;
    for (const l of lots) {
      if (restant <= 0) break;
      const q = arrondi(Math.min(l.reste, restant));
      if (q > 0) { prises.push({ lot: l.lot, quantite: q, resteApres: arrondi(l.reste - q) }); restant = arrondi(restant - q); }
    }
    return prises;
  }

  // ---------- Lecture à l'intérieur d'une transaction ----------
  async function resteLotTx(s, lotId) {
    const mvts = await req(s.mouvements.index('lotId').getAll(lotId));
    return arrondi(mvts.reduce((t, m) => t + m.quantite, 0));
  }
  async function lotsDisponiblesTx(s, articleId, congelateurId) {
    const lots = (await req(s.lots.index('articleId').getAll(articleId))).filter((l) => l.congelateurId === congelateurId);
    const res = [];
    for (const lot of lots) {
      const reste = await resteLotTx(s, lot.id);
      if (reste > 0) res.push({ lot, reste });
    }
    return res.sort(triFifo);
  }
  function ajouterMouvement(s, m) {
    return req(s.mouvements.add(Object.assign({ date: new Date().toISOString(), remarque: '' }, m)));
  }

  // ---------- Catalogue ----------
  function validerArticle(p) {
    const nom = String((p && p.nom) || '').replace(/\s+/g, ' ').trim();
    if (!nom) throw new ErreurStock('Le nom de l\'article est obligatoire.');
    const unite = (p && p.unite) || 'pièce';
    if (!UNITES.includes(unite)) throw new ErreurStock('Unité inconnue.');
    return { nom, nomNorm: normaliser(nom), categorie: (p.categorie || '').trim(), unite, remarque: (p.remarque || '').trim() };
  }
  async function creerArticleTx(s, p) {
    const a = validerArticle(p);
    const existant = await req(s.articles.index('nomNorm').get(a.nomNorm));
    if (existant) throw new ErreurStock('L\'article « ' + existant.nom + ' » existe déjà dans le catalogue.');
    a.archive = false;
    a.creeLe = new Date().toISOString();
    a.id = await req(s.articles.add(a));
    return a;
  }
  function creerArticle(p) {
    return DB.transaction(['articles'], 'readwrite', (s) => creerArticleTx(s, p));
  }
  function modifierArticle(id, p) {
    return DB.transaction(['articles', 'lots', 'mouvements'], 'readwrite', async (s) => {
      const actuel = await req(s.articles.get(id));
      if (!actuel) throw new ErreurStock('Article introuvable.');
      const a = validerArticle(p);
      const autre = await req(s.articles.index('nomNorm').get(a.nomNorm));
      if (autre && autre.id !== id) throw new ErreurStock('Un autre article porte déjà le nom « ' + autre.nom + ' ».');
      if (a.unite !== actuel.unite && !estDecimale(a.unite)) {
        const lots = await req(s.lots.index('articleId').getAll(id));
        for (const lot of lots) {
          if (!Number.isInteger(await resteLotTx(s, lot.id))) throw new ErreurStock('Impossible de passer à l\'unité « ' + a.unite + ' » : un lot contient une quantité décimale.');
        }
      }
      const maj = Object.assign({}, actuel, a);
      await req(s.articles.put(maj));
      return maj;
    });
  }
  function archiverArticle(id, archive) {
    return DB.transaction(['articles', 'lots', 'mouvements'], 'readwrite', async (s) => {
      const a = await req(s.articles.get(id));
      if (!a) throw new ErreurStock('Article introuvable.');
      if (archive) {
        const lots = await req(s.lots.index('articleId').getAll(id));
        for (const lot of lots) {
          if ((await resteLotTx(s, lot.id)) > 0) throw new ErreurStock('Cet article est encore en stock : il ne peut pas être archivé.');
        }
      }
      a.archive = !!archive;
      await req(s.articles.put(a));
      return a;
    });
  }
  function supprimerArticle(id) {
    return DB.transaction(['articles', 'lots'], 'readwrite', async (s) => {
      const lots = await req(s.lots.index('articleId').getAll(id));
      if (lots.length) throw new ErreurStock('Cet article possède un historique : il ne peut pas être supprimé. Vous pouvez l\'archiver.');
      await req(s.articles.delete(id));
    });
  }

  // ---------- Entrée ----------
  function entree(p) {
    return DB.transaction(['congelateurs', 'articles', 'lots', 'mouvements'], 'readwrite', async (s) => {
      const cong = await req(s.congelateurs.get(p.congelateurId));
      if (!cong) throw new ErreurStock('Choisissez un congélateur.');
      let article;
      if (p.articleId != null) {
        article = await req(s.articles.get(p.articleId));
        if (!article) throw new ErreurStock('Article introuvable.');
        if (article.archive) { article.archive = false; await req(s.articles.put(article)); }
      } else if (p.nouvelArticle) {
        article = await creerArticleTx(s, p.nouvelArticle);
      } else {
        throw new ErreurStock('Choisissez ou créez un article.');
      }
      const q = verifierQuantite(p.quantite, article.unite);
      const dateEntree = p.dateEntree || aujourdhui();
      if (!dateValide(dateEntree)) throw new ErreurStock('La date d\'entrée n\'est pas valide.');
      if (dateEntree > aujourdhui()) throw new ErreurStock('La date d\'entrée ne peut pas être dans le futur.');
      const datePeremption = p.datePeremption || null;
      if (datePeremption && !dateValide(datePeremption)) throw new ErreurStock('La date de péremption n\'est pas valide.');
      const remarque = (p.remarque || '').trim();
      const lot = { articleId: article.id, congelateurId: cong.id, dateEntree, datePeremption, remarque, lotOrigineId: null, creeLe: new Date().toISOString() };
      lot.id = await req(s.lots.add(lot));
      const operationId = nouvelleOperation();
      await ajouterMouvement(s, { type: 'entree', operationId, lotId: lot.id, articleId: article.id, congelateurId: cong.id, quantite: q, remarque });
      return { operationId, lotId: lot.id, article, quantite: q };
    });
  }

  // ---------- Sortie (FIFO) ----------
  function sortie(p) {
    return DB.transaction(['articles', 'lots', 'mouvements'], 'readwrite', async (s) => {
      const article = await req(s.articles.get(p.articleId));
      if (!article) throw new ErreurStock('Article introuvable.');
      const q = verifierQuantite(p.quantite, article.unite);
      let lots = await lotsDisponiblesTx(s, article.id, p.congelateurId);
      if (p.lotId != null) lots = lots.filter((l) => l.lot.id === p.lotId);
      const dispo = arrondi(lots.reduce((t, l) => t + l.reste, 0));
      if (q > dispo) throw new ErreurStock('Sortie refusée : ' + q + ' demandé, ' + dispo + ' disponible.');
      const prises = repartition(lots, q);
      const operationId = nouvelleOperation();
      for (const pr of prises) {
        await ajouterMouvement(s, { type: 'sortie', operationId, lotId: pr.lot.id, articleId: article.id, congelateurId: p.congelateurId, quantite: -pr.quantite, remarque: (p.remarque || '').trim() });
      }
      return { operationId, article, quantite: q, reste: arrondi(dispo - q), prises };
    });
  }

  // ---------- Transfert ----------
  function transfert(p) {
    return DB.transaction(['congelateurs', 'articles', 'lots', 'mouvements'], 'readwrite', async (s) => {
      if (p.de === p.vers) throw new ErreurStock('Le congélateur de destination doit être différent du congélateur de départ.');
      const de = await req(s.congelateurs.get(p.de));
      const vers = await req(s.congelateurs.get(p.vers));
      if (!de || !vers) throw new ErreurStock('Choisissez les deux congélateurs.');
      const article = await req(s.articles.get(p.articleId));
      if (!article) throw new ErreurStock('Choisissez un article.');
      const q = verifierQuantite(p.quantite, article.unite);
      const lots = await lotsDisponiblesTx(s, article.id, de.id);
      const dispo = arrondi(lots.reduce((t, l) => t + l.reste, 0));
      if (q > dispo) throw new ErreurStock('Transfert refusé : ' + q + ' demandé, ' + dispo + ' disponible.');
      const prises = repartition(lots, q);
      const lotsArticle = await req(s.lots.index('articleId').getAll(article.id));
      const operationId = nouvelleOperation();
      for (const pr of prises) {
        const src = pr.lot;
        // Le lot d'arrivée garde les dates du lot d'origine. S'il existe déjà (transfert précédent), il est réutilisé.
        let dest = lotsArticle.find((l) => l.congelateurId === vers.id && l.lotOrigineId === src.id);
        if (!dest) {
          dest = { articleId: article.id, congelateurId: vers.id, dateEntree: src.dateEntree, datePeremption: src.datePeremption, remarque: src.remarque, lotOrigineId: src.id, creeLe: new Date().toISOString() };
          dest.id = await req(s.lots.add(dest));
        }
        const info = de.court + ' → ' + vers.court;
        await ajouterMouvement(s, { type: 'transfert_sortant', operationId, lotId: src.id, articleId: article.id, congelateurId: de.id, quantite: -pr.quantite, remarque: info });
        await ajouterMouvement(s, { type: 'transfert_entrant', operationId, lotId: dest.id, articleId: article.id, congelateurId: vers.id, quantite: pr.quantite, remarque: info });
      }
      return { operationId, article, quantite: q };
    });
  }

  // ---------- Correction manuelle d'un lot ----------
  function correction(p) {
    return DB.transaction(['articles', 'lots', 'mouvements'], 'readwrite', async (s) => {
      const lot = await req(s.lots.get(p.lotId));
      if (!lot) throw new ErreurStock('Lot introuvable.');
      const article = await req(s.articles.get(lot.articleId));
      const apres = verifierQuantite(p.nouvelleQuantite, article.unite, true);
      const avant = await resteLotTx(s, lot.id);
      if (apres === avant) throw new ErreurStock('La quantité saisie est identique à la quantité actuelle.');
      const operationId = nouvelleOperation();
      await ajouterMouvement(s, { type: 'correction', operationId, lotId: lot.id, articleId: article.id, congelateurId: lot.congelateurId, quantite: arrondi(apres - avant), avant, apres, remarque: (p.remarque || '').trim() });
      return { operationId, article, avant, apres };
    });
  }

  // ---------- Annulation de la dernière opération ----------
  function annulerDerniere() {
    return DB.transaction(['lots', 'mouvements'], 'readwrite', async (s) => {
      const tous = await req(s.mouvements.getAll());
      if (!tous.length) throw new ErreurStock('Aucune opération à annuler.');
      const dernier = tous[tous.length - 1];
      if (dernier.type === 'annulation') throw new ErreurStock('La dernière opération est déjà une annulation.');
      const cibles = tous.filter((m) => m.operationId === dernier.operationId);
      const operationId = nouvelleOperation();
      for (const m of cibles) {
        const reste = await resteLotTx(s, m.lotId);
        if (arrondi(reste - m.quantite) < 0) throw new ErreurStock('Annulation impossible : le stock a changé depuis.');
        await ajouterMouvement(s, { type: 'annulation', operationId, annuleOperationId: dernier.operationId, lotId: m.lotId, articleId: m.articleId, congelateurId: m.congelateurId, quantite: arrondi(-m.quantite), remarque: 'Annule : ' + TYPES[m.type].toLowerCase() });
      }
      return { operationId, typeAnnule: dernier.type, nombre: cibles.length };
    });
  }

  // ---------- Paramètres ----------
  function definirParametre(cle, valeur) {
    return DB.transaction(['parametres'], 'readwrite', (s) => req(s.parametres.put({ cle, valeur })));
  }

  // ---------- Lecture complète (photo de la base) ----------
  function construireVue(brut) {
    const S = {
      congelateurs: brut.congelateurs.slice().sort((a, b) => a.ordre - b.ordre),
      articles: brut.articles,
      lots: brut.lots,
      mouvements: brut.mouvements,
      params: Object.assign({}, PARAMS_DEFAUT),
      articlesParId: new Map(brut.articles.map((a) => [a.id, a])),
      lotsParId: new Map(brut.lots.map((l) => [l.id, l])),
      reste: new Map()
    };
    brut.parametres.forEach((p) => { S.params[p.cle] = p.valeur; });
    for (const m of brut.mouvements) S.reste.set(m.lotId, (S.reste.get(m.lotId) || 0) + m.quantite);
    for (const [k, v] of S.reste) S.reste.set(k, arrondi(v));
    return S;
  }
  function lireTout() {
    return DB.transaction(DB.TABLES, 'readonly', async (s) => {
      const brut = {};
      for (const t of DB.TABLES) brut[t] = await req(s[t].getAll());
      return brut;
    });
  }
  async function charger() { return construireVue(await lireTout()); }

  // ---------- Calculs sur la photo ----------
  function statutPeremption(date, seuil, ref) {
    if (!date) return { code: 'aucune', jours: null };
    const j = (x) => { const [a, m, d] = x.split('-').map(Number); return Date.UTC(a, m - 1, d); };
    const jours = Math.round((j(date) - j(ref || aujourdhui())) / 86400000);
    return { code: jours < 0 ? 'depasse' : jours <= seuil ? 'proche' : 'ok', jours };
  }
  function lotsActifs(S, articleId, congelateurId) {
    return S.lots
      .filter((l) => l.articleId === articleId && (congelateurId == null || l.congelateurId === congelateurId))
      .map((lot) => ({ lot, reste: S.reste.get(lot.id) || 0 }))
      .filter((l) => l.reste > 0)
      .sort(triFifo);
  }
  function vueCongelateur(S, congelateurId) {
    const parArticle = new Map();
    for (const lot of S.lots) {
      if (lot.congelateurId !== congelateurId) continue;
      const reste = S.reste.get(lot.id) || 0;
      if (reste <= 0) continue;
      let v = parArticle.get(lot.articleId);
      if (!v) { v = { article: S.articlesParId.get(lot.articleId), quantite: 0, lots: [], premiereEntree: null, peremptionProche: null }; parArticle.set(lot.articleId, v); }
      v.quantite = arrondi(v.quantite + reste);
      v.lots.push({ lot, reste });
      if (!v.premiereEntree || lot.dateEntree < v.premiereEntree) v.premiereEntree = lot.dateEntree;
      if (lot.datePeremption && (!v.peremptionProche || lot.datePeremption < v.peremptionProche)) v.peremptionProche = lot.datePeremption;
    }
    const res = Array.from(parArticle.values());
    res.forEach((v) => v.lots.sort(triFifo));
    return res;
  }
  function stockTotal(S, articleId) {
    return arrondi(S.lots.filter((l) => l.articleId === articleId).reduce((t, l) => t + (S.reste.get(l.id) || 0), 0));
  }

  root.Stock = {
    UNITES, CATEGORIES, TYPES, PARAMS_DEFAUT, ErreurStock,
    normaliser, arrondi, aujourdhui, dateValide, estDecimale, pas, numeroLot, repartition,
    creerArticle, modifierArticle, archiverArticle, supprimerArticle,
    entree, sortie, transfert, correction, annulerDerniere, definirParametre,
    lireTout, charger, construireVue, statutPeremption, lotsActifs, vueCongelateur, stockTotal
  };
})(globalThis);
