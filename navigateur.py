"""Test de l'application dans un vrai navigateur (Chrome), à la taille d'un iPad.
Rejoue le scénario obligatoire en cliquant dans l'interface.

Lancement (depuis le dossier du projet) :
    python3 -m http.server 8765 &
    python3 tests/navigateur.py
Nécessite : pip install playwright, et Google Chrome installé.
"""
import json, os, re, sys, tempfile
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get("URL", "http://localhost:8765/")
CAPTURES = os.environ.get("CAPTURES", "/tmp/captures")
os.makedirs(CAPTURES, exist_ok=True)
n = 0


def ok(texte):
    global n
    n += 1
    print(f"  ok {n:2d} - {texte}")


def aller(page, ecran):
    """Change d'écran et attend que l'écran demandé soit réellement affiché."""
    page.goto(URL + "#/" + ecran)
    page.wait_for_selector(f'body[data-ecran="{ecran}"]')


def stock(page, article):
    """Quantités affichées par la recherche de l'accueil : [cuisine, salle, cave]."""
    aller(page, "")
    page.fill("#rech", article)
    page.wait_for_selector("#liste a.lg")
    cellules = page.locator("#liste a.lg").first.locator("span, strong").all_inner_texts()
    page.fill("#rech", "")
    return [c.replace("\u202f", " ").replace("\xa0", " ") for c in cellules][-3:]


def entree(page, cong, nom, quantite, date=None, peremption=None, creer=False):
    aller(page, "entree")
    page.click(f'.seg-b:has-text("{cong}")')
    page.fill("#e-art", nom)
    if creer:
        page.click('button[data-action="e-creer"]')
        page.select_option("#e-cat", "Viande")
        page.select_option("#e-unite", "pièce")
    else:
        page.click(f'button[data-action="e-choisir"]:has-text("{nom}")')
    page.fill("#e-q", str(quantite))
    if date:
        page.fill("#e-de", date)
    if peremption:
        page.fill("#e-dp", peremption)
    page.click('button:has-text("Ajouter au stock")')
    expect(page.locator(".toast")).to_contain_text("Ajouté")


with sync_playwright() as p:
    profil = tempfile.mkdtemp()
    erreurs = []

    def ouvrir():
        ctx = p.chromium.launch_persistent_context(profil, channel="chrome", headless=True, viewport={"width": 1180, "height": 820}, accept_downloads=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.on("pageerror", lambda e: erreurs.append(str(e)))
        page.on("console", lambda m: erreurs.append(m.text) if m.type == "error" else None)
        page.goto(URL)
        page.wait_for_selector(".cartes")
        return ctx, page

    ctx, page = ouvrir()
    page.screenshot(path=f"{CAPTURES}/01-accueil-vide.png")

    # 1-3
    entree(page, "Cuisine", "Steak haché", 10, "2026-11-10", "2027-05-10", creer=True)
    ok("article « Steak haché » créé depuis le formulaire d'entrée ; 10 ajoutés en cuisine")
    page.fill("#e-art", "STEAK hache")
    expect(page.locator('button[data-action="e-creer"]')).to_have_count(0)
    ok("« STEAK hache » : l'article existant est proposé, pas de création en double")
    entree(page, "Cave", "Steak haché", 5, "2026-11-10")
    ok("5 steaks ajoutés en cave")
    # 4
    r = stock(page, "Steak"); assert r == ["10 pièces", "—", "5 pièces"], repr(r)
    ok("stocks indépendants : cuisine 10, salle à manger —, cave 5")
    # 5-6
    entree(page, "Cuisine", "Steak haché", 5, "2026-11-12", "2027-05-12")
    page.screenshot(path=f"{CAPTURES}/02-entree.png")
    aller(page, "congelateur/cuisine")
    expect(page.locator("#liste a.lg")).to_contain_text("15 pièces")
    expect(page.locator("#liste a.lg")).to_contain_text("2 lots")
    page.screenshot(path=f"{CAPTURES}/03-congelateur.png")
    ok("deuxième entrée à une autre date : 15 pièces en 2 lots en cuisine")
    # 7-8
    aller(page, "sortie/cuisine")
    page.click('button[data-action="ouvrir-sortie"]')
    assert page.input_value("#m-q") == "1"
    page.click('.modal button[data-step="1"]')
    page.click('.modal button[data-step="1"]')
    expect(page.locator("#m-resume")).to_contain_text("il restera 12 pièces")
    page.screenshot(path=f"{CAPTURES}/04-sortie.png")
    page.click('button:has-text("Confirmer la sortie")')
    expect(page.locator(".toast")).to_contain_text("reste 12 pièces")
    ok("sortie de 3 (quantité 1 par défaut, puis + +) : reste 12")
    aller(page, "article/1/cuisine")
    lots = page.locator("section.bloc").first.locator(".lg:not(.tete)")
    expect(lots.nth(0)).to_contain_text("10/11/2026")
    expect(lots.nth(0).locator("strong.droite")).to_have_text("7")
    expect(lots.nth(1).locator("strong.droite")).to_have_text("5")
    page.screenshot(path=f"{CAPTURES}/05-fiche-article.png")
    ok("la sortie a été déduite du lot le plus ancien : 7 + 5")
    # 9-10
    aller(page, "sortie/cuisine")
    page.click('button[data-action="ouvrir-sortie"]')
    page.fill("#m-q", "13")
    expect(page.locator("#m-resume")).to_contain_text("supérieure au stock")
    page.click('button:has-text("Confirmer la sortie")')
    expect(page.locator(".toast.err")).to_contain_text("refusée")
    ok("sortie de 13 pour un stock de 12 : message d'erreur")
    page.click('button[data-action="fermer-modal"]')
    assert stock(page, "Steak")[0] == "12 pièces"
    ok("opération refusée, stock inchangé (12)")
    # 11-12
    aller(page, "transfert")
    page.click('.bloc >> nth=0 >> .seg >> nth=0 >> .seg-b:has-text("Cuisine")')
    page.click('.bloc >> nth=0 >> .seg >> nth=1 >> .seg-b:has-text("Salle à manger")')
    page.fill("#t-q", "2")
    page.screenshot(path=f"{CAPTURES}/06-transfert.png")
    page.click('button:has-text("Transférer")')
    expect(page.locator(".toast")).to_contain_text("Transféré")
    ok("transfert de 2 steaks de la cuisine vers la salle à manger")
    assert stock(page, "Steak") == ["10 pièces", "2 pièces", "5 pièces"], stock(page, "Steak")
    ok("trois stocks après transfert : 10 / 2 / 5")
    # 13
    aller(page, "historique")
    types = page.locator("#liste .type").all_inner_texts()
    assert types == ["Transfert entrant", "Transfert sortant", "Sortie", "Entrée", "Entrée", "Entrée"], types
    ok("historique : 3 entrées, 1 sortie, transfert sortant + entrant, du plus récent au plus ancien")
    # 14-15
    aller(page, "article/1/cave")
    page.locator("section.bloc").first.locator('button[data-action="ouvrir-correction"]').click()
    page.click('.modal button[data-step="-1"]')
    page.fill("#c-rq", "Vérification physique")
    page.click('button:has-text("Enregistrer la correction")')
    expect(page.locator(".toast")).to_contain_text("5 → 4 pièces")
    ok("correction manuelle du lot de la cave : 5 → 4")
    aller(page, "historique")
    expect(page.locator("#liste .lg:not(.tete)").first).to_contain_text("Correction")
    expect(page.locator("#liste .lg:not(.tete)").first).to_contain_text("5 → 4 pièces")
    page.screenshot(path=f"{CAPTURES}/07-historique.png")
    ok("la correction apparaît dans l'historique avec avant et après")
    # 16-17 : fermer complètement le navigateur, puis le rouvrir
    ctx.close()
    ok("navigateur fermé puis rouvert")
    ctx, page = ouvrir()
    assert stock(page, "Steak") == ["10 pièces", "2 pièces", "4 pièces"], stock(page, "Steak")
    aller(page, "")
    page.wait_for_selector(".cartes")
    page.screenshot(path=f"{CAPTURES}/08-accueil.png")
    ok("données toujours présentes après réouverture : 10 / 2 / 4")
    # 18
    aller(page, "sauvegarde")
    with page.expect_download() as dl:
        page.click('button[data-action="exporter"]')
    fichier = os.path.join(profil, dl.value.suggested_filename)
    dl.value.save_as(fichier)
    contenu = json.load(open(fichier, encoding="utf-8"))
    assert contenu["compte"] == {"congelateurs": 3, "articles": 1, "lots": 4, "mouvements": 7, "parametres": 1}, contenu["compte"]
    ok(f"sauvegarde exportée : {dl.value.suggested_filename} (1 article, 4 lots, 7 mouvements)")
    # Protection : fichier incorrect refusé
    faux = os.path.join(profil, "faux.json")
    open(faux, "w", encoding="utf-8").write(open(fichier, encoding="utf-8").read().replace('"quantite":10', '"quantite":99'))
    page.set_input_files("#fichier", faux)
    expect(page.locator(".modal")).to_contain_text("Restauration refusée")
    page.click('button[data-action="fermer-modal"]')
    # 19-20 : modifier le stock, puis restaurer
    aller(page, "sortie/cave")
    page.click('button[data-action="ouvrir-sortie"]')
    page.click('button:has-text("Confirmer la sortie")')
    expect(page.locator(".toast")).to_contain_text("Sorti")
    assert stock(page, "Steak")[2] == "3 pièces"
    aller(page, "sauvegarde")
    page.set_input_files("#fichier", fichier)
    expect(page.locator(".modal")).to_contain_text("Remplacer toutes les données")
    expect(page.locator(".modal")).to_contain_text("seront perdues")
    page.screenshot(path=f"{CAPTURES}/09-restauration.png")
    page.click('button:has-text("Remplacer mes données")')
    expect(page.locator(".toast")).to_contain_text("Sauvegarde restaurée")
    ok("sauvegarde restaurée (fichier modifié refusé avant ; confirmation explicite demandée)")
    assert stock(page, "Steak") == ["10 pièces", "2 pièces", "4 pièces"], stock(page, "Steak")
    aller(page, "historique")
    assert len(page.locator("#liste .type").all_inner_texts()) == 7
    aller(page, "catalogue")
    expect(page.locator("#liste a.lg")).to_have_count(1)
    ok("catalogue (1), stocks (10 / 2 / 4) et historique (7 mouvements) restaurés")

    # Compléments : annulation, hors connexion, écrans restants, téléphone
    aller(page, "sortie/cuisine")
    page.click('button[data-action="ouvrir-sortie"]')
    page.click('button:has-text("Confirmer la sortie")')
    page.click('.toast button[data-action="annuler-derniere"]')
    page.click('button[data-action="confirmer-oui"]')
    expect(page.locator(".toast")).to_contain_text("Opération annulée")
    assert stock(page, "Steak")[0] == "10 pièces"
    print("     annulation de la dernière opération : stock revenu à 10, ligne « Annulation » ajoutée")
    aller(page, "peremption")
    expect(page.locator("a.lg")).to_have_count(3)
    page.screenshot(path=f"{CAPTURES}/10-a-consommer.png")
    page.goto(URL)
    page.wait_for_function("navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true)")
    page.wait_for_timeout(1500)
    ctx.set_offline(True)
    page.reload()
    page.wait_for_selector(".cartes")
    assert stock(page, "Steak")[0] == "10 pièces"
    ctx.set_offline(False)
    print("     hors connexion : l'application se recharge et affiche le stock")
    page.set_viewport_size({"width": 820, "height": 1180})
    aller(page, "")
    page.wait_for_selector(".cartes")
    page.screenshot(path=f"{CAPTURES}/11-ipad-portrait.png")
    page.set_viewport_size({"width": 390, "height": 844})
    page.reload()
    page.wait_for_selector(".cartes")
    page.screenshot(path=f"{CAPTURES}/12-telephone.png", full_page=True)
    ctx.close()

    if erreurs:
        print("\nErreurs JavaScript relevées :", *erreurs, sep="\n  ")
        sys.exit(1)
    print(f"\nTest navigateur terminé : {n} vérifications réussies, aucune erreur JavaScript.")
