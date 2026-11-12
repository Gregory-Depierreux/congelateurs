/* Sauvegarde et restauration : export d'un fichier JSON complet,
 * contrôle d'intégrité avant toute restauration. */
(function (root) {
  'use strict';
  const DB = root.DB;
  const Stock = root.Stock;
  const FORMAT = 'congelateurs-sauvegarde';
  const VERSION_FORMAT = 1;

  /* Somme de contrôle (cyrb53) : détecte un fichier tronqué ou modifié. */
  function controle(texte) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < texte.length; i++) {
      const c = texte.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  function compter(d) {
    const n = {};
    DB.TABLES.forEach((t) => { n[t] = d[t].length; });
    return n;
  }

  async function exporter() {
    const donnees = await Stock.lireTout();
    const maintenant = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const horodatage = maintenant.getFullYear() + '-' + p(maintenant.getMonth() + 1) + '-' + p(maintenant.getDate()) + '_' + p(maintenant.getHours()) + 'h' + p(maintenant.getMinutes());
    const contenu = {
      format: FORMAT,
      version: VERSION_FORMAT,
      schema: DB.VERSION_SCHEMA,
      exporteLe: maintenant.toISOString(),
      compte: compter(donnees),
      controle: controle(JSON.stringify(donnees)),
      donnees
    };
    return { nomFichier: 'congelateurs_' + horodatage + '.json', texte: JSON.stringify(contenu), exporteLe: contenu.exporteLe, compte: contenu.compte };
  }

  /* Vérifie un fichier AVANT toute écriture. Renvoie { ok, erreurs, donnees, exporteLe, compte }. */
  function verifier(texte) {
    const erreurs = [];
    let c;
    try { c = JSON.parse(texte); } catch (_) { return { ok: false, erreurs: ['Ce fichier n\'est pas lisible (il est peut-être incomplet).'] }; }
    if (!c || c.format !== FORMAT) return { ok: false, erreurs: ['Ce fichier n\'est pas une sauvegarde de l\'application Congélateurs.'] };
    if (typeof c.version !== 'number' || c.version > VERSION_FORMAT) return { ok: false, erreurs: ['Cette sauvegarde vient d\'une version plus récente de l\'application. Mettez l\'application à jour avant de la restaurer.'] };
    const d = c.donnees;
    if (!d || DB.TABLES.some((t) => !Array.isArray(d[t]))) return { ok: false, erreurs: ['La sauvegarde est incomplète : une partie des données manque.'] };
    if (controle(JSON.stringify(d)) !== c.controle) erreurs.push('Le contenu du fichier a été modifié ou abîmé (somme de contrôle incorrecte).');
    const n = compter(d);
    if (!c.compte || DB.TABLES.some((t) => c.compte[t] !== n[t])) erreurs.push('Le nombre d\'enregistrements ne correspond pas à celui annoncé.');
    if (d.congelateurs.length === 0) erreurs.push('La sauvegarde ne contient aucun congélateur.');
    const idsCong = new Set(d.congelateurs.map((x) => x.id));
    const idsArt = new Set(d.articles.map((x) => x.id));
    const idsLot = new Set(d.lots.map((x) => x.id));
    if (d.lots.some((l) => !idsArt.has(l.articleId) || !idsCong.has(l.congelateurId))) erreurs.push('Un lot fait référence à un article ou à un congélateur absent.');
    if (d.mouvements.some((m) => !idsLot.has(m.lotId) || typeof m.quantite !== 'number')) erreurs.push('Un mouvement fait référence à un lot absent ou a une quantité invalide.');
    const reste = new Map();
    d.mouvements.forEach((m) => reste.set(m.lotId, (reste.get(m.lotId) || 0) + m.quantite));
    if (Array.from(reste.values()).some((v) => Stock.arrondi(v) < 0)) erreurs.push('Un lot aurait une quantité négative.');
    return { ok: erreurs.length === 0, erreurs, donnees: d, exporteLe: c.exporteLe, compte: n };
  }

  /* Remplace toutes les données, en une seule transaction. */
  function restaurer(donnees) {
    return DB.transaction(DB.TABLES, 'readwrite', async (s) => {
      for (const t of DB.TABLES) {
        await DB.req(s[t].clear());
        for (const ligne of donnees[t]) await DB.req(s[t].put(ligne));
      }
    });
  }

  root.Sauvegarde = { exporter, verifier, restaurer, controle, FORMAT, VERSION_FORMAT };
})(globalThis);
