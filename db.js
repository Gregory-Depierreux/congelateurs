/* Base de données locale (IndexedDB).
 * Cinq tables : congelateurs, articles, lots, mouvements, parametres.
 * Aucune quantité de stock n'est enregistrée : elle est toujours recalculée
 * à partir des mouvements. */
(function (root) {
  'use strict';

  const NOM_BASE = 'congelateurs';
  const VERSION_SCHEMA = 1; // à augmenter (avec une migration ci-dessous) si la structure change
  const TABLES = ['congelateurs', 'articles', 'lots', 'mouvements', 'parametres'];

  const CONGELATEURS_INITIAUX = [
    { id: 'cuisine', nom: 'Congélateur cuisine', court: 'Cuisine', couleur: '#1D5FA6', ordre: 1 },
    { id: 'salle', nom: 'Congélateur salle à manger', court: 'Salle à manger', couleur: '#A84B00', ordre: 2 },
    { id: 'cave', nom: 'Congélateur cave', court: 'Cave', couleur: '#5A3F9E', ordre: 3 }
  ];

  let promesseBase = null;

  function req(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function ouvrir() {
    if (promesseBase) return promesseBase;
    promesseBase = new Promise((resolve, reject) => {
      const r = root.indexedDB.open(NOM_BASE, VERSION_SCHEMA);
      r.onupgradeneeded = (e) => {
        const db = r.result;
        // Migrations : chaque bloc ne s'exécute qu'une fois et ne supprime jamais de données.
        if (e.oldVersion < 1) {
          const c = db.createObjectStore('congelateurs', { keyPath: 'id' });
          CONGELATEURS_INITIAUX.forEach((x) => c.put(x));
          const a = db.createObjectStore('articles', { keyPath: 'id', autoIncrement: true });
          a.createIndex('nomNorm', 'nomNorm', { unique: true });
          const l = db.createObjectStore('lots', { keyPath: 'id', autoIncrement: true });
          l.createIndex('articleId', 'articleId');
          const m = db.createObjectStore('mouvements', { keyPath: 'id', autoIncrement: true });
          m.createIndex('lotId', 'lotId');
          db.createObjectStore('parametres', { keyPath: 'cle' });
        }
      };
      r.onsuccess = () => {
        const db = r.result;
        db.onversionchange = () => { db.close(); promesseBase = null; };
        resolve(db);
      };
      r.onerror = () => { promesseBase = null; reject(r.error); };
    });
    return promesseBase;
  }

  async function fermer() {
    if (!promesseBase) return;
    const db = await promesseBase;
    db.close();
    promesseBase = null;
  }

  /* Exécute fn dans UNE transaction : tout est enregistré, ou rien.
   * Si fn lève une erreur, la transaction est annulée et l'erreur est renvoyée. */
  async function transaction(tables, mode, fn) {
    const db = await ouvrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(tables, mode);
      let resultat;
      let erreur = null;
      tx.oncomplete = () => resolve(resultat);
      tx.onerror = () => { if (!erreur) erreur = tx.error; };
      tx.onabort = () => reject(erreur || tx.error || new Error('Opération interrompue.'));
      const s = {};
      tables.forEach((n) => { s[n] = tx.objectStore(n); });
      Promise.resolve()
        .then(() => fn(s))
        .then((v) => { resultat = v; })
        .catch((err) => {
          erreur = err;
          try { tx.abort(); } catch (_) { reject(err); }
        });
    });
  }

  root.DB = { ouvrir, fermer, transaction, req, TABLES, NOM_BASE, VERSION_SCHEMA };
})(globalThis);
