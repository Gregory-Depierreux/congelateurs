/* Interface : écrans, navigation, actions. Toute la logique de stock est dans stock.js. */
(function () {
  'use strict';
  const Stock = window.Stock;
  const Sauvegarde = window.Sauvegarde;
  const VERSION_APP = '1.0.0';
  const app = document.getElementById('app');

  let S = null;            // photo de la base, rechargée avant chaque affichage
  let occupe = false;      // empêche les doubles appuis
  let listeCourante = null; // fonction qui redessine la liste de l'écran courant
  let routePrec = null;
  let E = null;            // formulaire d'entrée en cours
  let M = null;            // fenêtre ouverte (sortie, correction…)
  let persistant = null;
  let routePrecedenteConnue = false;

  const etat = {
    accueil: { q: '' },
    cong: { q: '', tri: 'nom', cat: '' },
    sortie: { cong: null, q: '' },
    transfert: { de: null, vers: null, articleId: null },
    catalogue: { q: '', archives: false },
    fiche: { epuises: false },
    hist: { article: '', cong: '', type: '', du: '', au: '', limite: 200 }
  };

  // ---------- Outils d'affichage ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtQ = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
  const fmtDate = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '');
  const p2 = (n) => String(n).padStart(2, '0');
  function fmtDateHeure(iso) {
    const d = new Date(iso);
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  const PLURIELS = { 'pièce': 'pièces', 'paquet': 'paquets', 'boîte': 'boîtes', 'sachet': 'sachets', 'gramme': 'grammes', 'litre': 'litres', 'kg': 'kg', 'autre': 'unités' };
  function libUnite(unite, q) { return Math.abs(q) >= 2 ? (PLURIELS[unite] || unite) : (unite === 'autre' ? 'unité' : unite); }
  const qU = (q, unite) => fmtQ(q) + ' ' + libUnite(unite, q);
  const lireNombre = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.'));
  const cong = (id) => S.congelateurs.find((c) => c.id === id);
  const art = (id) => S.articlesParId.get(id);
  const parNom = (a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
  const estInstallee = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const LOUPE = '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#55616E" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>';

  function pastille(date) {
    if (!date) return '<span class="muet">Non renseignée</span>';
    const st = Stock.statutPeremption(date, S.params.seuilAlerteJours);
    let txt = '';
    if (st.code === 'depasse') txt = ' · dépassée de ' + (-st.jours) + ' j';
    else if (st.code === 'proche') txt = st.jours === 0 ? ' · aujourd\'hui' : ' · dans ' + st.jours + ' j';
    return '<span class="pst ' + st.code + '">' + fmtDate(date) + txt + '</span>';
  }
  function entete(titre, o) {
    o = o || {};
    return '<header class="entete' + (o.couleur ? ' couleur" style="--c:' + o.couleur : '') + '">' +
      '<a class="btn" href="#/"><span aria-hidden="true">‹</span> Accueil</a>' +
      '<h1>' + esc(titre) + (o.sous ? '<span class="sous">' + esc(o.sous) + '</span>' : '') + '</h1>' + (o.actions || '') + '</header>';
  }
  function choixCong(action, actif, exclu) {
    return '<div class="seg" role="group">' + S.congelateurs.map((c) =>
      '<button type="button" class="seg-b' + (c.id === actif ? ' on' : '') + '" style="--c:' + c.couleur + '" data-action="' + action + '" data-id="' + c.id + '" aria-pressed="' + (c.id === actif) + '"' + (c.id === exclu ? ' disabled' : '') + '>' + esc(c.court) + '</button>').join('') + '</div>';
  }
  function stepper(id, val, unite, o) {
    o = o || {};
    const pas = Stock.pas(unite);
    return '<div class="stepper' + (o.gros ? ' gros' : '') + '">' +
      '<button type="button" class="st" data-step="-' + pas + '" data-pour="' + id + '" aria-label="Diminuer la quantité">−</button>' +
      '<input id="' + id + '" class="st-val" type="text" inputmode="decimal" autocomplete="off" value="' + fmtQ(val).replace(/\s/g, '') + '" data-min="' + (o.min != null ? o.min : (Stock.estDecimale(unite) ? 0 : 1)) + '"' + (o.max != null ? ' data-max="' + o.max + '"' : '') + ' aria-label="Quantité">' +
      '<button type="button" class="st" data-step="' + pas + '" data-pour="' + id + '" aria-label="Augmenter la quantité">+</button>' +
      '<span class="st-u">' + esc(PLURIELS[unite] || unite) + '</span></div>';
  }
  function options(liste, actuel, vide) {
    return (vide != null ? '<option value="">' + esc(vide) + '</option>' : '') +
      liste.map((x) => { const v = Array.isArray(x) ? x : [x, x]; return '<option value="' + esc(v[0]) + '"' + (String(v[0]) === String(actuel) ? ' selected' : '') + '>' + esc(v[1]) + '</option>'; }).join('');
  }

  // ---------- Messages ----------
  function toast(message, o) {
    o = o || {};
    const zone = document.getElementById('toasts');
    zone.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'toast' + (o.erreur ? ' err' : '');
    t.innerHTML = '<span>' + esc(message) + '</span>' + (o.annulable ? '<button type="button" data-action="annuler-derniere">Annuler</button>' : '');
    zone.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, o.erreur ? 7000 : (o.annulable ? 9000 : 4500));
  }
  function erreur(e) {
    if (!(e instanceof Stock.ErreurStock)) console.error(e);
    toast(e instanceof Stock.ErreurStock ? e.message : 'Une erreur est survenue. Rien n\'a été modifié. (' + (e && e.message ? e.message : e) + ')', { erreur: true });
  }
  /* Exécute une action en bloquant tout nouvel appui tant qu'elle n'est pas terminée. */
  async function executer(fn) {
    if (occupe) return;
    occupe = true;
    document.body.setAttribute('aria-busy', 'true');
    try { await fn(); } catch (e) { erreur(e); } finally { occupe = false; document.body.removeAttribute('aria-busy'); }
  }

  // ---------- Fenêtres ----------
  function ouvrirModal(html) {
    fermerModal(true);
    const v = document.createElement('div');
    v.className = 'voile';
    v.id = 'voile';
    v.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(v);
    const f = v.querySelector('h2');
    if (f) { f.tabIndex = -1; f.focus(); }
  }
  function fermerModal(garderEtat) {
    const v = document.getElementById('voile');
    if (v) v.remove();
    if (!garderEtat) M = null;
  }
  function confirmer(titre, corpsHtml, libelle, danger) {
    return new Promise((resolve) => {
      M = { type: 'confirmer', resolve };
      ouvrirModal('<div class="modal-t"><h2>' + esc(titre) + '</h2></div><div>' + corpsHtml + '</div>' +
        '<div class="actions"><button type="button" class="btn grand" data-action="confirmer-non">Annuler</button>' +
        '<button type="button" class="btn grand ' + (danger ? 'danger' : 'primaire') + '" data-action="confirmer-oui">' + esc(libelle) + '</button></div>');
    });
  }

  // ---------- Accueil ----------
  function carte(c) {
    const v = Stock.vueCongelateur(S, c.id);
    const total = Stock.arrondi(v.reduce((t, x) => t + x.quantite, 0));
    let proches = 0, depasses = 0;
    v.forEach((x) => x.lots.forEach((l) => {
      const st = Stock.statutPeremption(l.lot.datePeremption, S.params.seuilAlerteJours).code;
      if (st === 'proche') proches++; else if (st === 'depasse') depasses++;
    }));
    const principaux = v.slice().sort((a, b) => b.quantite - a.quantite || parNom(a.article, b.article)).slice(0, 3);
    let alerte = '<div class="alerte">' + (v.length ? 'Aucune date proche' : 'Vide') + '</div>';
    if (depasses) alerte = '<div class="alerte depasse">' + depasses + (depasses > 1 ? ' lots dont la date est dépassée' : ' lot dont la date est dépassée') + (proches ? ' · ' + proches + ' à consommer bientôt' : '') + '</div>';
    else if (proches) alerte = '<div class="alerte proche">' + proches + (proches > 1 ? ' lots' : ' lot') + ' à consommer dans les ' + S.params.seuilAlerteJours + ' jours</div>';
    return '<a class="carte" href="#/congelateur/' + c.id + '" style="--c:' + c.couleur + '">' +
      '<div class="carte-t"><small>Congélateur</small><strong>' + esc(c.court) + '</strong></div>' +
      '<div class="carte-c"><div class="chiffres"><div><b>' + v.length + '</b><span>' + (v.length > 1 ? 'références' : 'référence') + '</span></div><div><b>' + fmtQ(total) + '</b><span>' + (total >= 2 ? 'unités' : 'unité') + '</span></div></div>' +
      '<div class="apercu">' + principaux.map((x) => '<div><span>' + esc(x.article.nom) + '</span><span>' + qU(x.quantite, x.article.unite) + '</span></div>').join('') + '</div>' + alerte + '</div></a>';
  }
  function corpsAccueil() {
    const q = Stock.normaliser(etat.accueil.q);
    if (!q) return '<div class="cartes">' + S.congelateurs.map(carte).join('') + '</div>';
    const trouves = S.articles.filter((a) => a.nomNorm.includes(q)).sort(parNom);
    if (!trouves.length) return '<div class="table"><p class="vide">Aucun article ne correspond à « ' + esc(etat.accueil.q) + ' ».</p></div>';
    const cols = '--cols: 1.6fr repeat(' + S.congelateurs.length + ', 1fr)';
    return '<div class="table table-x"><div class="lg tete" style="' + cols + '"><span>Article</span>' + S.congelateurs.map((c) => '<span>' + esc(c.court) + '</span>').join('') + '</div>' +
      trouves.map((a) => '<a class="lg" style="' + cols + '" href="#/article/' + a.id + '"><strong>' + esc(a.nom) + '</strong>' +
        S.congelateurs.map((c) => { const t = Stock.lotsActifs(S, a.id, c.id).reduce((s, l) => s + l.reste, 0); return t > 0 ? '<span class="nomc" style="--c:' + c.couleur + '">' + qU(Stock.arrondi(t), a.unite) + '</span>' : '<span class="muet">—</span>'; }).join('') + '</a>').join('') + '</div>';
  }
  function vueAccueil() {
    listeCourante = corpsAccueil;
    const p = S.params;
    const jours = p.derniereSauvegarde ? Math.floor((Date.now() - new Date(p.derniereSauvegarde).getTime()) / 86400000) : null;
    const rappel = S.mouvements.length > 0 && (jours === null || jours >= p.rappelSauvegardeJours);
    const d = new Date();
    const dateLongue = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return '<header class="entete"><h1>Mes congélateurs</h1><span class="muet">' + esc(dateLongue.charAt(0).toUpperCase() + dateLongue.slice(1)) + '</span></header>' +
      (estInstallee() ? '' : '<div class="bandeau"><span>Pour conserver vos données durablement, installez l\'application sur l\'écran d\'accueil (Safari : Partager, puis « Sur l\'écran d\'accueil ») et ouvrez-la toujours depuis son icône.</span></div>') +
      (rappel ? '<div class="bandeau proche"><span>' + (jours === null ? 'Aucune sauvegarde n\'a encore été faite.' : 'Dernière sauvegarde il y a ' + jours + ' jours.') + ' Pensez à en enregistrer une.</span><a class="btn petit" href="#/sauvegarde">Sauvegarder</a></div>' : '') +
      '<div class="barre"><label class="recherche">' + LOUPE + '<input type="search" id="rech" data-filtre="accueil.q" placeholder="Rechercher un article dans les trois congélateurs" aria-label="Rechercher un article dans les trois congélateurs" value="' + esc(etat.accueil.q) + '" autocomplete="off"></label>' +
      '<a class="btn primaire grand" href="#/entree"><span class="signe" aria-hidden="true">+</span> Nouvel article</a>' +
      '<a class="btn contour grand" href="#/sortie"><span class="signe" aria-hidden="true">−</span> Sortie de stock</a></div>' +
      '<div id="liste">' + corpsAccueil() + '</div>' +
      '<nav class="raccourcis" aria-label="Raccourcis"><a class="btn" href="#/transfert">Transfert</a><a class="btn" href="#/catalogue">Catalogue</a><a class="btn" href="#/peremption">À consommer</a><a class="btn" href="#/historique">Historique</a><button type="button" class="btn" data-action="recherche">Recherche</button><a class="btn" href="#/sauvegarde">Sauvegarde</a></nav>' +
      '<p class="note">Dernière sauvegarde : ' + (p.derniereSauvegarde ? fmtDateHeure(p.derniereSauvegarde) : 'jamais') + '</p>';
  }

  // ---------- Détail d'un congélateur ----------
  function listeCong(c) {
    const f = etat.cong;
    const q = Stock.normaliser(f.q);
    let v = Stock.vueCongelateur(S, c.id).filter((x) => (!q || x.article.nomNorm.includes(q)) && (!f.cat || x.article.categorie === f.cat));
    const fin = '9999-99-99';
    if (f.tri === 'peremption') v.sort((a, b) => (a.peremptionProche || fin).localeCompare(b.peremptionProche || fin) || parNom(a.article, b.article));
    else if (f.tri === 'entree') v.sort((a, b) => a.premiereEntree.localeCompare(b.premiereEntree) || parNom(a.article, b.article));
    else v.sort((a, b) => parNom(a.article, b.article));
    const cols = '--cols: 1.6fr 1.1fr 1fr 0.9fr 1.4fr';
    if (!v.length) return '<p class="vide">' + (q || f.cat ? 'Aucun article ne correspond.' : 'Ce congélateur est vide.') + '</p>';
    return '<div class="lg tete" style="' + cols + '"><span>Article</span><span>Catégorie</span><span>Quantité</span><span>Première entrée</span><span>Péremption la plus proche</span></div>' +
      v.map((x) => '<a class="lg" style="' + cols + '" href="#/article/' + x.article.id + '/' + c.id + '"><strong>' + esc(x.article.nom) + '</strong><span>' + esc(x.article.categorie || '—') + '</span>' +
        '<span>' + qU(x.quantite, x.article.unite) + (x.lots.length > 1 ? '<span class="petit-t">' + x.lots.length + ' lots</span>' : '') + '</span><span>' + fmtDate(x.premiereEntree) + '</span><span>' + pastille(x.peremptionProche) + '</span></a>').join('');
  }
  function vueCongelateur(id) {
    const c = cong(id);
    if (!c) return vueAccueil();
    listeCourante = () => listeCong(c);
    const v = Stock.vueCongelateur(S, c.id);
    const total = Stock.arrondi(v.reduce((t, x) => t + x.quantite, 0));
    const f = etat.cong;
    const pil = (cle, lib) => '<button type="button" class="pilule' + (f.tri === cle ? ' on' : '') + '" data-action="tri" data-id="' + cle + '" aria-pressed="' + (f.tri === cle) + '">' + lib + '</button>';
    return entete(c.nom, { couleur: c.couleur, sous: v.length + (v.length > 1 ? ' références · ' : ' référence · ') + fmtQ(total) + (total >= 2 ? ' unités' : ' unité'),
      actions: '<a class="btn" href="#/entree/' + c.id + '">Ajouter</a><a class="btn" href="#/sortie/' + c.id + '">Sortir</a>' }) +
      '<div class="outils"><label class="recherche">' + LOUPE + '<input type="search" data-filtre="cong.q" placeholder="Rechercher dans ce congélateur" aria-label="Rechercher dans ce congélateur" value="' + esc(f.q) + '" autocomplete="off"></label>' +
      '<span class="note">Trier par</span>' + pil('nom', 'Nom') + pil('peremption', 'Péremption') + pil('entree', 'Date d\'entrée') +
      '<select class="pilule" data-filtre="cong.cat" aria-label="Filtrer par catégorie">' + options(Stock.CATEGORIES, f.cat, 'Toutes les catégories') + '</select></div>' +
      '<div class="table table-x" id="liste">' + listeCong(c) + '</div>' +
      '<p class="note">Touchez un article pour voir ses lots, son historique, ou corriger une quantité après vérification du congélateur.</p>';
  }

  // ---------- Entrée en stock ----------
  function nouvelleEntree(congelateurId) {
    return { congelateurId: congelateurId || S.params.dernierCongelateur || 'cuisine', article: null, texte: '', creation: false, categorie: '', unite: 'pièce', quantite: 1, dateEntree: Stock.aujourdhui(), datePeremption: '', remarque: '' };
  }
  function uniteEntree() { return E.article ? E.article.unite : (E.creation ? E.unite : 'pièce'); }
  function suggestions() {
    const q = Stock.normaliser(E.texte);
    const actifs = S.articles.filter((a) => !a.archive);
    let liste = q ? actifs.filter((a) => a.nomNorm.includes(q)).sort((a, b) => (b.nomNorm.startsWith(q) - a.nomNorm.startsWith(q)) || parNom(a, b)) : actifs.slice().sort(parNom);
    const exact = q && S.articles.find((a) => a.nomNorm === q);
    let h = '';
    if (liste.length) h += '<div class="titre">' + (q ? 'Déjà dans le catalogue' : 'Catalogue (' + liste.length + ')') + '</div>' + liste.slice(0, 40).map((a) => '<button type="button" class="sug" data-action="e-choisir" data-id="' + a.id + '"><strong>' + esc(a.nom) + '</strong><span>' + esc((a.categorie ? a.categorie + ' · ' : '') + a.unite) + '</span></button>').join('');
    if (exact && exact.archive) h += '<button type="button" class="sug" data-action="e-choisir" data-id="' + exact.id + '"><span>Réutiliser l\'article archivé « ' + esc(exact.nom) + ' »</span><span>' + esc(exact.unite) + '</span></button>';
    if (q && !exact) h += '<button type="button" class="sug" data-action="e-creer"><span>Créer « ' + esc(E.texte.trim()) + ' » comme nouvel article</span><span class="signe" aria-hidden="true">+</span></button>';
    if (!h) h = '<div class="titre">Le catalogue est vide : écrivez le nom du premier article.</div>';
    return h;
  }
  function zoneArticle() {
    if (E.article) {
      return '<span class="lab">Article</span><div class="choisi"><div><strong>' + esc(E.article.nom) + '</strong><small>' + esc((E.article.categorie ? E.article.categorie + ' · ' : '') + 'unité : ' + E.article.unite) + '</small></div><button type="button" class="btn" data-action="e-changer">Changer</button></div>';
    }
    if (E.creation) {
      return '<label class="lab" for="e-nom">Nouvel article</label><input id="e-nom" class="champ-t" type="text" value="' + esc(E.texte) + '" autocomplete="off">' +
        '<div class="grille2 serre" style="margin-top:14px"><div><label class="lab" for="e-cat">Catégorie <span class="opt">(facultatif)</span></label><select id="e-cat" class="champ-t">' + options(Stock.CATEGORIES, E.categorie, 'Aucune') + '</select></div>' +
        '<div><label class="lab" for="e-unite">Unité</label><select id="e-unite" class="champ-t">' + options(Stock.UNITES, E.unite) + '</select></div></div>' +
        '<button type="button" class="btn" style="margin-top:14px" data-action="e-changer">Choisir un article existant</button>';
    }
    return '<label class="lab" for="e-art">Article</label><input id="e-art" class="champ-t" type="text" value="' + esc(E.texte) + '" placeholder="Écrivez le nom ou choisissez ci-dessous" autocomplete="off" autocapitalize="sentences">' +
      '<div class="suggestions" id="suggestions">' + suggestions() + '</div>';
  }
  function lireEntree() {
    const g = (id) => document.getElementById(id);
    if (g('e-q')) E.quantite = lireNombre(g('e-q').value);
    if (g('e-de')) E.dateEntree = g('e-de').value;
    if (g('e-dp')) E.datePeremption = g('e-dp').value;
    if (g('e-rq')) E.remarque = g('e-rq').value;
    if (g('e-art')) E.texte = g('e-art').value;
    if (g('e-nom')) { E.texte = g('e-nom').value; E.categorie = g('e-cat').value; E.unite = g('e-unite').value; }
  }
  function vueEntree() {
    listeCourante = null;
    return entete('Nouvel article') +
      '<form id="f-entree" class="grille2" novalidate>' +
      '<section class="bloc"><div><span class="lab">Congélateur</span><div id="zone-cong">' + choixCong('e-cong', E.congelateurId) + '</div></div><div id="zone-article">' + zoneArticle() + '</div></section>' +
      '<section class="bloc"><div><span class="lab">Quantité</span><div id="zone-q">' + stepper('e-q', Number.isFinite(E.quantite) ? E.quantite : 1, uniteEntree()) + '</div></div>' +
      '<div class="grille2 serre"><div><label class="lab" for="e-de">Date d\'entrée</label><input id="e-de" class="champ-t" type="date" max="' + Stock.aujourdhui() + '" value="' + esc(E.dateEntree) + '"></div>' +
      '<div><label class="lab" for="e-dp">Date de péremption <span class="opt">(facultatif)</span></label><input id="e-dp" class="champ-t" type="date" value="' + esc(E.datePeremption) + '"></div></div>' +
      '<div><label class="lab" for="e-rq">Remarque <span class="opt">(facultatif)</span></label><input id="e-rq" class="champ-t" type="text" value="' + esc(E.remarque) + '" autocomplete="off"></div>' +
      '<button type="submit" class="btn primaire tres-grand">Ajouter au stock</button></section></form>';
  }
  function majZonesEntree() {
    document.getElementById('zone-article').innerHTML = zoneArticle();
    document.getElementById('zone-q').innerHTML = stepper('e-q', Number.isFinite(E.quantite) && E.quantite > 0 ? E.quantite : 1, uniteEntree());
  }
  async function validerEntree() {
    lireEntree();
    const p = { congelateurId: E.congelateurId, quantite: E.quantite, dateEntree: E.dateEntree, datePeremption: E.datePeremption || null, remarque: E.remarque };
    if (E.article) p.articleId = E.article.id;
    else if (E.creation) p.nouvelArticle = { nom: E.texte, categorie: E.categorie, unite: E.unite };
    else {
      const q = Stock.normaliser(E.texte);
      const exact = q && S.articles.find((a) => a.nomNorm === q);
      if (exact) p.articleId = exact.id;
      else throw new Stock.ErreurStock(q ? 'Touchez « Créer … comme nouvel article » ou choisissez un article de la liste.' : 'Choisissez ou créez un article.');
    }
    const r = await Stock.entree(p);
    await Stock.definirParametre('dernierCongelateur', E.congelateurId);
    const c = cong(E.congelateurId);
    E = Object.assign(nouvelleEntree(E.congelateurId), { dateEntree: E.dateEntree });
    await rendre();
    toast('Ajouté : ' + qU(r.quantite, r.article.unite) + ' de ' + r.article.nom + ' · ' + c.court, { annulable: true });
  }

  // ---------- Sortie de stock ----------
  function listeSortie() {
    const c = cong(etat.sortie.cong);
    const q = Stock.normaliser(etat.sortie.q);
    const v = Stock.vueCongelateur(S, c.id).filter((x) => !q || x.article.nomNorm.includes(q)).sort((a, b) => parNom(a.article, b.article));
    if (!v.length) return '<p class="vide">' + (q ? 'Aucun article ne correspond.' : 'Ce congélateur est vide.') + '</p>';
    const cols = '--cols: 1.6fr 1fr 1.3fr';
    return '<div class="lg tete compact" style="' + cols + '"><span>' + v.length + (v.length > 1 ? ' articles disponibles' : ' article disponible') + ' · touchez celui à sortir</span><span>Quantité</span><span>Péremption la plus proche</span></div>' +
      v.map((x) => '<button type="button" class="lg compact" style="' + cols + '" data-action="ouvrir-sortie" data-id="' + x.article.id + '"><strong>' + esc(x.article.nom) + '</strong><span>' + qU(x.quantite, x.article.unite) + '</span><span>' + pastille(x.peremptionProche) + '</span></button>').join('');
  }
  function vueSortie() {
    listeCourante = listeSortie;
    return entete('Sortie de stock') +
      '<div>' + choixCong('s-cong', etat.sortie.cong) + '</div>' +
      '<label class="recherche">' + LOUPE + '<input type="search" data-filtre="sortie.q" placeholder="Rechercher un article" aria-label="Rechercher un article" value="' + esc(etat.sortie.q) + '" autocomplete="off"></label>' +
      '<div class="table" id="liste">' + listeSortie() + '</div>';
  }
  function resumeSortie() {
    const a = art(M.articleId);
    let lots = Stock.lotsActifs(S, a.id, M.cong);
    if (M.lotId != null) lots = lots.filter((l) => l.lot.id === M.lotId);
    const dispo = Stock.arrondi(lots.reduce((t, l) => t + l.reste, 0));
    const el = document.getElementById('m-q');
    const q = el ? lireNombre(el.value) : 1;
    if (!Number.isFinite(q) || q <= 0) return '<span>Indiquez une quantité.</span>';
    if (q > dispo) return '<strong style="color:var(--dep-t)">Quantité supérieure au stock disponible (' + qU(dispo, a.unite) + ').</strong>';
    const prises = Stock.repartition(lots, q);
    const tous = Stock.arrondi(Stock.lotsActifs(S, a.id, M.cong).reduce((t, l) => t + l.reste, 0));
    return 'Prise sur ' + prises.map((p) => 'le lot du ' + fmtDate(p.lot.dateEntree) + (prises.length > 1 ? ' (' + fmtQ(p.quantite) + ')' : '')).join(' puis ') + ' · il restera <strong>' + qU(Stock.arrondi(tous - q), a.unite) + '</strong>';
  }
  function modalSortie() {
    const a = art(M.articleId);
    const c = cong(M.cong);
    const lots = Stock.lotsActifs(S, a.id, c.id);
    if (!lots.length) { fermerModal(); return; }
    const total = Stock.arrondi(lots.reduce((t, l) => t + l.reste, 0));
    const fifo = M.lotId != null ? lots.find((l) => l.lot.id === M.lotId) : lots[0];
    const max = M.lotId != null ? fifo.reste : total;
    const plusProche = lots.filter((l) => l.lot.datePeremption).sort((x, y) => x.lot.datePeremption.localeCompare(y.lot.datePeremption))[0];
    const avert = plusProche && plusProche.lot.id !== fifo.lot.id && (!fifo.lot.datePeremption || plusProche.lot.datePeremption < fifo.lot.datePeremption)
      ? '<div class="avert">Le lot ' + Stock.numeroLot(plusProche.lot.id) + ' périme plus tôt (' + fmtDate(plusProche.lot.datePeremption) + '). Touchez-le pour le sortir en priorité.</div>' : '';
    const cols = '--cols: 1.3fr 1fr 1.4fr 0.7fr';
    ouvrirModal('<div class="modal-t"><div><div class="nomc" style="--c:' + c.couleur + '">' + esc(c.nom) + '</div><h2>' + esc(a.nom) + '</h2></div><div class="total droite"><b>' + fmtQ(total) + '</b><span class="muet">' + libUnite(a.unite, total) + (total >= 2 ? ' disponibles' : ' disponible') + '</span></div></div>' +
      '<div class="table"><div class="lg tete compact" style="' + cols + '"><span>Lot</span><span>Entrée</span><span>Péremption</span><span class="droite">Quantité</span></div>' +
      lots.map((l) => '<button type="button" class="lg compact' + (l.lot.id === fifo.lot.id ? ' on' : '') + '" style="' + cols + '" data-action="m-lot" data-id="' + l.lot.id + '" aria-pressed="' + (l.lot.id === fifo.lot.id) + '"><span><strong>' + Stock.numeroLot(l.lot.id) + '</strong>' + (l.lot.id === fifo.lot.id ? '<span class="petit-t">' + (M.lotId != null ? 'lot choisi' : 'sort en premier') + '</span>' : '') + '</span><span>' + fmtDate(l.lot.dateEntree) + '</span><span>' + pastille(l.lot.datePeremption) + '</span><strong class="droite">' + fmtQ(l.reste) + '</strong></button>').join('') + '</div>' +
      (M.lotId != null ? '<button type="button" class="btn petit" data-action="m-lot" data-id="">Revenir à l\'ordre automatique (le plus ancien d\'abord)</button>' : avert) +
      stepper('m-q', Math.min(1, max), a.unite, { gros: true, max: max }) +
      '<p class="resume" id="m-resume"></p>' +
      '<div class="actions"><button type="button" class="btn grand" data-action="fermer-modal">Fermer</button><button type="button" class="btn primaire grand" data-action="confirmer-sortie">Confirmer la sortie</button></div>');
    document.getElementById('m-resume').innerHTML = resumeSortie();
  }

  // ---------- Transfert ----------
  function vueTransfert() {
    listeCourante = null;
    const T = etat.transfert;
    if (!cong(T.de)) T.de = S.params.dernierCongelateur || S.congelateurs[0].id;
    if (!cong(T.vers) || T.vers === T.de) T.vers = S.congelateurs.find((c) => c.id !== T.de).id;
    const v = Stock.vueCongelateur(S, T.de).sort((a, b) => parNom(a.article, b.article));
    let x = v.find((y) => y.article.id === T.articleId);
    if (!x) { x = v[0]; T.articleId = x ? x.article.id : null; }
    return entete('Transfert entre congélateurs') +
      '<form id="f-transfert" class="grille2" novalidate><section class="bloc">' +
      '<div><span class="lab">Congélateur de départ</span>' + choixCong('t-de', T.de) + '</div>' +
      '<div><span class="lab">Congélateur de destination</span>' + choixCong('t-vers', T.vers, T.de) + '</div></section>' +
      '<section class="bloc">' + (x
        ? '<div><label class="lab" for="t-art">Article à transférer</label><select id="t-art" class="champ-t">' + options(v.map((y) => [y.article.id, y.article.nom + ' — ' + qU(y.quantite, y.article.unite)]), T.articleId) + '</select></div>' +
          '<div><span class="lab">Quantité (disponible : ' + qU(x.quantite, x.article.unite) + ')</span>' + stepper('t-q', Math.min(1, x.quantite), x.article.unite, { max: x.quantite }) + '</div>' +
          '<p class="note">Les lots les plus anciens partent en premier et gardent leurs dates d\'entrée et de péremption.</p>' +
          '<button type="submit" class="btn primaire tres-grand">Transférer</button>'
        : '<p class="vide">Le ' + esc(cong(T.de).nom.toLowerCase()) + ' est vide : rien à transférer.</p>') + '</section></form>';
  }

  // ---------- Fiche article ----------
  function lignesMouvements(mvts) {
    const cols = '--cols: 1.2fr 1.2fr 1.4fr 1.1fr 0.7fr 1.3fr';
    if (!mvts.length) return '<p class="vide">Aucun mouvement.</p>';
    return '<div class="lg tete" style="' + cols + '"><span>Date et heure</span><span>Type</span><span>Article</span><span>Congélateur</span><span>Lot</span><span class="droite">Quantité</span></div>' +
      mvts.map((m) => {
        const a = art(m.articleId) || { nom: '?', unite: 'autre' };
        const c = cong(m.congelateurId) || { court: '?', couleur: '#17212B' };
        const q = m.type === 'correction' ? fmtQ(m.avant) + ' → ' + qU(m.apres, a.unite) : (m.quantite > 0 ? '+' : '−') + qU(Math.abs(m.quantite), a.unite);
        return '<div class="lg" style="' + cols + '"><span>' + fmtDateHeure(m.date) + '</span><span><span class="type ' + m.type + '">' + Stock.TYPES[m.type] + '</span></span>' +
          '<span><strong>' + esc(a.nom) + '</strong>' + (m.remarque ? '<span class="petit-t">' + esc(m.remarque) + '</span>' : '') + '</span>' +
          '<span class="nomc" style="--c:' + c.couleur + '">' + esc(c.court) + '</span><span>' + Stock.numeroLot(m.lotId) + '</span><strong class="droite">' + q + '</strong></div>';
      }).join('');
  }
  function vueArticle(id, cid) {
    const a = art(Number(id));
    if (!a) return vueAccueil();
    listeCourante = null;
    const total = Stock.stockTotal(S, a.id);
    const cols = '--cols: 1.1fr 1fr 1.4fr 0.8fr 1fr';
    const ordre = S.congelateurs.slice().sort((x, y) => (y.id === cid) - (x.id === cid) || x.ordre - y.ordre);
    const sections = ordre.map((c) => {
      const tous = S.lots.filter((l) => l.articleId === a.id && l.congelateurId === c.id).map((lot) => ({ lot, reste: S.reste.get(lot.id) || 0 }))
        .sort((x, y) => x.lot.dateEntree.localeCompare(y.lot.dateEntree) || x.lot.id - y.lot.id);
      const actifs = tous.filter((l) => l.reste > 0);
      const montres = etat.fiche.epuises ? tous : actifs;
      if (!montres.length) return '';
      const t = Stock.arrondi(actifs.reduce((s, l) => s + l.reste, 0));
      return '<section class="bloc" style="--c:' + c.couleur + '"><div class="entete"><h2 class="nomc" style="flex:1">' + esc(c.nom) + ' · ' + qU(t, a.unite) + '</h2>' +
        (t > 0 ? '<button type="button" class="btn" data-action="ouvrir-sortie" data-id="' + a.id + '" data-cong="' + c.id + '">Sortir</button><button type="button" class="btn" data-action="vers-transfert" data-id="' + a.id + '" data-cong="' + c.id + '">Transférer</button>' : '') + '</div>' +
        '<div class="table table-x"><div class="lg tete" style="' + cols + '"><span>Lot</span><span>Entrée</span><span>Péremption</span><span class="droite">Quantité</span><span></span></div>' +
        montres.map((l) => '<div class="lg" style="' + cols + '"><span><strong>' + Stock.numeroLot(l.lot.id) + '</strong>' + (l.lot.lotOrigineId ? '<span class="petit-t">vient du lot ' + Stock.numeroLot(l.lot.lotOrigineId) + '</span>' : '') + (l.lot.remarque ? '<span class="petit-t">' + esc(l.lot.remarque) + '</span>' : '') + '</span><span>' + fmtDate(l.lot.dateEntree) + '</span><span>' + (l.reste > 0 ? pastille(l.lot.datePeremption) : (l.lot.datePeremption ? fmtDate(l.lot.datePeremption) : '—')) + '</span><strong class="droite">' + (l.reste > 0 ? fmtQ(l.reste) : 'épuisé') + '</strong><span class="droite"><button type="button" class="btn petit" data-action="ouvrir-correction" data-id="' + l.lot.id + '">Corriger</button></span></div>').join('') + '</div></section>';
    }).join('');
    const mvts = S.mouvements.filter((m) => m.articleId === a.id).reverse();
    return entete(a.nom, { sous: [a.categorie, 'unité : ' + a.unite, 'stock total : ' + qU(total, a.unite), a.archive ? 'archivé' : ''].filter(Boolean).join(' · '),
      actions: '<button type="button" class="btn" data-action="modifier-article" data-id="' + a.id + '">Modifier l\'article</button>' }) +
      (a.remarque ? '<p class="note">' + esc(a.remarque) + '</p>' : '') +
      (sections || '<div class="table"><p class="vide">Cet article n\'est en stock dans aucun congélateur.</p></div>') +
      '<div class="outils"><button type="button" class="pilule' + (etat.fiche.epuises ? ' on' : '') + '" data-action="epuises" aria-pressed="' + etat.fiche.epuises + '">Afficher aussi les lots épuisés</button></div>' +
      '<h2>Historique de l\'article</h2><div class="table table-x">' + lignesMouvements(mvts.slice(0, 100)) + '</div>' +
      (mvts.length > 100 ? '<p class="note">Les 100 mouvements les plus récents sont affichés. L\'historique complet est dans la rubrique Historique.</p>' : '');
  }
  function modalCorrection(lotId) {
    const lot = S.lotsParId.get(lotId);
    const a = art(lot.articleId);
    const c = cong(lot.congelateurId);
    const reste = S.reste.get(lot.id) || 0;
    M = { type: 'correction', lotId: lot.id };
    ouvrirModal('<div class="modal-t"><div><div class="nomc" style="--c:' + c.couleur + '">' + esc(c.nom) + ' · lot ' + Stock.numeroLot(lot.id) + ' du ' + fmtDate(lot.dateEntree) + '</div><h2>Corriger : ' + esc(a.nom) + '</h2></div></div>' +
      '<p>Quantité enregistrée : <strong>' + qU(reste, a.unite) + '</strong>. Indiquez la quantité réellement présente dans le congélateur.</p>' +
      stepper('c-q', reste, a.unite, { gros: true, min: 0 }) +
      '<div><label class="lab" for="c-rq">Remarque <span class="opt">(facultatif)</span></label><input id="c-rq" class="champ-t" type="text" autocomplete="off" placeholder="Par exemple : vérification du congélateur"></div>' +
      '<div class="actions"><button type="button" class="btn grand" data-action="fermer-modal">Fermer</button><button type="button" class="btn primaire grand" data-action="confirmer-correction">Enregistrer la correction</button></div>');
  }

  // ---------- Catalogue ----------
  function listeCatalogue() {
    const f = etat.catalogue;
    const q = Stock.normaliser(f.q);
    const v = S.articles.filter((a) => (f.archives || !a.archive) && (!q || a.nomNorm.includes(q))).sort(parNom);
    if (!v.length) return '<p class="vide">' + (S.articles.length ? 'Aucun article ne correspond.' : 'Le catalogue est vide. Il se remplit au fil des entrées en stock.') + '</p>';
    const cols = '--cols: 1.6fr 1.2fr 0.8fr 1fr';
    return '<div class="lg tete" style="' + cols + '"><span>Article</span><span>Catégorie</span><span>Unité</span><span class="droite">Stock total</span></div>' +
      v.map((a) => { const t = Stock.stockTotal(S, a.id); return '<a class="lg" style="' + cols + '" href="#/article/' + a.id + '"><span><strong>' + esc(a.nom) + '</strong>' + (a.archive ? '<span class="petit-t">archivé</span>' : '') + '</span><span>' + esc(a.categorie || '—') + '</span><span>' + esc(a.unite) + '</span><span class="droite' + (t > 0 ? '' : ' muet') + '">' + (t > 0 ? qU(t, a.unite) : 'aucun') + '</span></a>'; }).join('');
  }
  function vueCatalogue() {
    listeCourante = listeCatalogue;
    const f = etat.catalogue;
    return entete('Catalogue des articles', { sous: S.articles.length + (S.articles.length > 1 ? ' articles enregistrés' : ' article enregistré'), actions: '<button type="button" class="btn primaire" data-action="creer-article">Créer un article</button>' }) +
      '<div class="outils"><label class="recherche">' + LOUPE + '<input type="search" data-filtre="catalogue.q" placeholder="Rechercher dans le catalogue" aria-label="Rechercher dans le catalogue" value="' + esc(f.q) + '" autocomplete="off"></label>' +
      '<button type="button" class="pilule' + (f.archives ? ' on' : '') + '" data-action="archives" aria-pressed="' + f.archives + '">Afficher les articles archivés</button></div>' +
      '<div class="table table-x" id="liste">' + listeCatalogue() + '</div>';
  }
  function modalArticle(id) {
    const a = id ? art(id) : { nom: '', categorie: '', unite: 'pièce', remarque: '' };
    M = { type: 'article', id: id || null };
    const aLots = id && S.lots.some((l) => l.articleId === id);
    ouvrirModal('<div class="modal-t"><h2>' + (id ? 'Modifier l\'article' : 'Créer un article') + '</h2></div>' +
      '<form id="f-article" novalidate style="display:flex;flex-direction:column;gap:16px">' +
      '<div><label class="lab" for="a-nom">Nom</label><input id="a-nom" class="champ-t" type="text" value="' + esc(a.nom) + '" autocomplete="off"></div>' +
      '<div class="grille2 serre"><div><label class="lab" for="a-cat">Catégorie <span class="opt">(facultatif)</span></label><select id="a-cat" class="champ-t">' + options(Stock.CATEGORIES.includes(a.categorie) || !a.categorie ? Stock.CATEGORIES : Stock.CATEGORIES.concat([a.categorie]), a.categorie, 'Aucune') + '</select></div>' +
      '<div><label class="lab" for="a-unite">Unité de mesure</label><select id="a-unite" class="champ-t">' + options(Stock.UNITES, a.unite) + '</select></div></div>' +
      (aLots ? '<p class="note">Changer l\'unité renomme l\'unité de tous les lots de cet article, sans convertir les quantités.</p>' : '') +
      '<div><label class="lab" for="a-rq">Remarque <span class="opt">(facultatif)</span></label><input id="a-rq" class="champ-t" type="text" value="' + esc(a.remarque) + '" autocomplete="off"></div>' +
      '<div class="actions"><button type="button" class="btn grand" data-action="fermer-modal">Fermer</button><button type="submit" class="btn primaire grand">Enregistrer</button></div>' +
      (id ? '<div class="actions">' + (aLots ? '<button type="button" class="btn" data-action="archiver-article" data-id="' + id + '">' + (a.archive ? 'Désarchiver' : 'Archiver (masquer des suggestions)') + '</button>' : '<button type="button" class="btn danger" data-action="supprimer-article" data-id="' + id + '">Supprimer l\'article</button>') + '</div>' +
        (aLots ? '<p class="note">Cet article a un historique : il ne peut pas être supprimé, seulement archivé.</p>' : '') : '') + '</form>');
  }

  // ---------- À consommer en priorité ----------
  function vuePeremption() {
    listeCourante = null;
    const lots = S.lots.map((lot) => ({ lot, reste: S.reste.get(lot.id) || 0 })).filter((l) => l.reste > 0 && l.lot.datePeremption)
      .sort((a, b) => a.lot.datePeremption.localeCompare(b.lot.datePeremption) || a.lot.id - b.lot.id);
    const sans = S.lots.filter((l) => (S.reste.get(l.id) || 0) > 0 && !l.datePeremption).length;
    const cols = '--cols: 1.5fr 1.5fr 1.1fr 0.7fr 1fr 0.9fr';
    return entete('À consommer en priorité', { sous: 'Tous les congélateurs, par date de péremption' }) +
      '<div class="table table-x">' + (lots.length
        ? '<div class="lg tete" style="' + cols + '"><span>Péremption</span><span>Article</span><span>Congélateur</span><span>Lot</span><span>Entrée</span><span class="droite">Quantité</span></div>' +
          lots.map((l) => { const a = art(l.lot.articleId); const c = cong(l.lot.congelateurId); return '<a class="lg" style="' + cols + '" href="#/article/' + a.id + '/' + c.id + '"><span>' + pastille(l.lot.datePeremption) + '</span><strong>' + esc(a.nom) + '</strong><span class="nomc" style="--c:' + c.couleur + '">' + esc(c.court) + '</span><span>' + Stock.numeroLot(l.lot.id) + '</span><span>' + fmtDate(l.lot.dateEntree) + '</span><strong class="droite">' + qU(l.reste, a.unite) + '</strong></a>'; }).join('')
        : '<p class="vide">Aucun lot en stock n\'a de date de péremption.</p>') + '</div>' +
      '<p class="note">Alerte « bientôt » : ' + S.params.seuilAlerteJours + ' jours avant la date (réglable dans Sauvegarde et réglages).' + (sans ? ' ' + sans + (sans > 1 ? ' lots en stock n\'ont' : ' lot en stock n\'a') + ' pas de date de péremption.' : '') + '</p>';
  }

  // ---------- Historique ----------
  function listeHistorique() {
    const f = etat.hist;
    const v = S.mouvements.filter((m) => {
      const jour = (() => { const d = new Date(m.date); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); })();
      return (!f.article || String(m.articleId) === f.article) && (!f.cong || m.congelateurId === f.cong) && (!f.type || m.type === f.type) && (!f.du || jour >= f.du) && (!f.au || jour <= f.au);
    }).reverse();
    return lignesMouvements(v.slice(0, f.limite)) + (v.length > f.limite ? '<p class="vide"><button type="button" class="btn" data-action="hist-plus">Afficher les mouvements plus anciens (' + (v.length - f.limite) + ')</button></p>' : '') +
      '<p class="note" style="padding:10px 18px">' + v.length + (v.length > 1 ? ' mouvements' : ' mouvement') + '</p>';
  }
  function vueHistorique() {
    listeCourante = listeHistorique;
    const f = etat.hist;
    const dernier = S.mouvements[S.mouvements.length - 1];
    return entete('Historique', { actions: '<button type="button" class="btn contour" data-action="annuler-derniere"' + (!dernier || dernier.type === 'annulation' ? ' disabled' : '') + '>Annuler la dernière opération</button>' }) +
      '<div class="outils"><span class="note">Filtrer</span>' +
      '<select class="pilule" data-filtre="hist.article" aria-label="Article">' + options(S.articles.slice().sort(parNom).map((a) => [a.id, a.nom]), f.article, 'Tous les articles') + '</select>' +
      '<select class="pilule" data-filtre="hist.cong" aria-label="Congélateur">' + options(S.congelateurs.map((c) => [c.id, c.court]), f.cong, 'Tous les congélateurs') + '</select>' +
      '<select class="pilule" data-filtre="hist.type" aria-label="Type de mouvement">' + options(Object.keys(Stock.TYPES).map((k) => [k, Stock.TYPES[k]]), f.type, 'Tous les types') + '</select>' +
      '<label class="note">Du <input type="date" class="pilule" data-filtre="hist.du" value="' + esc(f.du) + '"></label><label class="note">au <input type="date" class="pilule" data-filtre="hist.au" value="' + esc(f.au) + '"></label></div>' +
      '<div class="table table-x" id="liste">' + listeHistorique() + '</div>' +
      '<p class="note">Aucun mouvement n\'est jamais effacé : une annulation ou une correction ajoute une ligne.</p>';
  }

  // ---------- Sauvegarde et réglages ----------
  function vueSauvegarde() {
    listeCourante = null;
    const p = S.params;
    return entete('Sauvegarde et réglages') +
      '<div class="grille2"><section class="bloc"><h2>Sauvegarder</h2>' +
      '<p>Dernière sauvegarde : <strong>' + (p.derniereSauvegarde ? fmtDateHeure(p.derniereSauvegarde) : 'jamais') + '</strong></p>' +
      '<p class="note">Le fichier contient tout : catalogue (' + S.articles.length + '), lots (' + S.lots.length + '), historique (' + S.mouvements.length + ' mouvements) et réglages. Sur iPad, choisissez « Enregistrer dans Fichiers », puis iCloud Drive.</p>' +
      '<button type="button" class="btn primaire tres-grand" data-action="exporter">Enregistrer une sauvegarde</button>' +
      '<p class="note">Il n\'existe pas de sauvegarde automatique vers iCloud : c\'est ce bouton qui protège vos données. Un rappel s\'affiche sur l\'accueil quand la dernière sauvegarde est trop ancienne.</p></section>' +
      '<section class="bloc"><h2>Restaurer</h2><p class="note">Restaurer remplace <strong>toutes</strong> les données actuelles par celles du fichier choisi. Le fichier est contrôlé avant, et une confirmation vous est demandée.</p>' +
      '<label class="btn contour grand" for="fichier" style="width:100%">Choisir un fichier de sauvegarde…</label><input id="fichier" type="file" accept=".json,application/json,text/plain" style="position:absolute;left:-9999px;opacity:0" tabindex="-1"></section></div>' +
      '<section class="bloc"><h2>Réglages</h2><form id="f-reglages" class="grille2 serre" novalidate>' +
      '<div><label class="lab" for="r-seuil">Alerte « à consommer bientôt » (jours avant la date)</label><input id="r-seuil" class="champ-t" type="number" inputmode="numeric" min="1" max="365" value="' + p.seuilAlerteJours + '"></div>' +
      '<div><label class="lab" for="r-rappel">Rappel de sauvegarde (jours depuis la dernière)</label><input id="r-rappel" class="champ-t" type="number" inputmode="numeric" min="1" max="365" value="' + p.rappelSauvegardeJours + '"></div>' +
      '<div><button type="submit" class="btn primaire grand">Enregistrer les réglages</button></div></form></section>' +
      '<p class="note">Version ' + VERSION_APP + ' · ' + (estInstallee() ? 'application installée sur l\'écran d\'accueil' : 'ouverte dans le navigateur (non installée)') + ' · stockage protégé par le navigateur : ' + (persistant === true ? 'oui' : persistant === false ? 'non confirmé' : 'inconnu') + '</p>';
  }
  async function enregistrerFichier(nom, texte) {
    const ua = navigator.userAgent || '';
    const mobile = /iPad|iPhone|iPod|Android/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (mobile && navigator.canShare && typeof File === 'function') {
      for (const type of ['application/json', 'text/plain']) {
        const fichier = new File([texte], nom, { type });
        if (navigator.canShare({ files: [fichier] })) {
          try { await navigator.share({ files: [fichier], title: nom }); return true; }
          catch (e) { if (e && e.name === 'AbortError') return false; }
        }
      }
    }
    const url = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  }
  async function importer(fichier) {
    const texte = await fichier.text();
    const v = Sauvegarde.verifier(texte);
    if (!v.ok) {
      M = { type: 'info' };
      ouvrirModal('<div class="modal-t"><h2>Restauration refusée</h2></div><div class="erreurs">Le fichier « ' + esc(fichier.name) + ' » ne peut pas être restauré :<ul>' + v.erreurs.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div><p>Vos données actuelles n\'ont pas été modifiées.</p><div class="actions"><button type="button" class="btn primaire grand" data-action="fermer-modal">Fermer</button></div>');
      return;
    }
    const dernier = S.mouvements[S.mouvements.length - 1];
    const plusAncien = dernier && v.exporteLe && new Date(dernier.date) > new Date(v.exporteLe);
    const oui = await confirmer('Remplacer toutes les données ?',
      '<p>Sauvegarde du <strong>' + fmtDateHeure(v.exporteLe) + '</strong> : ' + v.compte.articles + ' articles, ' + v.compte.lots + ' lots, ' + v.compte.mouvements + ' mouvements.</p>' +
      '<p style="margin-top:8px">Données actuelles : ' + S.articles.length + ' articles, ' + S.lots.length + ' lots, ' + S.mouvements.length + ' mouvements. Elles seront <strong>effacées et remplacées</strong>.</p>' +
      (plusAncien ? '<div class="avert" style="margin-top:12px">Attention : des opérations ont été enregistrées après cette sauvegarde (dernière le ' + fmtDateHeure(dernier.date) + '). Elles seront perdues.</div>' : ''),
      'Remplacer mes données', true);
    if (!oui) return;
    await Sauvegarde.restaurer(v.donnees);
    await Stock.definirParametre('derniereSauvegarde', v.exporteLe);
    await rendre();
    toast('Sauvegarde restaurée : ' + v.compte.articles + ' articles, ' + v.compte.lots + ' lots, ' + v.compte.mouvements + ' mouvements.');
  }

  // ---------- Navigation ----------
  const VUES = { '': vueAccueil, congelateur: vueCongelateur, entree: vueEntree, sortie: vueSortie, transfert: vueTransfert, article: vueArticle, catalogue: vueCatalogue, peremption: vuePeremption, historique: vueHistorique, sauvegarde: vueSauvegarde };
  /* dessiner() affiche l'écran courant à partir de la photo S (immédiat).
   * rendre() relit d'abord la base ; les appels sont mis en file pour ne jamais se chevaucher. */
  function dessiner() {
    const hash = location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/');
    const route = VUES[parts[0]] ? parts[0] : '';
    const change = hash !== routePrec;
    routePrec = hash;
    if (change) {
      fermerModal();
      if (routePrecedenteConnue) document.getElementById('toasts').innerHTML = '';
      routePrecedenteConnue = true;
      if (route === 'entree') E = nouvelleEntree(cong(parts[1]) ? parts[1] : null);
      if (route === 'sortie') { etat.sortie.q = ''; etat.sortie.cong = cong(parts[1]) ? parts[1] : (S.params.dernierCongelateur || S.congelateurs[0].id); }
      if (route === 'congelateur') etat.cong = { q: '', tri: etat.cong.tri, cat: '' };
      if (route === 'historique') etat.hist.limite = 200;
      if (route === '') etat.accueil.q = '';
    }
    if (route === 'entree' && !E) E = nouvelleEntree(null);
    if (route === 'sortie' && !cong(etat.sortie.cong)) etat.sortie.cong = S.congelateurs[0].id;
    app.innerHTML = VUES[route](parts[1], parts[2]);
    if (change) window.scrollTo(0, 0);
    document.body.dataset.ecran = hash;
    if (M && M.type === 'sortie') modalSortie();
  }
  let fileRendu = Promise.resolve();
  function rendre() {
    const suite = async () => { S = await Stock.charger(); dessiner(); };
    fileRendu = fileRendu.then(suite, suite);
    return fileRendu;
  }
  function majListe() {
    const l = document.getElementById('liste');
    if (l && listeCourante) l.innerHTML = listeCourante();
  }

  // ---------- Actions ----------
  const actions = {
    'recherche': () => { const r = document.getElementById('rech'); r.focus(); r.scrollIntoView({ block: 'center' }); },
    'tri': (el) => { etat.cong.tri = el.dataset.id; dessiner(); },
    'archives': () => { etat.catalogue.archives = !etat.catalogue.archives; dessiner(); },
    'epuises': () => { etat.fiche.epuises = !etat.fiche.epuises; dessiner(); },
    'hist-plus': () => { etat.hist.limite += 200; majListe(); },
    'fermer-modal': () => fermerModal(),
    'confirmer-oui': () => { const r = M && M.resolve; fermerModal(); if (r) r(true); },
    'confirmer-non': () => { const r = M && M.resolve; fermerModal(); if (r) r(false); },

    // Entrée
    'e-cong': (el) => { E.congelateurId = el.dataset.id; document.getElementById('zone-cong').innerHTML = choixCong('e-cong', E.congelateurId); },
    'e-choisir': (el) => { lireEntree(); E.article = art(Number(el.dataset.id)); E.creation = false; majZonesEntree(); },
    'e-creer': () => { lireEntree(); E.creation = true; E.texte = E.texte.trim().replace(/^./, (c) => c.toUpperCase()); majZonesEntree(); document.getElementById('e-cat').focus(); },
    'e-changer': () => { lireEntree(); E.article = null; E.creation = false; E.texte = ''; majZonesEntree(); document.getElementById('e-art').focus(); },

    // Sortie
    's-cong': (el) => { etat.sortie.cong = el.dataset.id; dessiner(); },
    'ouvrir-sortie': (el) => { M = { type: 'sortie', articleId: Number(el.dataset.id), cong: el.dataset.cong || etat.sortie.cong, lotId: null }; modalSortie(); },
    'm-lot': (el) => { const id = el.dataset.id ? Number(el.dataset.id) : null; M.lotId = (id === null || M.lotId === id) ? null : id; modalSortie(); },
    'confirmer-sortie': async () => {
      const a = art(M.articleId);
      const c = cong(M.cong);
      const r = await Stock.sortie({ congelateurId: M.cong, articleId: M.articleId, quantite: lireNombre(document.getElementById('m-q').value), lotId: M.lotId });
      await Stock.definirParametre('dernierCongelateur', M.cong);
      fermerModal();
      await rendre();
      const reste = Stock.arrondi(Stock.lotsActifs(S, a.id, c.id).reduce((t, l) => t + l.reste, 0));
      toast('Sorti : ' + qU(r.quantite, a.unite) + ' de ' + a.nom + ' · ' + c.court + ' · reste ' + qU(reste, a.unite), { annulable: true });
    },

    // Transfert
    't-de': (el) => { etat.transfert.de = el.dataset.id; etat.transfert.articleId = null; dessiner(); },
    't-vers': (el) => { etat.transfert.vers = el.dataset.id; dessiner(); },
    'vers-transfert': (el) => { etat.transfert = { de: el.dataset.cong, vers: null, articleId: Number(el.dataset.id) }; location.hash = '#/transfert'; },

    // Correction
    'ouvrir-correction': (el) => modalCorrection(Number(el.dataset.id)),
    'confirmer-correction': async () => {
      const r = await Stock.correction({ lotId: M.lotId, nouvelleQuantite: lireNombre(document.getElementById('c-q').value), remarque: document.getElementById('c-rq').value });
      fermerModal();
      await rendre();
      toast('Correction enregistrée : ' + fmtQ(r.avant) + ' → ' + qU(r.apres, r.article.unite) + ' (' + r.article.nom + ')', { annulable: true });
    },

    // Annulation
    'annuler-derniere': async () => {
      const dernier = S.mouvements[S.mouvements.length - 1];
      if (!dernier) throw new Stock.ErreurStock('Aucune opération à annuler.');
      const a = art(dernier.articleId);
      const nom = { entree: 'l\'entrée', sortie: 'la sortie', transfert_entrant: 'le transfert', transfert_sortant: 'le transfert', correction: 'la correction' }[dernier.type];
      if (dernier.type === 'annulation') throw new Stock.ErreurStock('La dernière opération est déjà une annulation.');
      document.getElementById('toasts').innerHTML = '';
      const oui = await confirmer('Annuler la dernière opération ?', '<p>Cela annule ' + nom + ' du ' + fmtDateHeure(dernier.date) + ' (' + esc(a ? a.nom : '') + '). L\'annulation sera inscrite dans l\'historique.</p>', 'Annuler l\'opération');
      if (!oui) return;
      await Stock.annulerDerniere();
      await rendre();
      toast('Opération annulée. Le stock est revenu à son état précédent.');
    },

    // Catalogue
    'creer-article': () => modalArticle(null),
    'modifier-article': (el) => modalArticle(Number(el.dataset.id)),
    'archiver-article': async (el) => { const a = art(Number(el.dataset.id)); await Stock.archiverArticle(a.id, !a.archive); fermerModal(); await rendre(); toast(a.archive ? 'Article désarchivé.' : 'Article archivé.'); },
    'supprimer-article': async (el) => {
      const a = art(Number(el.dataset.id));
      const oui = await confirmer('Supprimer « ' + a.nom + ' » ?', '<p>Cet article n\'a aucun mouvement. Il sera retiré du catalogue.</p>', 'Supprimer', true);
      if (!oui) return;
      await Stock.supprimerArticle(a.id);
      location.hash = '#/catalogue';
      await rendre();
      toast('Article supprimé.');
    },

    // Sauvegarde
    'exporter': async () => {
      const exp = await Sauvegarde.exporter();
      const fait = await enregistrerFichier(exp.nomFichier, exp.texte);
      if (!fait) { toast('Sauvegarde abandonnée : aucun fichier n\'a été enregistré.', { erreur: true }); return; }
      await Stock.definirParametre('derniereSauvegarde', exp.exporteLe);
      await rendre();
      toast('Fichier « ' + exp.nomFichier + ' » créé. Vérifiez qu\'il est bien enregistré dans Fichiers.');
    }
  };
  const formulaires = {
    'f-entree': validerEntree,
    'f-transfert': async () => {
      const T = etat.transfert;
      const a = art(Number(document.getElementById('t-art').value));
      const r = await Stock.transfert({ articleId: a.id, de: T.de, vers: T.vers, quantite: lireNombre(document.getElementById('t-q').value) });
      await rendre();
      toast('Transféré : ' + qU(r.quantite, a.unite) + ' de ' + a.nom + ' · ' + cong(T.de).court + ' → ' + cong(T.vers).court, { annulable: true });
    },
    'f-article': async () => {
      const p = { nom: document.getElementById('a-nom').value, categorie: document.getElementById('a-cat').value, unite: document.getElementById('a-unite').value, remarque: document.getElementById('a-rq').value };
      if (M.id) await Stock.modifierArticle(M.id, p); else await Stock.creerArticle(p);
      const creation = !M.id;
      fermerModal();
      await rendre();
      toast(creation ? 'Article ajouté au catalogue.' : 'Article modifié.');
    },
    'f-reglages': async () => {
      const seuil = Math.round(lireNombre(document.getElementById('r-seuil').value));
      const rappel = Math.round(lireNombre(document.getElementById('r-rappel').value));
      if (!(seuil >= 1 && seuil <= 365) || !(rappel >= 1 && rappel <= 365)) throw new Stock.ErreurStock('Les deux réglages doivent être compris entre 1 et 365 jours.');
      await Stock.definirParametre('seuilAlerteJours', seuil);
      await Stock.definirParametre('rappelSauvegardeJours', rappel);
      await rendre();
      toast('Réglages enregistrés.');
    }
  };

  // ---------- Écoute des gestes ----------
  document.addEventListener('click', (ev) => {
    const pas = ev.target.closest('[data-step]');
    if (pas) {
      const champ = document.getElementById(pas.dataset.pour);
      const min = Number(champ.dataset.min || 0);
      const max = champ.dataset.max != null ? Number(champ.dataset.max) : Infinity;
      let v = lireNombre(champ.value);
      if (!Number.isFinite(v)) v = 0;
      v = Stock.arrondi(Math.min(max, Math.max(min, v + Number(pas.dataset.step))));
      champ.value = String(v).replace('.', ',');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const el = ev.target.closest('[data-action]');
    if (el && /^confirmer-(oui|non)$/.test(el.dataset.action)) { actions[el.dataset.action](); return; } // réponse à une question : jamais bloquée
    if (el && actions[el.dataset.action]) { ev.preventDefault(); executer(() => actions[el.dataset.action](el)); return; }
    if (ev.target.id === 'voile' && M && M.type !== 'confirmer') fermerModal();
  });
  document.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = formulaires[ev.target.id];
    if (f) executer(f);
  });
  function surSaisie(ev) {
    const t = ev.target;
    if (t.dataset && t.dataset.filtre) { const [a, b] = t.dataset.filtre.split('.'); etat[a][b] = t.value; if (a === 'hist') etat.hist.limite = 200; majListe(); return; }
    if (t.id === 'e-art') { E.texte = t.value; document.getElementById('suggestions').innerHTML = suggestions(); return; }
    if (t.id === 'e-unite') { lireEntree(); document.getElementById('zone-q').innerHTML = stepper('e-q', Number.isFinite(E.quantite) && E.quantite > 0 ? E.quantite : 1, E.unite); return; }
    if (t.id === 'm-q') { document.getElementById('m-resume').innerHTML = resumeSortie(); return; }
    if (t.id === 't-art' && ev.type === 'change') { etat.transfert.articleId = Number(t.value); dessiner(); return; }
    if (t.id === 'fichier' && ev.type === 'change' && t.files && t.files[0]) { const f = t.files[0]; t.value = ''; executer(() => importer(f)); }
  }
  document.addEventListener('input', surSaisie);
  document.addEventListener('change', (ev) => { if (ev.target.id === 't-art' || ev.target.id === 'fichier') surSaisie(ev); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && M && M.type !== 'confirmer') fermerModal(); });
  window.addEventListener('hashchange', () => { rendre().catch(erreur); });

  // ---------- Démarrage ----------
  (async () => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        persistant = await navigator.storage.persisted();
        if (!persistant) persistant = await navigator.storage.persist();
      }
    } catch (_) { /* sans importance */ }
    try { await rendre(); }
    catch (e) { app.innerHTML = '<div class="bloc"><h1>Impossible d\'ouvrir la base de données</h1><p>' + esc(e && e.message ? e.message : e) + '</p><p class="note">Vérifiez que la navigation privée est désactivée, puis rouvrez l\'application.</p></div>'; }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Mode hors connexion indisponible :', e));
    }
  })();
})();
