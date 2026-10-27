/* X – oma ulkoasu (content.js)
   1) Lukee popupin asetukset ja asettaa ne CSS-muuttujiksi <html>-elementtiin.
   2) Piilottaa dockin alas skrollatessa ja tuo sen takaisin ylös
      skrollatessa tai kun hiiri vie alareunaan. */

(function () {
  'use strict';

  const root = document.documentElement;

  /* =========================================================
     1. Asetukset chrome.storage.syncistä CSS-muuttujiksi
     ========================================================= */
  const maaritykset = new Map(globalThis.OMA_ASETUKSET.map((m) => [m.key, m]));

  function asetaMuuttuja(key, arvo) {
    const m = maaritykset.get(key);
    if (!m) return;
    if (arvo === undefined || arvo === null || arvo === '') {
      // Tyhjä arvo -> content.css:n :root-oletus takaisin käyttöön
      root.style.removeProperty('--' + key);
      return;
    }
    root.style.setProperty('--' + key, globalThis.omaCssArvo(m, arvo));
  }

  /* Tiivis tila on CSS:n kannalta oma tilansa, mutta sitä ei ohjata
     omalla asetuksella: se seuraa suoraan --gapia. Arvo luetaan
     lasketusta tyylistä, jotta myös content.cssän oletus kelpaa. */
  function paivitaTiivis() {
    const gap = parseFloat(getComputedStyle(root).getPropertyValue('--gap'));
    root.toggleAttribute('data-tiivis', gap === 0);
  }

  chrome.storage.sync.get(globalThis.omaOletukset(), (tallennetut) => {
    if (chrome.runtime.lastError) return;
    for (const [key, arvo] of Object.entries(tallennetut)) asetaMuuttuja(key, arvo);
    paivitaTiivis();
  });

  // Muutos popupissa näkyy heti, ilman sivun uudelleenlatausta
  chrome.storage.onChanged.addListener((muutokset, alue) => {
    if (alue !== 'sync') return;
    for (const [key, muutos] of Object.entries(muutokset)) {
      asetaMuuttuja(key, muutos.newValue);
    }
    paivitaTiivis();
  });

  /* =========================================================
     1b. Postauskentän leveys samaksi kuin postauskorteilla

     X kaventaa aikajanan kortteja tilanteesta riippuen, eikä sitä
     saa luotettavasti kiinni CSS:llä: kavennus voi tulla miltä
     tahansa kääretasolta ja millä tahansa ominaisuudella. Siksi
     kortin todellinen leveys ja sijainti mitataan ajossa ja
     annetaan CSS-muuttujina postauskentälle.
     ========================================================= */
  const VAKAA_MS = 400;
  let edellinenMitta = '';
  let vakaaArvo = '';
  let vakaaHetki = 0;
  let kaytossa = false;

  function sovitaKentta() {
    const sarake = document.querySelector('[data-testid="primaryColumn"]');
    const kortti = document.querySelector('[data-testid="cellInnerDiv"] article[data-testid="tweet"]');
    if (!sarake || !kortti) return;
    const s = sarake.getBoundingClientRect();
    const k = kortti.getBoundingClientRect();
    if (k.width < 200) return;
    const leveys = Math.round(k.width);
    const vasen = Math.round(k.left - s.left);

    /* Jos kortit ovat käytännössä sarakkeen levyisiä, mitattua arvoa ei
       tarvita: kenttä saa koko leveyden. Tämä estää sen, että
       yksittäinen kapea välitila jäisi kentän leveydeksi.

       Muuttujaa ei saa poistaa vaan sille annetaan 100%: ilman sitä
       kenttä putoaa CSS:n oletukseen width: auto, jonka X kutistaa
       omilla säännöillään kortteja kapeammaksi. */
    if (Math.abs(leveys - Math.round(s.width)) <= 8 && vasen <= 8) {
      if (edellinenMitta !== 'taysi') {
        edellinenMitta = 'taysi';
        root.style.setProperty('--cardWidth', '100%');
        root.style.setProperty('--cardLeft', '0px');
      }
      return;
    }

    const mitta = leveys + '/' + vasen;

    /* Latauksen aikana mitta heittelee, ja väärä arvo näkyi kentän
       vilahduksena. Ensimmäinen arvo otetaan käyttöön vasta kun se on
       pysynyt samana VAKAA_MS ajan; sen jälkeen muutokset (esim.
       ikkunan koon muutos) menevät läpi heti. */
    if (mitta !== vakaaArvo) {
      vakaaArvo = mitta;
      vakaaHetki = performance.now();
      if (!kaytossa) return;
    }
    if (!kaytossa) {
      if (performance.now() - vakaaHetki < VAKAA_MS) return;
      kaytossa = true;
    }

    if (mitta === edellinenMitta) return;   // ei turhia tyylikirjoituksia
    edellinenMitta = mitta;
    root.style.setProperty('--cardWidth', leveys + 'px');
    root.style.setProperty('--cardLeft', vasen + 'px');
  }

  /* ResizeObserver päivittää mitan samassa framessa kuin kortin koko
     muuttuu. Pelkkä ajastin jätti latauksen ajaksi vanhentuneen mitan
     näkyviin, jolloin kenttä vilahti väärän levyisenä. */
  const tarkkailija = new ResizeObserver(sovitaKentta);
  let tarkkailtava = null;

  function seuraaKorttia() {
    const kortti = document.querySelector('[data-testid="cellInnerDiv"] article[data-testid="tweet"]');
    if (kortti && kortti !== tarkkailtava) {
      if (tarkkailtava) tarkkailija.unobserve(tarkkailtava);
      tarkkailtava = kortti;             // virtualisoitu lista vaihtaa korttia
      tarkkailija.observe(kortti);
    }
    const sarake = document.querySelector('[data-testid="primaryColumn"]');
    if (sarake) tarkkailija.observe(sarake);

    /* Osa säännöistä on tarkoitettu vain etusivun aikajanalle (esim.
       "Show N posts" -palkki). Merkitään nykyinen sivu <html>-elementtiin,
       jotta CSS voi rajata ne – muuten ne osuvat myös Exploreen, jossa
       kaikki solut ovat postauksettomia. */
    const polku = location.pathname;
    const sivu = polku === '/home' ? 'home'
      : polku.startsWith('/notifications') ? 'ilmoitukset'
      : 'muu';
    if (root.dataset.sivu !== sivu) root.dataset.sivu = sivu;

    luoPallo();
    luoKanjit();
    luoPiirrokset();
    asemoiPallo();
    hoidaChat();
    sovitaKentta();
    tallennaTila();
  }

  /* =========================================================
     1c. Chat-pallo oikeaan alareunaan

     Korvaa X:n oman chat-napin: seuraa ikkunan oikeaa reunaa,
     asettuu sarakkeen viereiseen tyhjään tilaan jos sitä on, ja
     himmenee ahtaalla ettei peitä postauksia. Silmät seuraavat
     kursoria ja räpsähtävät satunnaisin välein. Klikkaus ohjataan
     X:n omaan nappiin, joten chat avautuu kuten ennenkin.
     ========================================================= */
  const PALLO_KOKO = 56;
  let pallo = null;
  let silmat = null;

  /* Käyttäjän itse valitsema paikka (pallon keskipiste). Null =
     automaattinen asemointi sarakkeen viereen. Säilyy latausten yli. */
  let omaSijainti = null;

  chrome.storage.local.get('palloSijainti', (t) => {
    if (chrome.runtime.lastError) return;
    omaSijainti = t.palloSijainti || null;
    asemoiPallo();
  });

  /* X:n chat-nappi on itse asiassa sama paneeli kutistettuna
     (55x55) ja asuu shadow DOM:issa, joten sitä ei löydy
     document.querySelectorAllilla. Kaikki kulkee shadow-juuren
     kautta: avaus, auki/kiinni-tila ja piilotus. */
  function chatVarjo() {
    const isanta = document.querySelector('[data-testid="xchatEmbedDrawer"]');
    return (isanta && isanta.shadowRoot) || null;
  }

  /* Kiinni ollessaan sisältölohko on merkitty luokalla "invisible". */
  function chatAuki(juuri) {
    const sisalto = juuri && juuri.querySelector('[data-testid="dm-container"]');
    const kaare = sisalto && sisalto.closest('.absolute');
    return !!kaare && !kaare.classList.contains('invisible');
  }

  /* Avauselementti shadow-juuresta. Useampi yritys, koska X:n
     luokat ovat Tailwindia eivätkä pysyviä tunnisteita. Viimeinen
     osuma kirjataan tilatietoihin, jotta vika näkyy popupissa. */
  let avausTapa = 'ei yritetty';

  function etsiAvaus(juuri) {
    const ikoni = juuri && juuri.querySelector('[data-icon="icon-messages-stroke"]');
    /* Light DOM -kääre ensin: se on ainoa tapa joka on todistetusti
       avannut paneelin. Shadow-juuren päällyskerros toimi vain
       ensimmäisellä kerralla, joten se on vasta varalla. */
    const yritykset = [
      ['light DOM -kääre', () => document.querySelector('[data-testid="chat-drawer-main"]')],
      ['light DOM -juuri', () => document.querySelector('[data-testid="chat-drawer-root"]')],
      ['cursor-pointer drawerin alla', () => juuri && juuri.querySelector('[data-xchat-app="drawer"] .cursor-pointer')],
      ['cursor-pointer', () => juuri && juuri.querySelector('.cursor-pointer')],
      ['viesti-ikonin kääre', () => ikoni && ikoni.closest('div')],
      ['drawerin sisin laatikko', () => juuri && juuri.querySelector('[data-xchat-app="drawer"] > div > div')]
    ];
    for (const [nimi, hae] of yritykset) {
      const el = hae();
      if (el) { avausTapa = nimi; return el; }
    }
    avausTapa = juuri ? 'ei löytynyt' : 'ei shadowia eikä kääreitä';
    return null;
  }

  /* React-komponentit kuuntelevat usein pointer-tapahtumia, joita
     pelkkä .click() ei tuota. Lähetetään koko sarja. */
  function klikkaa(el) {
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    /* pointerId ja isPrimary ovat oletuksena 0/false, ja moni
       kirjasto ohittaa tapahtumat jotka eivät ole ensisijaisia.
       Myös koordinaatit annetaan, koska osa käsittelijöistä
       tarkistaa osuman sijainnin. */
    const perus = {
      bubbles: true, cancelable: true, composed: true, view: window,
      button: 0, detail: 1, clientX: x, clientY: y, screenX: x, screenY: y
    };
    const osoitin = Object.assign({}, perus, {
      pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1
    });

    const sarja = [
      ['pointerover', osoitin, 0], ['mouseover', perus, 0],
      ['pointerdown', osoitin, 1], ['mousedown', perus, 1],
      ['pointerup', osoitin, 0], ['mouseup', perus, 0],
      ['click', perus, 0]
    ];
    for (const [laji, pohja, napit] of sarja) {
      const Tapahtuma = laji.startsWith('pointer') && window.PointerEvent ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Tapahtuma(laji, Object.assign({}, pohja, { buttons: napit })));
    }
  }

  /* Jos avaus ei onnistu, ei siirrytä chat-sivulle: jätetään X:n
     oma kupla näkyviin, jolloin sen voi klikata käsin. Tila näkyy
     popupin "chat avaustapa" -rivillä. */
  let piilotaKupla = true;

  function luovuta() {
    piilotaKupla = false;
    avausTapa = 'avaus ei onnistunut – X:n kupla näkyviin';
    hoidaChat();
  }

  function avaaChat() {
    /* Kupla on kiinni ollessaan piilotettu. Palautetaan näkyvyys
       klikkauksen ajaksi; hoidaChat piilottaa sen uudelleen jos
       paneeli ei auennut. */
    piilotaKupla = true;                 // uusi yritys, uusi mahdollisuus
    const isanta = document.querySelector('[data-testid="chat-drawer-root"]');
    asetaTyyli(isanta, 'visibility', 'visible');

    const juuri = chatVarjo();
    const kohteet = [];

    /* Paras kohde ei ole arvattu valitsin vaan se elementti, jonka
       selain itse osumatestaa kuplan kohdalta. Kupla istuu kääreen
       oikeassa alakulmassa (kääre on 400x55, kupla 55x55). */
    if (juuri && juuri.elementFromPoint && isanta) {
      const r = isanta.getBoundingClientRect();
      const el = juuri.elementFromPoint(r.right - 28, r.bottom - 28);
      if (el) kohteet.push(['osumatesti shadowissa', el]);
    }

    const haettu = etsiAvaus(juuri);
    if (haettu) kohteet.push([avausTapa, haettu]);

    if (!kohteet.length) {
      luovuta();
      return;
    }

    /* Kokeillaan kohteita järjestyksessä, mutta odotetaan kunnolla:
       paneelin avautuminen vie hetken, ja liian aikainen toinen
       klikkaus osuu jo auenneeseen paneeliin – esimerkiksi
       keskustelulistan linkkiin, jolloin selain siirtyy /i/chat-sivulle. */
    let i = 0;

    function avautui() {
      const k = document.querySelector('[data-testid="chat-drawer-root"]');
      if (k && k.getBoundingClientRect().height > 100) return true;
      const j = chatVarjo();
      return !!j && chatAuki(j);
    }

    function yrita() {
      if (avautui()) { piilotaKupla = true; hoidaChat(); return; }
      if (i >= kohteet.length) { luovuta(); return; }
      const [nimi, el] = kohteet[i++];
      avausTapa = nimi;
      /* Linkkiä ei klikata koskaan: se tarkoittaisi että osuma meni
         paneelin sisältöön eikä kuplaan. */
      if (el.closest && el.closest('a[href]')) { yrita(); return; }
      klikkaa(el);
      odota(0);
    }

    function odota(kulunut) {
      if (avautui()) { piilotaKupla = true; hoidaChat(); return; }
      hoidaChat();
      if (kulunut < 1000) {
        setTimeout(() => odota(kulunut + 120), 120);
        return;
      }
      yrita();                             // vasta sekunnin jälkeen seuraava
    }

    yrita();
  }

  /* Kiinni: X:n oma kupla piiloon, pallo näkyviin.
     Auki: paneeli näkyviin, pallo pois alta. */
  /* Tilan kysely sekunnin välein näkyi käyttäjälle: X merkitsee
     paneelin kiinni vasta sulkeutumisanimaation jälkeen, joten
     kupla ehti vilahtaa. Tarkkaillaan muutoksia sen sijaan. */
  let chatTarkkailija = null;
  let tarkkailtuVarjo = null;

  function tarkkaileChatia(isanta, juuri) {
    if (!chatTarkkailija) chatTarkkailija = new MutationObserver(() => hoidaChat());
    if (!isanta.dataset.omaTarkkailu) {
      isanta.dataset.omaTarkkailu = '1';
      chatTarkkailija.observe(isanta, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    if (juuri && juuri !== tarkkailtuVarjo) {
      tarkkailtuVarjo = juuri;
      chatTarkkailija.observe(juuri, {
        subtree: true, childList: true,
        attributes: true, attributeFilter: ['class', 'style']
      });
    }
  }

  /* Kirjoitetaan tyyli vain jos arvo muuttuu: muuten oma kirjoitus
     laukaisisi tarkkailijan ja syntyisi ikuinen silmukka. */
  function asetaTyyli(el, nimi, arvo) {
    if (!el || el.style.getPropertyValue(nimi) === arvo) return;
    el.style.setProperty(nimi, arvo, 'important');
  }

  function hoidaChat() {
    const isanta = document.querySelector('[data-testid="chat-drawer-root"]');
    if (!isanta) return;
    const juuri = chatVarjo();
    if (juuri) tyylitaChat(juuri);
    tarkkaileChatia(isanta, juuri);
    /* Ilman shadow-juurta paneelia ei ole vielä avattu kertaakaan,
       eli se on kiinni – ei poistuta, vaan piilotetaan kupla.
       Luokan lisäksi katsotaan kääreen korkeutta: kiinni se on 55 px,
       auki 530. Korkeus muuttuu heti, luokka vasta animaation
       jälkeen, joten tämä tunnistaa avauksen luotettavammin. */
    const korkea = isanta.getBoundingClientRect().height > 100;
    const auki = korkea || (juuri ? chatAuki(juuri) : false);

    /* Itsekorjaus: jos paneeli on auki, avaus on onnistunut, joten
       mahdollinen aiempi luovutus perutaan. Ilman tätä yksi väärä
       aikakatkaisu jätti kuplan näkyviin koko sessioksi. */
    if (auki) piilotaKupla = true;

    const nakyva = auki || !piilotaKupla;
    asetaTyyli(isanta, 'visibility', nakyva ? 'visible' : 'hidden');
    asetaTyyli(pallo, 'display', auki ? 'none' : 'flex');
  }

  function luoPallo() {
    if (pallo || !document.body) return;
    pallo = document.createElement('button');
    pallo.id = 'oma-chat-pallo';
    pallo.type = 'button';
    pallo.setAttribute('aria-label', 'Avaa chat');
    pallo.innerHTML =
      '<span class="oma-kasvot">' +
      '<span class="oma-silma"></span><span class="oma-silma"></span>' +
      '</span>';
    pallo.addEventListener('click', (e) => {
      if (raahattu) {                      // raahaus ei saa avata chattia
        raahattu = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      avaaChat();
    });
    kiinnitaRaahaus();
    document.body.appendChild(pallo);
    silmat = pallo.querySelectorAll('.oma-silma');
    rapsyta();
  }

  /* Sarakkeen oikealle puolelle jäävä tyhjä tila; ahtaalla pallo
     menee nurkkaan ja himmenee kunnes hiiri käy sen päällä. */
  function asemoiPallo() {
    if (!pallo) return;

    if (omaSijainti) {
      const reuna = PALLO_KOKO / 2 + 8;
      let x = Math.min(Math.max(omaSijainti.x, reuna), window.innerWidth - reuna);
      const y = Math.min(Math.max(omaSijainti.y, reuna), window.innerHeight - reuna);

      /* Ikkunan kaventuessa sarake voi kasvaa valitun paikan päälle.
         Työnnetään pallo silloin lähimmälle vapaalle sivustalle,
         ettei se jää postausten alle. */
      const sarake = document.querySelector('[data-testid="primaryColumn"]');
      if (sarake) {
        const s = sarake.getBoundingClientRect();
        if (x + PALLO_KOKO / 2 > s.left && x - PALLO_KOKO / 2 < s.right) {
          const oikealla = window.innerWidth - s.right;
          x = oikealla >= s.left
            ? Math.min(window.innerWidth - reuna, s.right + reuna)
            : Math.max(reuna, s.left - reuna);
        }
      }

      pallo.style.left = Math.round(x - PALLO_KOKO / 2) + 'px';
      pallo.style.top = Math.round(y - PALLO_KOKO / 2) + 'px';
      pallo.style.right = 'auto';
      pallo.style.bottom = 'auto';
      pallo.dataset.ahdas = 'ei';   // itse valittua paikkaa ei himmennetä
      return;
    }

    pallo.style.left = 'auto';
    pallo.style.top = 'auto';
    pallo.style.bottom = '18px';
    const sarake = document.querySelector('[data-testid="primaryColumn"]');
    const oikeaReuna = sarake ? sarake.getBoundingClientRect().right : window.innerWidth;
    const tila = window.innerWidth - oikeaReuna;
    const ahdas = tila < PALLO_KOKO + 32;
    pallo.dataset.ahdas = ahdas ? 'kylla' : 'ei';
    pallo.style.right = (ahdas ? 16 : Math.round((tila - PALLO_KOKO) / 2)) + 'px';
  }

  function rapsyta() {
    if (!pallo) return;
    pallo.dataset.rapsy = 'kylla';
    setTimeout(() => { if (pallo) pallo.dataset.rapsy = 'ei'; }, 130);
    setTimeout(rapsyta, 2500 + Math.random() * 4000);
  }

  const KAARRE = 340;        // px: tällä etäisyydellä käännös on täysi
  let hiiriX = 0;
  let hiiriY = 0;
  let silmaPyynto = false;

  /* Pehmeä rajoitus: arvo kutistuu asymptoottisesti kohti ±1, joten
     kursorin viemisellä kauas ei ole äkkipysäystä eikä kynnystä. */
  function rajaa(x) {
    return x / (1 + Math.abs(x));
  }

  window.addEventListener('mousemove', (e) => {
    hiiriX = e.clientX;
    hiiriY = e.clientY;
    if (silmaPyynto || !silmat) return;
    silmaPyynto = true;
    requestAnimationFrame(() => {
      silmaPyynto = false;
      if (!pallo) return;
      const r = pallo.getBoundingClientRect();
      const keskiX = r.left + r.width / 2;
      const keskiY = r.top + r.height / 2;
      /* Suunta yksiköttömänä arvona -1…1. CSS kertoo sen asteilla,
         joten kääntymän voimakkuutta säädetään yhdestä paikasta.
         KAARRE pehmentää alkua: pienet liikkeet lähellä palloa eivät
         heilauta päätä täysille. */
      const kx = rajaa((hiiriX - keskiX) / KAARRE);
      const ky = rajaa((hiiriY - keskiY) / KAARRE);
      pallo.style.setProperty('--kx', kx.toFixed(3));
      pallo.style.setProperty('--ky', ky.toFixed(3));
    });
  }, { passive: true });

  /* Raahaus: pointer-tapahtumat, jotta hiiri ja kosketus toimivat
     samalla koodilla. setPointerCapture pitää seurannan pallolla
     vaikka kursori liukuisi sen ulkopuolelle. */
  let raahaus = null;
  let raahattu = false;

  function kiinnitaRaahaus() {
    pallo.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = pallo.getBoundingClientRect();
      raahaus = {
        dx: e.clientX - (r.left + r.width / 2),   // tarttumakohta keskipisteestä
        dy: e.clientY - (r.top + r.height / 2),
        alkuX: e.clientX,
        alkuY: e.clientY
      };
      raahattu = false;
      pallo.setPointerCapture(e.pointerId);
      e.preventDefault();                  // ei tekstin maalausta raahatessa
    });

    pallo.addEventListener('pointermove', (e) => {
      if (!raahaus) return;
      // Pieni kynnys, ettei tärähtänyt klikkaus laukaise siirtoa
      if (!raahattu && Math.hypot(e.clientX - raahaus.alkuX, e.clientY - raahaus.alkuY) < 4) return;
      raahattu = true;
      pallo.dataset.raahaus = 'kylla';
      omaSijainti = { x: e.clientX - raahaus.dx, y: e.clientY - raahaus.dy };
      asemoiPallo();
    });

    function lopetaRaahaus(e) {
      if (!raahaus) return;
      raahaus = null;
      delete pallo.dataset.raahaus;
      if (pallo.hasPointerCapture && pallo.hasPointerCapture(e.pointerId)) {
        pallo.releasePointerCapture(e.pointerId);
      }
      if (raahattu) chrome.storage.local.set({ palloSijainti: omaSijainti });
    }

    pallo.addEventListener('pointerup', lopetaRaahaus);
    pallo.addEventListener('pointercancel', lopetaRaahaus);
  }

  chrome.storage.onChanged.addListener((muutokset, alue) => {
    if (alue !== 'local' || !muutokset.palloSijainti) return;
    omaSijainti = muutokset.palloSijainti.newValue || null;
    asemoiPallo();
  });

  window.addEventListener('resize', asemoiPallo, { passive: true });

  /* =========================================================
     1d. Chat-paneelin ulkoasu (shadow DOM)

     X renderöi chat-paneelin suljettuun omaan puuhunsa
     (<template shadowrootmode="open">), jonne sivun CSS ei yllä.
     Tyylit lisätään siksi style-elementtinä shadow-juureen.
     Muuttujat periytyvät <html>-elementiltä normaalisti.
     ========================================================= */
  const CHAT_TYYLI = `
    /* Paneelin ulkokuori */
    div:has(> div > div > [data-testid="dm-container"]) {
      background-color: var(--card, #1a1a1d) !important;
      border-radius: 24px !important;
      border-color: rgba(255, 255, 255, 0.08) !important;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55) !important;
    }
    /* Sisäpinnat läpinäkyviksi, jotta kuoren väri näkyy */
    [data-testid="dm-container"],
    [data-testid="dm-inbox-panel"],
    [data-testid="dm-inbox-header"],
    [data-testid="dm-inbox-header-main"],
    [data-testid="dm-search-bar"],
    [data-testid="dm-conversation-scroller"] {
      background-color: transparent !important;
    }
    /* Hakukenttä samaan tyyliin kuin muualla */
    [data-testid="dm-search-input"] {
      background-color: var(--bg, #0f0f11) !important;
      border-radius: 14px !important;
    }
    /* Keskustelurivit ja tekstinapit squircleiksi */
    [data-inbox-row] {
      border-radius: 14px !important;
    }
    [data-testid="dm-inbox-dropdown-trigger"],
    [data-inbox-row] button[data-slot="xds-button"] {
      border-radius: 14px !important;
    }
  `;

  function tyylitaChat(juuri) {
    if (!juuri || juuri.getElementById('oma-chat-tyyli')) return;
    const tyyli = document.createElement('style');
    tyyli.id = 'oma-chat-tyyli';
    tyyli.textContent = CHAT_TYYLI;
    juuri.appendChild(tyyli);
  }

  /* =========================================================
     1d2. Kanji-kalat taustalla

     Muutama hahmo uimassa sisällön takana, koottu kala-aiheisista
     kanjeista (鮫 hai, 鱗 suomu, 鰭 evä, 尾 pyrstö, 鯖 makrilli).
     Kerros on z-index: -1, joten se jää aikajanan taakse.
     ========================================================= */
  /* Muodot ruudukkona: piste = tyhjä. Jokainen merkki sijoitetaan
     omaan soluunsa CSS-gridillä, joten muoto ei riipu fontin
     mitoista – ilman sitä rivit valuvat eri levyisiksi ja kala
     hajoaa, jos CJK-monospacea ei ole asennettu. */
  const KALAMUODOT = [
    ['..鰭', '尾鱗鱗鱗目', '..鰭'],
    ['....鰭', '尾..鱗鱗鱗鱗鱗', '尾鱗鱗鱗鱗鱗鱗目', '尾..鱗鱗鱗鱗鱗', '....鰭'],
    [
      '......鰭',
      '.....鱗鱗鱗',
      '尾..鱗鱗鱗鱗鱗鱗鱗',
      '尾鱗鱗鱗鱗鱗鱗鱗鱗鱗鮫',
      '尾..鱗鱗鱗鱗鱗鱗鰭',
      '.....鰭'
    ]
  ];

  /* Runkoon vaihtelua, jotta pinta näyttää kanji-taiteelta eikä
     yhdeltä toistuvalta merkiltä. */
  const SUOMUT = ['鱗', '潮', '汐', '波', '海', '泳', '鰭', '鱗', '鱗'];

  function teeRuudukko(muoto) {
    const leveys = Math.max(...muoto.map((r) => [...r].length));
    const ruudukko = document.createElement('div');
    ruudukko.className = 'oma-kala-vartalo';
    ruudukko.style.gridTemplateColumns = `repeat(${leveys}, 1em)`;

    for (const rivi of muoto) {
      const merkit = [...rivi];
      for (let x = 0; x < leveys; x++) {
        const solu = document.createElement('span');
        const merkki = merkit[x] || '.';
        if (merkki !== '.') {
          solu.textContent = merkki === '鱗'
            ? SUOMUT[Math.floor(Math.random() * SUOMUT.length)]
            : merkki;
        }
        ruudukko.appendChild(solu);
      }
    }
    return ruudukko;
  }

  function kalojenMaara() {
    const arvo = parseInt(getComputedStyle(root).getPropertyValue('--kalat'), 10);
    return Number.isFinite(arvo) ? Math.min(Math.max(arvo, 0), 10) : 0;
  }

  function teeKala() {
    const ui = document.createElement('div');
    ui.className = 'oma-kala';

    const vartalo = teeRuudukko(KALAMUODOT[Math.floor(Math.random() * KALAMUODOT.length)]);
    ui.appendChild(vartalo);

    const kesto = 110 + Math.random() * 120;     // s: hidas, rauhallinen
    const oikealle = Math.random() < 0.5;
    ui.style.top = (6 + Math.random() * 84).toFixed(1) + '%';
    ui.style.fontSize = (11 + Math.random() * 6).toFixed(1) + 'px';
    ui.style.animationName = oikealle ? 'oma-ui-oikealle' : 'oma-ui-vasemmalle';
    ui.style.animationDuration = kesto.toFixed(0) + 's';
    /* Negatiivinen viive hajauttaa kalat heti eri kohtiin, muuten ne
       lähtisivät kaikki samasta reunasta samaan aikaan. */
    ui.style.animationDelay = (-Math.random() * kesto).toFixed(0) + 's';
    vartalo.style.animationDuration = (6 + Math.random() * 6).toFixed(1) + 's';
    if (oikealle) vartalo.style.transform = 'scaleX(-1)';   // kääntyy menosuuntaan
    return ui;
  }

  function luoKanjit() {
    if (!document.body) return;
    const maara = kalojenMaara();
    let kerros = document.getElementById('oma-kanjit');

    if (!maara) { if (kerros) kerros.remove(); return; }

    if (kerros && kerros.children.length === maara) return;
    if (kerros) kerros.remove();

    kerros = document.createElement('div');
    kerros.id = 'oma-kanjit';
    for (let i = 0; i < maara; i++) kerros.appendChild(teeKala());
    document.body.appendChild(kerros);
  }

  /* =========================================================
     1d3. Piirtyvät muodot taustalla

     Käsin piirretyn oloisia kuvioita – kierre, heinäpallo ja
     silmukka – jotka piirtyvät viivana näkyviin, jäävät hetkeksi
     paikalleen ja purkautuvat samaa reittiä pois.

     Veto syntyy stroke-dasharraylla: katkoviivan pala on koko
     polun mittainen, joten offsetin siirto paljastaa viivan
     päästä päähän. Polun mitta selviää vasta DOM:issa
     (getTotalLength), joten se annetaan CSS:lle --pit-muuttujana.

     Muoto arvotaan uudelleen jokaisen kierroksen jälkeen, ettei
     sama kuvio toistu. Vaihto osuu hetkeen, jolloin viiva on joka
     tapauksessa näkymätön.
     ========================================================= */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PIIRTO_RUUTU = 100;             // SVG:n koordinaatisto (viewBox)

  /* Pieni satunnaisuus joka pisteeseen: muuten käyrät ovat
     konemaisen tarkkoja eivätkä näytä käsin vedetyiltä. */
  function hajota(x, y, maara) {
    return [x + (Math.random() - 0.5) * maara, y + (Math.random() - 0.5) * maara];
  }

  /* Pisteet pehmeäksi poluksi: piste toimii ohjauspisteenä ja käyrä
     kulkee pisteiden puolivälien kautta. Pelkillä L-paloilla tiheäkin
     kierre näyttäisi monikulmiolta. */
  function sileaPolku(pisteet) {
    if (pisteet.length < 3) return '';
    const pari = (p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2);
    let d = 'M ' + pari(pisteet[0]);
    for (let i = 1; i < pisteet.length - 1; i++) {
      const [x, y] = pisteet[i];
      const [x2, y2] = pisteet[i + 1];
      d += ` Q ${pari([x, y])} ${pari([(x + x2) / 2, (y + y2) / 2])}`;
    }
    return d + ' L ' + pari(pisteet[pisteet.length - 1]);
  }

  /* Muototehtaat palauttavat listan polkuja (polku = lista pisteitä).
     Useampi polku piirtyy peräkkäin, koska dash-pala juoksee niiden
     yhteispituuden läpi. */
  function kierre() {
    const kierroksia = 2.2 + Math.random() * 2;
    const suunta = Math.random() < 0.5 ? 1 : -1;
    const loppu = kierroksia * Math.PI * 2;
    const sade = 42 / loppu;
    const pisteet = [];
    for (let a = 0; a <= loppu; a += 0.22) {
      const r = sade * a;
      pisteet.push(hajota(50 + Math.cos(a) * r * suunta, 50 + Math.sin(a) * r, 0.5 + r * 0.05));
    }
    return [pisteet];
  }

  function heinapallo() {
    const korsia = 9 + Math.floor(Math.random() * 7);
    const polut = [];
    for (let i = 0; i < korsia; i++) {
      const alku = (i / korsia) * Math.PI * 2 + Math.random() * 0.5;
      const kaarre = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.9);
      const pituus = 28 + Math.random() * 14;
      const pisteet = [];
      for (let t = 0; t <= 1.001; t += 0.1) {
        const kulma = alku + kaarre * t;
        const r = pituus * Math.pow(t, 0.75);   // tiheä tyvi, harva latva
        pisteet.push(hajota(50 + Math.cos(kulma) * r, 50 + Math.sin(kulma) * r, 1.2));
      }
      polut.push(pisteet);
    }
    return polut;
  }

  function silmukka() {
    const teria = 3 + Math.floor(Math.random() * 4);
    const soikeus = 0.85 + Math.random() * 0.3;
    const kaanto = Math.random() * Math.PI;
    const faasi = Math.random() * Math.PI * 2;
    const pisteet = [];
    /* Hieman yli kierroksen, jotta silmukka sulkeutuu siististi. */
    for (let a = 0; a <= Math.PI * 2 + 0.25; a += 0.12) {
      /* Jälkimmäinen kerroin venyttää teriä eri mittaisiksi: tasakokoiset
         terälehdet näyttäisivät koneen piirtämiltä. */
      const r = (20 + 20 * Math.cos(teria * a)) * (1 + 0.09 * Math.sin(a * 1.7 + faasi));
      pisteet.push(hajota(
        50 + Math.cos(a + kaanto) * r * soikeus,
        50 + Math.sin(a + kaanto) * r / soikeus,
        1.6
      ));
    }
    return [pisteet];
  }

  function renkaat() {
    const kehia = 3 + Math.floor(Math.random() * 3);
    const ulko = 30 + Math.random() * 6;        // uloin kehä pysyy ruudun sisällä
    const soikeus = 0.9 + Math.random() * 0.25;
    const kaanto = Math.random() * Math.PI;
    const polut = [];
    for (let i = 0; i < kehia; i++) {
      /* Väli kasvaa ulospäin, jolloin renkaat näyttävät veteen
         levinneiltä renkailta eivätkä maalitaululta. */
      const sade = ulko * Math.pow((i + 1) / kehia, 0.85);
      const aalto = 0.03 + Math.random() * 0.05;
      const jaksoja = 2 + Math.floor(Math.random() * 3);
      const faasi = Math.random() * Math.PI * 2;
      const pisteet = [];
      for (let a = 0; a <= Math.PI * 2 + 0.3; a += 0.18) {
        const r = sade * (1 + aalto * Math.sin(jaksoja * a + faasi));
        pisteet.push(hajota(
          50 + Math.cos(a + kaanto) * r * soikeus,
          50 + Math.sin(a + kaanto) * r / soikeus,
          1.1
        ));
      }
      polut.push(pisteet);
    }
    return polut;
  }

  function aalto() {
    const viivoja = 3 + Math.floor(Math.random() * 4);
    const vali = 46 / viivoja;
    const korkeus = 5 + Math.random() * 7;
    const jaksoja = 1.2 + Math.random() * 1.3;
    const faasi = Math.random() * Math.PI * 2;
    const polut = [];
    for (let i = 0; i < viivoja; i++) {
      const y = 50 + (i - (viivoja - 1) / 2) * vali;
      /* Jokainen viiva hieman eri vaiheessa ja eri mittainen, jotta
         pino aaltoilee pehmeästi eikä näytä viivoitetulta paperilta. */
      const alku = 8 + Math.random() * 8;
      const loppu = 92 - Math.random() * 8;
      const oma = faasi + i * (0.5 + Math.random() * 0.4);
      const pisteet = [];
      for (let x = alku; x <= loppu; x += 4) {
        const t = (x - alku) / (loppu - alku);
        const vaimennus = Math.sin(Math.PI * t);     // päät laimenevat suoriksi
        pisteet.push(hajota(x, y + Math.sin(t * Math.PI * 2 * jaksoja + oma) * korkeus * vaimennus, 1));
      }
      polut.push(pisteet);
    }
    return polut;
  }

  function vyyhti() {
    /* Lissajous-käyrä: kaksi kokonaislukusuhteista heilahdusta, jolloin
       käyrä sulkeutuu itseensä ja näyttää lankavyyhdiltä. */
    const a1 = 2 + Math.floor(Math.random() * 3);
    const a2 = a1 + 1 + Math.floor(Math.random() * 2);
    const vaihe = Math.random() * Math.PI;
    const kaanto = Math.random() * Math.PI;
    const pisteet = [];
    for (let t = 0; t <= Math.PI * 2 + 0.3; t += 0.09) {
      /* Kierto vie kulmiin, joten amplitudi on ruudun puolikasta
         pienempi: muuten vyyhti leikkautuisi reunoista. */
      const x = Math.sin(a1 * t + vaihe) * 33;
      const y = Math.sin(a2 * t) * 33;
      pisteet.push(hajota(
        50 + x * Math.cos(kaanto) - y * Math.sin(kaanto),
        50 + x * Math.sin(kaanto) + y * Math.cos(kaanto),
        1.3
      ));
    }
    return [pisteet];
  }

  /* Valmiit ääriviivat: piste kahdesti peräkkäin pitää kulman
     terävänä, koska pehmennys kulkee pisteiden puolivälien kautta ja
     ajautuisi muuten kauas kärjestä. */
  function kasinVedetty(pisteet, hajonta) {
    return pisteet.map(([x, y]) => hajota(x, y, hajonta));
  }

  /* Suora reuna tarvitsee välipisteitä: kahdesta pisteestä pehmennys
     tekisi kaaren, ja tunnistettava logo muuttuisi pisaraksi. */
  function monikulmio(kulmat, paloja = 4) {
    const ulos = [];
    for (let i = 0; i < kulmat.length - 1; i++) {
      const [ax, ay] = kulmat[i];
      const [bx, by] = kulmat[i + 1];
      for (let k = 0; k < paloja; k++) {
        const t = k / paloja;
        ulos.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      }
    }
    ulos.push(kulmat[kulmat.length - 1]);
    return ulos;
  }

  /* ---- Töherrykset ja pyhä geometria --------------------------
     Nämä ovat laskettua viivaa, eivät jäljennöksiä mistään: siksi ne
     toimivat tällä tekniikalla aina – mitään ei katoa kun varjot ja
     täytöt jäävät pois, koska viiva on koko muoto. */

  function kultainenKierre() {
    const h = 0.5 + Math.random() * 0.4;

    /* Fibonaccin spiraali klassisena rakennepiirroksena: kultainen
       suorakulmio jaettuna neliöihin (21, 13, 8, 5, 3, 2, 1) ja
       spiraali neljänneskaarina neliöstä toiseen. Jakoviivat ovat
       mukana, koska juuri ne tekevät kuviosta tunnistettavan
       rakennelman eivätkä pelkkää simpukkaa. */
    const M = 92 / 34;                       // 34 x 21 ruutua -> ruutuun
    const X = (x) => 4 + x * M;
    const Y = (y) => 50 + (y - 10.5) * M;

    const kaari = (cx, cy, r, alku) => {     // neljänneskierros
      const ulos = [];
      for (let t = 0; t <= Math.PI / 2 + 0.01; t += 0.11)
        ulos.push([X(cx + Math.cos(alku + t) * r), Y(cy + Math.sin(alku + t) * r)]);
      return ulos;
    };
    /* Jokainen kaari alkaa mihin edellinen jäi, joten spiraali on
       yksi yhtenäinen veto. */
    const spiraali = [
      ...kaari(21, 21, 21, Math.PI),
      ...kaari(21, 13, 13, Math.PI * 1.5),
      ...kaari(26, 13, 8, 0),
      ...kaari(26, 16, 5, Math.PI / 2),
      ...kaari(24, 16, 3, Math.PI),
      ...kaari(24, 15, 2, Math.PI * 1.5),
      ...kaari(25, 15, 1, 0)
    ];

    const viiva = (x1, y1, x2, y2) => monikulmio([[X(x1), Y(y1)], [X(x2), Y(y2)]], 4);
    const kehys = monikulmio([
      [X(0), Y(0)], [X(34), Y(0)], [X(34), Y(21)], [X(0), Y(21)], [X(0), Y(0)]
    ], 5);
    const jaot = [
      viiva(21, 0, 21, 21), viiva(21, 13, 34, 13), viiva(26, 13, 26, 21),
      viiva(21, 16, 26, 16), viiva(24, 13, 24, 16), viiva(24, 15, 26, 15)
    ];

    return [kasinVedetty(spiraali, h), kasinVedetty(kehys, h * 0.8),
            ...jaot.map((j) => kasinVedetty(j, h * 0.8))];
  }

  function elämänkukka() {
    const h = 0.5 + Math.random() * 0.35;

    /* Elämänsiemen: kuusi ympyrää keskusympyrän ympärillä niin että
       jokainen kulkee keskipisteen kautta, ja kehä sulkee kuvion.
       Kahdeksan samanmuotoista vetoa piirtyvät rinnakkain, mikä sopii
       kuvioon jonka koko idea on toisto. */
    const R = 22.5;
    const ympyrä = (cx, cy, r, hajonta) => {
      const ulos = [];
      for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.16)
        ulos.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      return kasinVedetty(ulos, hajonta);
    };
    const vedot = [ympyrä(50, 50, R, h * 0.7)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      vedot.push(ympyrä(50 + Math.cos(a) * R, 50 + Math.sin(a) * R, R, h * 0.7));
    }
    vedot.push(ympyrä(50, 50, R * 2 + 1, h));
    return vedot;
  }

  function viisikanta() {
    const h = 0.55 + Math.random() * 0.4;

    /* Viisisakarainen tähti yhdellä vedolla, niin kuin se oikeasti
       töherretään: kärjestä kärkeen joka toisen yli, ja ympyrä
       ympärille. Kärjet kahdesti, ettei pehmennys pyöristä niitä. */
    const kärjet = [];
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + i * 2 * (Math.PI * 2 / 5);
      kärjet.push([50 + Math.cos(a) * 38, 50 + Math.sin(a) * 38]);
    }
    const tähti = [];
    for (let i = 0; i < 5; i++) {
      const [ax, ay] = kärjet[i], [bx, by] = kärjet[i + 1];
      tähti.push([ax, ay], [ax, ay]);
      for (let k = 1; k < 5; k++)
        tähti.push([ax + (bx - ax) * k / 5, ay + (by - ay) * k / 5]);
    }
    tähti.push(kärjet[0], kärjet[0]);

    const kehä = [];
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.14)
      kehä.push([50 + Math.cos(a) * 44, 50 + Math.sin(a) * 44]);

    return [kasinVedetty(tähti, h * 0.8), kasinVedetty(kehä, h)];
  }

  function apilasolmu() {
    const h = 0.5 + Math.random() * 0.4;

    /* Apilasolmu: suljettu käyrä joka risteää itsensä kolmesti.
       Yksi yhtenäinen veto alusta loppuun, kuin solmu joka
       piirretään nostamatta kynää. */
    const pisteet = [];
    for (let t = 0; t <= Math.PI * 2 + 0.06; t += 0.07) {
      const x = Math.sin(t) + 2 * Math.sin(2 * t);
      const y = Math.cos(t) - 2 * Math.cos(2 * t);
      pisteet.push(hajota(50 + x * 15.2, 50 + y * 15.2, 1.2));
    }
    return [pisteet];
  }

  function aurinko() {
    const h = 0.6 + Math.random() * 0.4;

    /* Aurinko niin kuin se vihkon marginaaliin piirretään: ympyrä ja
       eripituisia säteitä. Määrä ja pituudet arvotaan, jotta kahta
       samanlaista ei tule. */
    const kehä = [];
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.15)
      kehä.push([50 + Math.cos(a) * 20, 50 + Math.sin(a) * 20]);

    const vedot = [kasinVedetty(kehä, h)];
    const säteitä = 9 + Math.floor(Math.random() * 4);
    for (let i = 0; i < säteitä; i++) {
      const a = (i / säteitä) * Math.PI * 2 + Math.random() * 0.25;
      const alku = 26 + Math.random() * 3;
      const loppu = 36 + Math.random() * 10;
      const säde = [];
      for (let k = 0; k <= 4; k++) {
        const r = alku + (loppu - alku) * k / 4;
        säde.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
      }
      vedot.push(kasinVedetty(säde, h * 1.4));
    }
    return vedot;
  }

  function kuunsirppi() {
    const h = 0.5 + Math.random() * 0.4;

    /* Kuunsirppi yhtenä suljettuna vetona: ulkokaari ympyrää pitkin
       ja paluu loven sisäkaarta. Kaarien päät on laskettu kahden
       ympyrän (säteet 34 ja 28, keskipisteet 13 päässä toisistaan)
       leikkauspisteistä, joten ne osuvat tasan yhteen. Loveen pari
       tähtitöherrystä. */
    const sirppi = [];
    for (let a = 0.913; a <= Math.PI * 2 - 0.913; a += 0.1)
      sirppi.push([50 + Math.cos(a) * 34, 50 + Math.sin(a) * 34]);
    for (let a = -1.288; a >= -(Math.PI * 2 - 1.288); a -= 0.12)
      sirppi.push([63 + Math.cos(a) * 28, 50 + Math.sin(a) * 28]);
    sirppi.push(sirppi[0]);

    const tähti = (cx, cy, r) => {
      const ulos = [];
      for (let i = 0; i <= 4; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 2;
        const kärki = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
        ulos.push(kärki, kärki);
        if (i < 4) {
          const b = a + Math.PI / 4;
          ulos.push([cx + Math.cos(b) * r * 0.32, cy + Math.sin(b) * r * 0.32]);
        }
      }
      return ulos;
    };

    return [kasinVedetty(sirppi, h),
            kasinVedetty(tähti(77, 42, 5.5), h * 0.5),
            kasinVedetty(tähti(80, 61, 4), h * 0.5)];
  }

  function alus() {
    const h = 0.6 + Math.random() * 0.5;      // sama alus, eri käsiala

    /* Mittasuhteet on otettu Shipin piirroksesta: runko on noin kuusi
       kertaa leveytensä mittainen, nokka vie ylimmän neljänneksen, ja
       etusiivekkeet ovat iso tunnusmerkki – ne yltävät rungon puolikkaan
       verran sivuille ja alkavat jo nokan kyljestä. Pienillä tabeilla
       alus näytti ohjukselta. */
    const nokka = [[50, 2], [50, 2], [52.2, 6], [54.5, 11], [56.4, 17], [57.4, 22], [57.7, 26]];
    const runko = [
      ...nokka,
      ...monikulmio([[57.7, 26], [57.7, 95], [42.3, 95], [42.3, 26]], 6),
      ...nokka.map(([x, y]) => [100 - x, y]).reverse()
    ];

    /* Siivekkeet omina vetoinaan: rungon kanssa samassa ääriviivassa
       pehmennys pyöristäisi ne korviksi. */
    const siivet = [
      [[54.4, 11], [65.4, 19], [65.4, 25.5], [57.7, 26.4]],   // etusiivekkeet nokan kyljessä
      [[45.6, 11], [34.6, 19], [34.6, 25.5], [42.3, 26.4]],
      [[57.7, 71], [66.3, 82.5], [66.3, 95], [57.7, 95]],     // peräsiivekkeet perän tasalla
      [[42.3, 71], [33.7, 82.5], [33.7, 95], [42.3, 95]]
    ].map((kulmat) => monikulmio(kulmat, 3));

    /* Kolme moottorikelloa kurkistaa perän alta ja rengassaumat
       jakavat kyljen: niistä teräksinen alus tunnistaa itsensä. */
    const moottorit = [45.6, 50, 54.4].map((x) => monikulmio(
      [[x - 1.6, 95], [x - 2, 99], [x + 2, 99], [x + 1.6, 95]], 2
    ));
    const saumat = [31, 50, 69].map((y) => [[42.3, y], [50, y + 0.5], [57.7, y]]);

    return [
      kasinVedetty(runko, h),
      ...siivet.map((o) => kasinVedetty(o, h * 0.7)),
      ...moottorit.map((o) => kasinVedetty(o, h * 0.4)),
      ...saumat.map((o) => kasinVedetty(o, h * 0.5))
    ];
  }

  function teslanMerkki() {
    const h = 0.6 + Math.random() * 0.4;

    /* Ääriviiva on poimittu oikeasta merkistä ja skaalattu tähän
       ruutuun: keskellä alas osoittava V, olkapäiden alla pienet
       koukut ja terä, joka kapenee kärkeen. Käsin muistista piirretty
       versio muuttui aina sieneksi – muoto on tarkempi kuin miltä se
       muistuu. Pitkillä suorilla on välipisteitä, jotta tärinä saa ne
       aaltoilemaan; kahdennetut pisteet pitävät kulmat terävinä.
       Sirppi on erillinen veto, joten se piirtyy T:n jälkeen. */
    const kirjain = [
      [50.0, 96.8], [50.0, 96.8], [51.2, 90.1], [52.4, 83.4], [53.6, 76.6], [54.8, 69.9],
      [56.0, 63.2], [57.2, 56.5], [58.4, 49.7], [59.6, 43.0], [60.8, 36.3], [62.0, 29.6],
      [63.2, 22.8], [63.2, 22.8], [67.5, 22.9], [71.0, 23.1], [73.9, 23.6], [76.2, 24.2],
      [79.1, 26.4], [79.1, 26.4], [80.2, 29.8], [80.2, 29.8], [83.1, 28.5], [87.0, 26.1],
      [89.1, 24.5], [91.1, 22.6], [92.9, 20.3], [92.9, 20.3], [86.7, 17.8], [80.7, 15.8],
      [75.1, 14.4], [70.1, 13.4], [65.8, 12.8], [62.5, 12.5], [59.7, 12.3], [59.7, 12.3],
      [56.5, 16.2], [53.2, 20.2], [50.0, 24.1], [50.0, 24.1], [46.8, 20.2], [43.5, 16.2],
      [40.3, 12.3], [40.3, 12.3], [37.4, 12.5], [34.2, 12.8], [29.9, 13.4], [24.9, 14.4],
      [19.3, 15.8], [13.3, 17.8], [7.1, 20.3], [7.1, 20.3], [8.9, 22.6], [10.9, 24.5],
      [13.0, 26.1], [15.0, 27.5], [18.4, 29.2], [18.4, 29.2], [20.2, 27.9], [22.1, 25.1],
      [26.1, 23.6], [28.9, 23.1], [32.5, 22.9], [36.7, 22.8], [36.7, 22.8], [38.0, 29.6],
      [39.2, 36.3], [40.4, 43.0], [41.6, 49.7], [42.8, 56.5], [44.0, 63.2], [45.2, 69.9],
      [46.4, 76.6], [47.6, 83.4], [48.8, 90.1], [50.0, 96.8], [50.0, 96.8]
    ];
    const sirppi = [
      [50.0, 8.9], [55.1, 9.0], [60.4, 9.3], [65.8, 9.9], [71.3, 10.7], [77.0, 12.0],
      [82.7, 13.5], [88.5, 15.4], [94.4, 17.8], [94.4, 17.8], [95.7, 15.4], [96.7, 13.1],
      [96.7, 13.1], [90.6, 10.0], [84.4, 8.1], [78.2, 6.5], [72.3, 5.3], [66.4, 4.3],
      [60.8, 3.7], [55.3, 3.3], [50.0, 3.2], [44.7, 3.3], [39.2, 3.7], [33.6, 4.3],
      [27.7, 5.3], [21.8, 6.5], [15.6, 8.1], [9.4, 10.0], [3.0, 12.4], [3.0, 12.4],
      [4.0, 14.6], [5.0, 16.6], [5.0, 16.6], [11.5, 15.4], [17.3, 13.5], [23.0, 12.0],
      [28.7, 10.7], [34.2, 9.9], [39.6, 9.3], [44.9, 9.0], [50.0, 8.9]
    ];

    return [kasinVedetty(kirjain, h), kasinVedetty(sirppi, h * 0.7)];
  }

  function xMerkki() {
    const h = 0.55 + Math.random() * 0.4;

    /* X.com:n tunnus, ääriviiva poimittu oikeasta merkistä. Se ei ole
       kahta ristikkäistä viivaa vaan yksi umpinainen kirjain, jonka
       sisällä kulkee kapea aukko: laskeva veto menee nousevan takaa ja
       jättää siihen raon. Juuri rako erottaa sen tavallisesta X:stä,
       joten se piirretään omana vetonaan. Kulmat ovat kahdennettuja
       pisteitä, jotta pehmennys ei pyöristä kärkiä pois. */
    const ulko = [
      [77.3, 7.6], [82.1, 7.6], [86.9, 7.6], [91.7, 7.6], [91.7, 7.6], [87.2, 12.7],
      [82.6, 17.8], [78.1, 23.0], [73.6, 28.1], [69.1, 33.3], [64.6, 38.4], [60.0, 43.6],
      [60.0, 43.6], [64.1, 49.0], [68.3, 54.4], [72.4, 59.9], [76.5, 65.3], [80.6, 70.7],
      [84.7, 76.2], [88.8, 81.6], [92.9, 87.0], [97.0, 92.4], [97.0, 92.4], [91.2, 92.4],
      [85.4, 92.4], [79.6, 92.4], [73.8, 92.4], [68.0, 92.4], [68.0, 92.4], [64.2, 87.5],
      [60.4, 82.5], [56.6, 77.6], [52.9, 72.6], [49.1, 67.7], [45.3, 62.7], [45.3, 62.7],
      [41.0, 67.7], [36.6, 72.6], [32.3, 77.6], [28.0, 82.5], [23.6, 87.5], [19.3, 92.4],
      [19.3, 92.4], [14.5, 92.4], [9.7, 92.4], [4.9, 92.4], [4.9, 92.4], [9.1, 87.6],
      [13.3, 82.8], [17.4, 78.0], [21.6, 73.2], [25.8, 68.4], [30.0, 63.5], [34.2, 58.7],
      [38.4, 53.9], [38.4, 53.9], [34.5, 48.8], [30.5, 43.6], [26.6, 38.5], [22.7, 33.3],
      [18.7, 28.2], [14.8, 23.0], [10.9, 17.9], [6.9, 12.7], [3.0, 7.6], [3.0, 7.6],
      [8.9, 7.6], [14.9, 7.6], [20.8, 7.6], [26.8, 7.6], [32.7, 7.6], [32.7, 7.6],
      [36.8, 13.0], [40.9, 18.4], [45.0, 23.8], [49.1, 29.3], [53.2, 34.7], [53.2, 34.7],
      [57.2, 30.2], [61.3, 25.6], [65.3, 21.1], [69.3, 16.6], [73.3, 12.1], [77.3, 7.6],
      [77.3, 7.6]
    ];
    const rako = [
      [72.2, 84.0], [76.2, 84.0], [80.2, 84.0], [80.2, 84.0], [76.2, 78.7], [72.3, 73.5],
      [68.3, 68.2], [64.3, 63.0], [60.3, 57.7], [56.4, 52.5], [52.4, 47.2], [48.4, 42.0],
      [44.4, 36.7], [40.5, 31.5], [36.5, 26.2], [32.5, 21.0], [28.5, 15.7], [28.5, 15.7],
      [24.2, 15.7], [19.9, 15.7], [19.9, 15.7], [24.0, 21.0], [28.0, 26.2], [32.0, 31.5],
      [36.0, 36.7], [40.1, 42.0], [44.1, 47.2], [48.1, 52.5], [52.1, 57.7], [56.1, 63.0],
      [60.2, 68.2], [64.2, 73.5], [68.2, 78.7], [72.2, 84.0], [72.2, 84.0]
    ];

    return [kasinVedetty(ulko, h), kasinVedetty(rako, h * 0.8)];
  }

  function spacexMerkki() {
    const h = 0.5 + Math.random() * 0.35;

    /* SpaceX:n X on aivan toista maata kuin X.comin: kirjaimen nouseva
       veto jatkuu pitkäksi kaareksi, joka kaartaa sanan yli oikealle ja
       ohenee kärjeksi. Laskeva veto jää sen alle kahdeksi erilliseksi
       palaksi, koska kaari katkaisee sen keskeltä – siksi tässä on
       kolme vetoa eikä kahta. Muoto on leveä ja matala, ei X.comin
       tavoin lähes neliö. */
    const ylaveto = [
      [14.5, 45.3], [14.5, 45.3], [9.1, 45.3], [3.7, 45.3], [3.7, 45.3], [8.0, 48.4],
      [12.2, 51.5], [16.5, 54.6], [16.5, 54.6], [18.4, 53.4], [20.4, 52.1], [22.4, 50.9],
      [22.4, 50.9], [18.5, 48.1], [14.5, 45.3], [14.5, 45.3]
    ];
    const alaveto = [
      [30.2, 56.9], [30.2, 56.9], [28.4, 58.2], [26.6, 59.6], [24.8, 60.9], [24.8, 60.9],
      [29.6, 64.4], [34.4, 67.9], [34.4, 67.9], [39.8, 67.9], [45.3, 67.9], [45.3, 67.9],
      [40.3, 64.3], [35.2, 60.6], [30.2, 56.9], [30.2, 56.9]
    ];
    const kaari = [
      [97.0, 32.1], [97.0, 32.1], [92.3, 32.5], [87.6, 32.9], [82.9, 33.3], [76.4, 34.4],
      [70.0, 35.4], [64.2, 36.7], [58.4, 38.1], [53.2, 39.7], [48.0, 41.2], [43.4, 43.0],
      [38.8, 44.7], [34.8, 46.6], [30.7, 48.4], [27.2, 50.3], [23.8, 52.2], [17.9, 55.9],
      [13.0, 59.3], [9.1, 62.3], [6.2, 64.9], [4.3, 66.8], [4.3, 66.8], [9.1, 67.4],
      [14.0, 67.9], [14.0, 67.9], [17.8, 64.5], [21.6, 61.0], [25.6, 58.0], [29.6, 55.1],
      [33.8, 52.5], [37.9, 50.0], [42.1, 47.8], [46.2, 45.7], [50.4, 43.9], [54.5, 42.1],
      [58.5, 40.7], [62.5, 39.2], [66.3, 38.1], [70.1, 36.9], [73.7, 36.1], [77.2, 35.2],
      [83.6, 33.9], [89.1, 33.0], [93.6, 32.4], [97.0, 32.1]
    ];

    /* Kaari on pitkä ja sileä: sama tärinä kuin lyhyissä vedoissa
       näkyisi siinä sahalaitana. */
    return [kasinVedetty(ylaveto, h), kasinVedetty(alaveto, h), kasinVedetty(kaari, h * 0.6)];
  }

  function grokMerkki() {
    const h = 0.5 + Math.random() * 0.35;

    /* Grokin tunnus: rengas, jonka läpi viistää pitkä piikki. Ääriviiva
       on poimittu xAI:n omasta logotiedostosta (ne kaksi polkua jotka
       on merkitty id="mark"), joten renkaan katkot ja piikin kärjen
       kapeneminen ovat oikeassa suhteessa. Kaksi vetoa: rengas päättyy
       kumpaankin piikin reunaan, joten ne eivät ole yksi silmukka. */
    const kehraaja = [
      [39.3, 62.8], [44.5, 59.0], [49.7, 55.1], [54.9, 51.3], [60.1, 47.4], [65.3, 43.6],
      [70.6, 39.7], [73.1, 39.2], [73.1, 39.2], [75.0, 40.8], [75.9, 43.1], [76.5, 45.5],
      [76.8, 48.0], [77.0, 50.5], [76.9, 53.0], [76.6, 55.4], [76.0, 57.9], [75.2, 60.2],
      [74.1, 62.5], [72.8, 64.8], [71.3, 66.9], [69.5, 68.9], [67.5, 70.6], [65.4, 72.2],
      [63.3, 73.5], [61.0, 74.5], [58.7, 75.3], [56.3, 75.9], [53.8, 76.2], [51.4, 76.3],
      [48.9, 76.2], [46.4, 75.8], [43.9, 75.2], [41.5, 74.4], [41.5, 74.4], [36.2, 76.8],
      [30.9, 79.3], [30.9, 79.3], [34.7, 81.6], [38.7, 83.4], [42.7, 84.7], [46.8, 85.5],
      [50.9, 85.8], [54.9, 85.7], [58.8, 85.0], [62.7, 84.0], [66.3, 82.5], [69.8, 80.6],
      [73.1, 78.3], [76.2, 75.5], [78.3, 73.2], [80.2, 70.7], [81.9, 68.1], [83.2, 65.4],
      [84.4, 62.7], [85.3, 59.9], [85.9, 57.0], [86.3, 54.1], [86.5, 51.2], [86.4, 48.3],
      [86.1, 45.4], [85.5, 42.6], [84.7, 38.7], [84.3, 35.1], [84.2, 31.8], [84.4, 28.7],
      [85.0, 25.8], [85.8, 23.1], [86.9, 20.4], [88.3, 17.7], [89.9, 15.0], [91.8, 12.1],
      [94.0, 9.1], [96.3, 5.9], [96.3, 5.9], [92.2, 9.8], [88.1, 13.8], [84.1, 17.8],
      [79.6, 22.3], [75.1, 26.8], [70.6, 31.3], [66.2, 35.8], [61.7, 40.3], [57.2, 44.8],
      [52.7, 49.3], [48.3, 53.8], [43.8, 58.3], [39.3, 62.8], [39.3, 62.8]
    ];
    const kaari = [
      [32.9, 68.4], [32.9, 68.4], [30.4, 65.7], [28.4, 62.8], [27.0, 59.7], [26.0, 56.5],
      [25.5, 53.3], [25.4, 50.0], [25.7, 46.8], [26.5, 43.6], [27.6, 40.5], [29.1, 37.6],
      [31.0, 34.9], [33.1, 32.4], [34.9, 30.8], [36.9, 29.3], [39.0, 28.1], [41.3, 27.0],
      [43.6, 26.2], [46.1, 25.5], [48.5, 25.1], [51.1, 24.9], [53.6, 25.0], [56.2, 25.4],
      [58.7, 26.0], [61.2, 26.9], [61.2, 26.9], [66.5, 24.4], [71.8, 22.0], [71.8, 22.0],
      [69.7, 20.6], [67.3, 19.2], [64.6, 18.1], [61.4, 16.9], [58.1, 16.1], [54.8, 15.6],
      [51.4, 15.4], [48.0, 15.6], [44.6, 16.1], [41.3, 16.9], [38.1, 18.0], [35.0, 19.5],
      [32.0, 21.2], [29.1, 23.3], [26.4, 25.8], [24.1, 28.3], [22.1, 31.1], [20.3, 34.1],
      [18.8, 37.2], [17.7, 40.4], [16.9, 43.7], [16.4, 47.1], [16.2, 50.5], [16.3, 53.9],
      [16.8, 57.3], [17.6, 60.7], [18.8, 64.0], [19.5, 66.4], [19.9, 68.6], [19.6, 72.9],
      [18.1, 76.8], [15.8, 80.5], [14.4, 82.3], [12.8, 84.1], [11.2, 85.8], [9.6, 87.6],
      [7.8, 89.4], [6.1, 91.3], [4.5, 93.2], [3.0, 95.1], [3.0, 95.1], [8.0, 90.7],
      [12.9, 86.2], [17.9, 81.8], [22.9, 77.3], [27.9, 72.9], [32.8, 68.4]
    ];

    return [kasinVedetty(kehraaja, h), kasinVedetty(kaari, h)];
  }

  function grokBot() {
    const h = 0.5 + Math.random() * 0.35;

    /* Grok Botin tunnus: pallo ja kaksi vinoa rakoa oikeassa
       yläneljänneksessä. Mitat on mitattu xAI:n omasta kuvasta
       pikseleittäin ja kirjattu säteen osuuksina, joten muoto pysyy
       oikeana riippumatta tämän ruudun koosta. Raot ovat eri
       paksuisia – alempi on selvästi tukevampi – eikä se ole virhe
       mittauksessa vaan niin se on logossakin. */
    const SADE = 44;
    const RAOT = [
      {alku: [-0.056, -0.569], loppu: [0.272, -0.107], leveys: 0.266},
      {alku: [0.410, -0.787], loppu: [0.756, -0.338], leveys: 0.179}
    ];

    const kehä = [];
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.13)
      kehä.push(hajota(50 + Math.cos(a) * SADE, 50 + Math.sin(a) * SADE, 1.1));

    /* Rako on suorakaide jonka päät ovat puoliympyröitä. Kaaret
       näytteistetään ja suorat kyljet saavat välipisteitä, muuten
       pehmennys pullistaisi ne – sama syy kuin monikulmio():ssa. */
    const raot = RAOT.map(({alku, loppu, leveys}) => {
      const ax = 50 + alku[0] * SADE, ay = 50 + alku[1] * SADE;
      const bx = 50 + loppu[0] * SADE, by = 50 + loppu[1] * SADE;
      const r = leveys * SADE / 2;
      const suunta = Math.atan2(by - ay, bx - ax);
      const kaari = (x, y, mista) => {
        const ulos = [];
        for (let t = 0; t <= Math.PI + 0.01; t += 0.26)
          ulos.push([x + Math.cos(suunta + mista + t) * r, y + Math.sin(suunta + mista + t) * r]);
        return ulos;
      };
      const kylki = (p, q) => {
        const ulos = [];
        for (let k = 1; k < 4; k++)
          ulos.push([p[0] + (q[0] - p[0]) * k / 4, p[1] + (q[1] - p[1]) * k / 4]);
        return ulos;
      };
      const paa = kaari(bx, by, -Math.PI / 2);          // kärki b:n ympäri
      const tyvi = kaari(ax, ay, Math.PI / 2);          // kärki a:n ympäri
      const muoto = [
        ...paa, ...kylki(paa[paa.length - 1], tyvi[0]),
        ...tyvi, ...kylki(tyvi[tyvi.length - 1], paa[0]), paa[0]
      ];
      return kasinVedetty(muoto, h * 0.6);
    });

    return [kasinVedetty(kehä, h), ...raot];
  }

  function optimus() {
    const h = 0.55 + Math.random() * 0.4;      // sama robotti, eri käsiala

    /* Optimus. Logoista poiketen tästä ei ole vektorilähdettä, joten
       mittasuhteet on mitattu ruudukon avulla Wikimedia Commonsin
       valokuvasta (Tesla showroom, 11/2025) ja muunnettu niin että
       pään laki on 0 ja jalkapohjat 100. Hahmo on kapea: koko
       kädenväli on vain noin 23 yksikköä sataa korkeusyksikköä kohti,
       eli selvästi kapeampi kuin alus – siksi sille annetaan isompi
       laatikko SUURENNOS-taulussa.

       Osat ovat omia vetojaan: pää, visiiri, vartalo, kädet ja jalat.
       Yhtenä ääriviivana pehmennys sulattaisi raajat vartaloon. */
    const pää = [];
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.3) {
      /* Soikio, jonka laki on kapeampi kuin leuka: sellainen se on
         kuvassa, eikä tasainen muna. */
      const kapeus = 1 - 0.18 * Math.cos(a);
      pää.push([50.3 + Math.sin(a) * 4.2 * kapeus, 6.9 - Math.cos(a) * 6.9]);
    }
    /* Visiiri on se yksi piirre josta hahmon tunnistaa Optimukseksi
       eikä miksi tahansa ihmishahmoksi, joten se piirretään erikseen. */
    const visiiri = monikulmio([[46.6, 7.1], [54.0, 7.1], [53.6, 10.4], [47.0, 10.4], [46.6, 7.1]], 3);

    const vartalo = monikulmio([
      [48.1, 13.8], [48.1, 16.4],                 // kaula
      [43.5, 17.5], [43.4, 23.4], [44.1, 42.2],   // olka ja rintakehä
      [46.0, 49.4], [45.5, 55.2], [47.9, 57.8],
      [52.7, 57.8], [55.1, 55.2], [54.6, 49.4],
      [56.5, 42.2], [57.2, 23.4], [57.1, 17.5],
      [52.5, 16.4], [52.5, 13.8], [48.1, 13.8]
    ], 3);

    /* Kädet riippuvat sivuilla, kyynärpää noin 40 %:n korkeudella. */
    const kasi = (puoli) => monikulmio([
      [50 + puoli * 6.1, 20.1], [50 + puoli * 8.6, 21.5],
      [50 + puoli * 8.9, 31.0], [50 + puoli * 8.2, 40.3],
      [50 + puoli * 9.6, 52.0], [50 + puoli * 10.6, 62.1],
      [50 + puoli * 8.4, 68.2], [50 + puoli * 6.2, 66.9],
      [50 + puoli * 6.0, 52.0], [50 + puoli * 5.2, 40.3],
      [50 + puoli * 5.4, 31.0], [50 + puoli * 6.1, 20.1]
    ], 3);

    const jalka = (puoli) => monikulmio([
      [50 + puoli * 0.8, 56.6], [50 + puoli * 6.0, 57.4],
      [50 + puoli * 6.3, 68.5], [50 + puoli * 5.6, 78.6],
      [50 + puoli * 5.9, 89.5], [50 + puoli * 7.0, 97.3],
      [50 + puoli * 1.0, 97.3], [50 + puoli * 1.6, 89.5],
      [50 + puoli * 1.4, 78.6], [50 + puoli * 0.9, 68.5],
      [50 + puoli * 0.8, 56.6]
    ], 3);

    return [
      kasinVedetty(pää, h * 0.8),
      kasinVedetty(visiiri, h * 0.5),
      kasinVedetty(vartalo, h * 0.8),
      kasinVedetty(kasi(-1), h * 0.7), kasinVedetty(kasi(1), h * 0.7),
      kasinVedetty(jalka(-1), h * 0.7), kasinVedetty(jalka(1), h * 0.7)
    ];
  }

  function dogeNaama() {
    const h = 0.5 + Math.random() * 0.4;

    /* Doge. Ääriviivat on poimittu Wikimedia Commonsin Doge.svg:stä,
       jossa naama on jo valmiiksi pelkistetty muutamaksi muodoksi –
       siksi tämä lukee taustalla toisin kuin valokuvasta johdettu
       hahmo: siinä ei ole mitään mitä viiva ei kanna.

       Kymmenen vetoa: päälaki ja kuono erikseen (väriraja kulkee
       naaman poikki, ja se on osa ilmettä), korvat, silmät omine
       pupilleineen, kuononpää ja suu. Tunnuksena jokainen veto saa
       oman polkunsa, joten ne etenevät samaa tahtia. */
    const paalaki = [
      [94.2, 55.4], [94.2, 55.4], [87.4, 55.4], [80.6, 55.4], [73.8, 55.4], [67.0, 55.4],
      [60.2, 55.4], [53.4, 55.4], [46.6, 55.4], [39.8, 55.4], [33.0, 55.4], [26.2, 55.4],
      [19.4, 55.4], [12.6, 55.4], [5.8, 55.4], [5.8, 55.4], [6.1, 49.5], [7.1, 43.8],
      [8.7, 38.4], [10.9, 33.4], [13.7, 28.8], [17.1, 24.6], [21.0, 20.9], [25.3, 17.7],
      [30.2, 15.1], [35.5, 13.1], [41.3, 11.8], [47.5, 11.2], [51.2, 11.3], [54.9, 11.4],
      [61.7, 12.5], [67.8, 14.3], [73.3, 16.8], [78.2, 20.0], [82.4, 23.8], [86.0, 28.2],
      [89.0, 33.0], [91.3, 38.2], [92.9, 43.7], [93.9, 49.5], [94.2, 55.4], [94.2, 55.4]
    ];
    const kuono = [
      [94.2, 55.4], [94.2, 55.4], [93.0, 52.8], [90.0, 51.0], [85.7, 50.0], [83.3, 49.7],
      [80.8, 49.5], [78.2, 49.5], [75.7, 49.5], [73.3, 49.7], [71.0, 49.8], [68.6, 50.1],
      [64.8, 50.9], [62.0, 51.9], [60.0, 52.9], [57.9, 54.5], [55.4, 54.7], [55.4, 54.7],
      [53.0, 52.9], [50.6, 50.8], [47.9, 48.8], [44.7, 47.2], [40.6, 46.2], [38.1, 46.0],
      [34.6, 46.0], [31.7, 46.0], [28.4, 46.1], [24.7, 46.2], [20.9, 46.5], [17.1, 46.9],
      [13.6, 47.5], [10.6, 48.3], [8.1, 49.3], [5.8, 52.1], [5.8, 52.1], [5.8, 54.7],
      [5.8, 57.3], [6.0, 59.8], [6.3, 62.2], [6.7, 64.5], [7.2, 66.6], [8.4, 70.6],
      [9.8, 74.0], [11.2, 76.9], [12.4, 79.0], [13.9, 81.2], [15.6, 83.4], [17.6, 85.7],
      [19.8, 87.9], [22.4, 90.0], [25.1, 91.9], [28.2, 93.6], [31.6, 95.0], [35.2, 96.1],
      [39.2, 96.8], [43.5, 97.0], [47.8, 96.9], [52.1, 96.5], [56.1, 95.8], [60.0, 95.0],
      [63.8, 94.0], [67.2, 92.7], [70.5, 91.4], [73.5, 89.9], [76.2, 88.3], [78.7, 86.7],
      [80.8, 84.9], [82.6, 83.2], [84.0, 81.4], [85.5, 79.5], [86.9, 77.4], [88.3, 75.1],
      [89.6, 72.8], [90.8, 70.3], [91.8, 67.8], [92.7, 65.3], [93.4, 62.8], [93.9, 60.3],
      [94.2, 57.8], [94.2, 55.4], [94.2, 55.4]
    ];
    const silmaV = [
      [37.5, 43.6], [37.5, 43.6], [37.2, 46.2], [35.6, 48.5], [33.6, 50.0], [31.3, 51.1],
      [28.5, 51.6], [25.3, 51.9], [22.3, 52.0], [19.8, 52.0], [17.0, 51.4], [14.9, 50.1],
      [13.0, 48.3], [12.1, 46.0], [12.3, 43.7], [12.9, 41.5], [14.3, 39.5], [16.4, 38.1],
      [19.0, 37.1], [21.5, 36.6], [24.2, 36.2], [26.8, 36.1], [29.8, 36.3], [32.3, 37.1],
      [35.0, 38.5], [36.7, 40.3], [37.4, 42.7], [37.5, 43.6], [37.5, 43.6]
    ];
    const pupilliV = [
      [28.7, 38.2], [28.7, 38.2], [26.5, 38.2], [23.9, 38.4], [21.3, 38.8], [18.6, 39.5],
      [16.3, 40.7], [15.2, 42.6], [14.8, 44.9], [15.4, 47.1], [17.3, 49.0], [19.9, 49.8],
      [22.2, 50.1], [24.9, 50.0], [27.3, 49.9], [27.3, 49.9], [26.8, 47.6], [25.8, 45.2],
      [25.6, 42.8], [26.2, 40.6], [27.7, 38.9], [28.7, 38.2]
    ];
    const silmaO = [
      [83.9, 44.4], [83.9, 44.4], [83.8, 47.0], [83.0, 49.3], [81.3, 50.8], [78.4, 51.7],
      [74.8, 52.0], [70.5, 52.1], [66.3, 52.0], [63.0, 51.9], [60.3, 51.5], [58.0, 51.1],
      [55.4, 50.4], [53.1, 49.3], [51.2, 47.8], [50.1, 45.6], [50.1, 42.8], [50.8, 40.6],
      [52.7, 38.4], [55.0, 37.2], [57.4, 36.2], [60.9, 35.7], [64.6, 35.5], [68.7, 35.5],
      [72.5, 35.7], [75.4, 36.0], [77.7, 36.6], [79.9, 37.6], [82.2, 39.5], [83.4, 41.7],
      [83.9, 44.3], [83.9, 44.3]
    ];
    const pupilliO = [
      [74.9, 38.0], [74.9, 38.0], [72.3, 37.8], [69.4, 37.8], [66.7, 37.8], [63.9, 38.1],
      [61.2, 38.2], [58.2, 38.5], [55.3, 39.7], [53.4, 41.2], [52.4, 43.5], [52.4, 43.5],
      [53.0, 45.8], [54.3, 47.7], [56.9, 48.6], [60.0, 49.0], [62.6, 49.3], [65.3, 49.4],
      [68.0, 49.5], [70.9, 49.6], [73.7, 49.5], [73.7, 49.5], [72.1, 47.4], [71.6, 44.8],
      [71.6, 42.4], [72.4, 40.2], [73.9, 38.5], [74.9, 38.0]
    ];
    const nena = [
      [37.2, 55.1], [37.2, 55.1], [34.2, 55.2], [31.3, 55.5], [29.2, 56.3], [29.2, 56.3],
      [28.5, 58.7], [29.1, 61.5], [30.7, 64.2], [33.3, 66.1], [35.8, 66.6], [38.0, 66.3],
      [40.2, 65.5], [42.5, 63.9], [44.6, 61.5], [45.8, 58.9], [45.6, 56.1], [45.6, 56.1],
      [43.2, 55.2], [40.2, 55.1], [37.2, 55.1], [37.2, 55.1]
    ];
    const suu = [
      [35.9, 59.7], [35.9, 59.7], [35.1, 61.7], [34.6, 63.9], [34.4, 66.1], [34.4, 69.1],
      [34.6, 71.7], [35.2, 74.4], [35.9, 76.6], [35.9, 76.6], [34.0, 77.9], [34.0, 77.9],
      [31.8, 77.1], [29.5, 75.9], [27.5, 74.9], [25.2, 75.2], [25.2, 75.2], [25.1, 77.4],
      [25.1, 77.4], [27.2, 78.7], [30.2, 80.0], [32.8, 80.9], [35.0, 81.4], [38.2, 81.9],
      [41.8, 82.0], [45.2, 81.7], [48.4, 81.1], [51.5, 80.3], [54.4, 79.5], [56.6, 78.7],
      [59.0, 77.9], [61.1, 77.1], [63.3, 76.1], [64.6, 74.1], [64.6, 74.1], [62.7, 72.8],
      [62.7, 72.8], [60.1, 73.7], [57.9, 74.6], [55.3, 75.5], [53.0, 76.2], [50.1, 77.1],
      [47.6, 77.7], [45.4, 78.0], [42.7, 78.1], [40.3, 78.0], [40.3, 78.0], [39.5, 75.7],
      [38.7, 73.1], [38.3, 70.3], [38.1, 67.3], [38.2, 64.3], [38.5, 61.6], [38.5, 61.6],
      [37.3, 59.6], [37.3, 59.6], [35.9, 59.7], [35.9, 59.7]
    ];
    const korvaV = [
      [24.4, 32.3], [27.2, 31.4], [29.2, 29.8], [30.7, 28.0], [31.9, 24.9], [32.0, 22.1],
      [31.4, 19.4], [30.4, 16.8], [29.3, 14.5], [27.7, 11.8], [25.7, 9.5], [24.1, 8.0],
      [22.3, 6.5], [20.3, 5.2], [18.3, 4.0], [16.1, 3.1], [13.8, 3.4], [13.8, 3.4],
      [12.4, 5.8], [12.1, 8.0], [11.9, 10.9], [11.8, 13.5], [12.0, 16.4], [12.4, 18.8],
      [13.0, 21.4], [14.0, 24.1], [15.6, 26.9], [17.6, 29.5], [20.0, 31.4], [22.9, 32.3],
      [24.4, 32.3]
    ];
    const korvaO = [
      [64.2, 31.5], [64.2, 31.5], [66.5, 33.2], [68.9, 34.1], [71.2, 34.3], [74.5, 33.6],
      [76.8, 32.1], [78.8, 30.1], [80.4, 27.8], [81.7, 25.6], [83.0, 22.8], [83.9, 19.9],
      [84.2, 17.7], [84.4, 15.4], [84.4, 13.0], [84.3, 10.6], [83.8, 8.3], [82.3, 6.6],
      [82.3, 6.6], [79.5, 6.7], [77.5, 7.7], [75.0, 9.2], [72.8, 10.5], [70.5, 12.3],
      [68.7, 13.9], [66.9, 15.9], [65.2, 18.3], [63.8, 21.1], [62.8, 24.2], [62.5, 27.3],
      [63.3, 30.2], [64.2, 31.5], [64.2, 31.5]
    ];

    return [
      kasinVedetty(paalaki, h), kasinVedetty(kuono, h),
      kasinVedetty(korvaV, h * 0.8), kasinVedetty(korvaO, h * 0.8),
      kasinVedetty(silmaV, h * 0.6), kasinVedetty(silmaO, h * 0.6),
      kasinVedetty(pupilliV, h * 0.4), kasinVedetty(pupilliO, h * 0.4),
      kasinVedetty(nena, h * 0.5), kasinVedetty(suu, h * 0.6)
    ];
  }

  /* Rannikkoviivat asteina [pituus, leveys]. Lähde on Natural Earthin
     ne_110m_land (public domain), karkein saatavilla oleva aineisto,
     ja se on pelkistetty Douglas-Peuckerilla 2,5 asteen siedolla:
     5143 pisteestä jäi 238, eikä sitä pienempää enää tunnistaisi.
     Etelämanner ja pikkusaaret on jätetty pois. Pisteet ovat asteina
     eivätkä valmiina koordinaatteina, jotta pallon saa kääntää. */
  const RANNIKOT = [
    [[107.0,77.0],[131.3,70.8],[175.7,69.9],[180.0,69.0],[180.0,65.0],[163.5,59.9],[156.8,51.0],[155.9,56.8],[164.5,62.6],[135.1,54.7],[141.4,52.2],[127.5,39.8],[129.1,35.1],[121.6,40.9],[118.0,39.2],[122.4,37.5],[119.2,34.9],[121.7,28.2],[105.9,19.8],[109.3,13.4],[105.2,8.6],[100.1,13.4],[104.2,1.3],[91.4,22.8],[80.3,15.9],[77.5,8.0],[72.6,21.4],[66.4,25.4],[48.0,30.0],[51.8,24.0],[56.4,26.4],[59.8,22.3],[43.5,12.6],[32.4,29.9],[42.7,11.7],[51.0,10.6],[39.2,-4.7],[40.8,-14.7],[32.2,-28.8],[25.8,-33.9],[18.4,-34.1],[11.8,-18.1],[13.7,-10.7],[9.4,3.7],[-9.0,4.8],[-16.6,12.2],[-17.0,21.9],[-5.9,35.8],[9.5,37.4],[19.1,30.3],[33.8,31.0],[36.2,36.7],[26.2,39.5],[41.7,42.0],[36.7,45.2],[39.1,47.3],[30.7,46.6],[22.5,36.4],[13.1,45.7],[18.5,40.2],[16.1,38.0],[8.9,44.4],[-2.1,36.7],[-8.9,36.9],[-9.4,43.0],[-1.4,44.0],[-4.6,48.7],[8.1,53.5],[8.5,57.1],[19.7,54.4],[29.1,60.0],[21.3,60.7],[25.4,65.1],[22.2,65.7],[12.9,55.4],[5.0,62.0],[24.5,71.0],[41.1,67.5],[33.2,66.6],[37.0,63.8],[43.5,68.6],[68.5,68.1],[66.7,71.0],[72.6,72.8],[72.4,66.2],[74.7,72.8],[107.0,77.0]],
    [[-90.5,69.5],[-81.3,67.6],[-93.2,62.0],[-92.3,57.1],[-82.3,55.1],[-79.9,51.2],[-78.1,62.3],[-73.8,62.4],[-67.6,58.2],[-64.6,60.3],[-55.7,52.1],[-71.1,46.8],[-65.1,49.2],[-59.8,45.9],[-76.3,39.2],[-81.3,31.4],[-80.4,25.2],[-84.1,30.1],[-96.6,28.3],[-96.3,19.3],[-87.1,21.5],[-88.9,15.9],[-83.4,15.3],[-81.4,8.8],[-71.8,12.4],[-71.7,9.1],[-69.9,12.2],[-61.9,10.7],[-50.4,-0.1],[-34.7,-7.3],[-40.9,-21.9],[-47.6,-24.9],[-53.8,-34.4],[-58.4,-33.9],[-56.8,-36.9],[-65.1,-41.1],[-71.0,-53.8],[-75.6,-46.6],[-70.2,-19.8],[-81.2,-6.1],[-78.2,8.3],[-103.5,18.3],[-114.8,31.8],[-109.4,23.2],[-112.2,24.7],[-124.4,40.3],[-122.8,49.0],[-134.1,58.1],[-150.6,61.3],[-164.8,54.4],[-157.0,58.9],[-166.1,61.5],[-160.8,64.8],[-168.1,65.7],[-156.6,71.4],[-108.9,67.4],[-96.1,67.3],[-95.2,71.9],[-90.5,69.5]],
    [[143.6,-13.8],[153.1,-26.1],[150.0,-37.4],[140.6,-38.0],[137.8,-32.9],[131.3,-31.5],[115.0,-34.2],[114.1,-21.8],[132.4,-11.1],[140.2,-17.7],[142.5,-10.7],[143.6,-13.8]],
    [[-27.1,83.5],[-20.8,82.7],[-31.9,82.2],[-12.2,81.3],[-20.0,80.2],[-19.4,74.3],[-26.4,70.2],[-22.3,70.1],[-39.8,65.5],[-43.4,60.1],[-51.6,63.6],[-54.0,67.2],[-50.9,69.9],[-58.6,75.5],[-73.3,78.0],[-27.1,83.5]],
    [[-68.5,83.1],[-61.9,82.6],[-80.6,76.2],[-89.5,76.5],[-81.8,80.5],[-91.6,81.9],[-68.5,83.1]],
    [[-86.6,73.2],[-61.9,66.9],[-68.0,66.3],[-66.2,61.9],[-77.7,64.2],[-72.9,67.7],[-89.9,71.2],[-86.6,73.2]],
    [[134.1,-1.2],[144.6,-3.9],[150.7,-10.6],[137.6,-8.4],[130.5,-0.9],[134.1,-1.2]],
    [[117.9,1.8],[116.1,-4.0],[109.1,-0.5],[116.7,6.9],[117.9,1.8]],
    [[50.1,-13.6],[47.1,-24.9],[44.0,-25.0],[44.4,-16.2],[50.1,-13.6]],
    [[-3.0,58.6],[1.4,51.3],[-5.2,50.0],[-2.9,54.0],[-6.1,56.8],[-3.0,58.6]],
    [[18.3,79.7],[21.5,79.0],[15.9,76.8],[10.4,79.7],[18.3,79.7]],
    [[-175.0,66.6],[-169.9,66.0],[-180.0,65.0],[-180.0,69.0],[-175.0,66.6]],
    [[174.6,-36.2],[178.5,-37.7],[175.2,-41.7],[172.6,-34.5],[174.6,-36.2]],
    [[57.5,70.7],[51.5,72.0],[68.9,76.5],[58.5,74.3],[57.5,70.7]],
    [[125.2,1.4],[120.2,0.2],[123.2,-5.3],[121.0,-2.6],[119.4,-5.4],[120.0,0.6],[125.2,1.4]]
  ];

  function maapallo() {
    const h = 0.5 + Math.random() * 0.4;
    const SADE = 44;
    const AST = Math.PI / 180;

    /* Keskipituuspiiri arvotaan, mutta ei Tyynenmeren kohdalle:
       siellä etupuolisko on lähes pelkkää vettä eikä pallo näyttäisi
       maapallolta vaan tyhjältä ympyrältä. */
    const keski = -100 + Math.random() * 220;
    const kallistus = (8 + Math.random() * 20) * AST;
    const ck = Math.cos(kallistus), sk = Math.sin(kallistus);

    /* Pallon pinnan piste ruudulle. Kolmas arvo kertoo onko piste
       etupuolella: takapuoli jätetään piirtämättä, jolloin muoto
       lukee umpinaisena pallona. */
    const pinta = (lon, lat) => {
      const la = lat * AST, lo = (lon - keski) * AST;
      const x = Math.cos(la) * Math.sin(lo);
      const y = Math.sin(la);
      const z = Math.cos(la) * Math.cos(lo);
      return [50 + x * SADE, 50 - (y * ck - z * sk) * SADE, y * sk + z * ck];
    };

    /* Ääriviiva katkeaa pallon reunaan. Näkyvät pätkät erotellaan
       omiksi vedoikseen, muuten viiva hyppäisi reunan yli toiselle
       puolelle. Kokonaan näkyvä ranta suljetaan renkaaksi. */
    const näkyvät = (asteet) => {
      const ulos = [];
      let pala = [], piiloon = false;
      for (const [lon, lat] of asteet) {
        const [x, y, z] = pinta(lon, lat);
        if (z > 0.03) pala.push([x, y]);
        else { piiloon = true; if (pala.length) { ulos.push(pala); pala = []; } }
      }
      if (pala.length) ulos.push(pala);
      if (!piiloon && ulos.length === 1 && ulos[0].length > 2) ulos[0].push(ulos[0][0]);
      return ulos.filter((p) => p.length >= 3);
    };

    const kehä = [];
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.13)
      kehä.push([50 + Math.cos(a) * SADE, 50 + Math.sin(a) * SADE]);

    const vedot = [kasinVedetty(kehä, h)];

    /* Päiväntasaaja kaarena: ilman sitä ympyrä maapalloineen voisi
       yhtä hyvin olla litteä kartta. Yksi kaari riittää vihjeeksi. */
    const tasaaja = [];
    for (let lon = -180; lon <= 180; lon += 4) tasaaja.push([lon, 0]);
    for (const pala of näkyvät(tasaaja)) vedot.push(kasinVedetty(pala, h * 0.5));

    for (const ranta of RANNIKOT)
      for (const pala of näkyvät(ranta)) vedot.push(kasinVedetty(pala, h * 0.55));

    return vedot;
  }

  /* Kierrosta pois mutta tallessa: alus, silmukka, renkaat,
     heinapallo, vyyhti, optimus, dogeNaama, maapallo sekä töherrykset
     kultainenKierre, elämänkukka, viisikanta, apilasolmu, aurinko ja
     kuunsirppi. Funktiot jäävät paikalleen, joten minkä tahansa saa
     takaisin lisäämällä nimen tähän listaan.

     spacexMerkki on mukana vaikka SpaceX ja xAI ovat yhdistymässä
     xSI:ksi: uutta tunnusta ei ole vielä julkaistu, ja kun se tulee,
     vaihto tapahtuu yhden muototehtaan sisällä. */
  const MUODOT = [kierre, aalto,
                  teslanMerkki, xMerkki, grokMerkki, grokBot, spacexMerkki];
  /* Nämä ovat tunnistettavia muotoja: CSS antaa niille pidemmän
     pysähdyksen kokonaisena, jotta merkin ehtii nähdä. Töherrykset
     eivät kuulu tähän – niiden ei tarvitse seistä esillä. */
  const TUNNUKSET = new Set([alus, teslanMerkki, xMerkki, spacexMerkki,
                             grokMerkki, grokBot, optimus, dogeNaama,
                             maapallo]);
  /* Leveä ja matala muoto täyttää neliöstä vain kaistaleen, joten se
     näyttäisi muiden rinnalla puolta pienemmältä. Venyttäminen veisi
     tunnistettavuuden, joten sille annetaan isompi laatikko. */
  const SUURENNOS = new Map([[spacexMerkki, 1.5], [optimus, 1.3]]);

  /* Tunnukset osuvat harvemmin kuin kuviot ja töherrykset:
     tasajaolla tausta alkaisi tuntua mainokselta sen sijaan että se
     vain elää taustalla. Paino 1 on oletus, joten uutta kuviota
     lisättäessä tähän ei tarvitse koskea. */
  const PAINOT = new Map([
    [alus, 0.3], [teslanMerkki, 0.3], [xMerkki, 0.5], [spacexMerkki, 0.5],
    [grokMerkki, 0.5], [grokBot, 0.5], [optimus, 0.5], [dogeNaama, 0.5]
  ]);

  function arvoMuoto() {
    const paino = (f) => PAINOT.get(f) ?? 1;
    const summa = MUODOT.reduce((s, f) => s + paino(f), 0);
    let osuma = Math.random() * summa;
    for (const f of MUODOT) {
      osuma -= paino(f);
      if (osuma <= 0) return f;
    }
    return MUODOT[MUODOT.length - 1];     // liukulukujen pyöristysvara
  }

  /* Uusi muoto, koko ja paikka. Kutsutaan vain kun elementti on
     DOM:issa: getTotalLength tarvitsee piirretyn polun. */
  function asetaPiirros(ui) {
    const muoto = arvoMuoto();
    const tunnus = TUNNUKSET.has(muoto);

    /* Jokainen veto saa oman polkunsa. Yhteisessä polussa katkoviiva
       juoksisi kaikissa vedoissa samaa vauhtia, jolloin lyhyt veto on
       valmis kauan ennen pitkää ja katoaa purkautuessa ensimmäisenä –
       X:n tunnuksella mitattuna sisäviiva oli valmis 12 %:n kohdalla
       kun ääriviiva oli vasta 67 %:ssa. Omana polkuna jokainen veto
       etenee suhteessa omaan pituuteensa, jolloin kaikki alkavat ja
       päättyvät yhtä aikaa. Tämä koskee kaikkia muotoja: aiemmin vain
       tunnuksia, mutta monivetoiset töherrykset tarvitsevat samaa. */
    const osat = muoto().map(sileaPolku).filter(Boolean);

    /* Polut uusitaan joka kierroksella. Saman merkin vetojen on
       lähdettävä liikkeelle samalla hetkellä, ja tuore elementti
       aloittaa animaationsa aina alusta – myös hiipumisen, joka
       vanhaa polkua käytettäessä jäi eri tahtiin vedon kanssa
       silloin kun tunnus-luokan vaihto vaihtoi animaation nimen. */
    const koko = (170 + Math.random() * 230) * (SUURENNOS.get(muoto) || 1);
    ui.style.width = koko.toFixed(0) + 'px';
    ui.style.height = koko.toFixed(0) + 'px';

    ui.textContent = '';
    ui.classList.toggle('oma-tunnus', tunnus);
    /* Yksikköansa: vector-effect: non-scaling-stroke siirtää myös
       katkoviivan mitat ruutupikseleihin, mutta getTotalLength antaa
       viewBox-yksiköitä. Ilman skaalausta pala jää skaalan verran
       liian lyhyeksi, eikä polku piirry koskaan loppuun asti: 400 px:n
       kuviosta näkyi vain neljännes, ja se jäi siihen tilaan koko
       pysähdyksen ajaksi. Mitattuna 200 px:n ruudulla maalattuja
       pikseleitä oli 722 kun niitä piti olla 1442. */
    const skaala = koko / PIIRTO_RUUTU;
    for (const d of osat) {
      const polku = document.createElementNS(SVG_NS, 'path');
      // Viivan paksuus pysyy samana, vaikka viewBox venyy eri kokoihin
      polku.setAttribute('vector-effect', 'non-scaling-stroke');
      polku.setAttribute('d', d);
      ui.appendChild(polku);
      polku.style.setProperty('--pit', (polku.getTotalLength() * skaala).toFixed(1) + 'px');
    }
    /* Paikka pikseleinä ikkunan sisään, ettei kuvio jää reunaan
       puoliksi leikkautuneeksi. */
    ui.style.left = (Math.random() * Math.max(0, innerWidth - koko)).toFixed(0) + 'px';
    ui.style.top = (Math.random() * Math.max(0, innerHeight - koko)).toFixed(0) + 'px';
    ui.style.rotate = (Math.random() * 360).toFixed(0) + 'deg';
  }

  function teePiirros(jarjestys, maara) {
    const ui = document.createElementNS(SVG_NS, 'svg');
    ui.setAttribute('class', 'oma-piirto');
    ui.setAttribute('viewBox', `0 0 ${PIIRTO_RUUTU} ${PIIRTO_RUUTU}`);

    /* Kesto ja aloitusviive annetaan muuttujina, koska polut syntyvät
       uudestaan joka kierroksella: perittynä jokainen uusi veto saa
       ne itsestään eikä niitä tarvitse muistaa erikseen. */
    const kesto = 26 + Math.random() * 22;      // s: yksi piirto ja purku
    ui.style.setProperty('--kesto', kesto.toFixed(1) + 's');
    /* Positiivinen viive, ei negatiivinen: negatiivisella muoto
       käynnistyisi keskeltä kierrosta, jolloin sivun avatessa yksi
       niistä olisi jo purkautumassa ennen kuin se on edes piirtynyt.
       Porrastus levittää aloitukset silti eri hetkiin, ja CSS:n
       animation-fill-mode: backwards pitää viivan piilossa odotuksen
       ajan. */
    ui.style.setProperty('--viive', (kesto * 0.7 * (jarjestys / Math.max(maara, 1))).toFixed(1) + 's');

    /* Kierros loppuun -> uusi muoto. Tapahtuma kuplii poluista tänne,
       ja koska saman merkin vedot ovat samassa tahdissa, riittää
       kuunnella ensimmäistä. Hiipuminen ohitetaan, ettei muoto vaihdu
       kahdesti. Porrastusta tarvitaan vain sivun avatessa. */
    ui.addEventListener('animationiteration', (e) => {
      if (e.target !== ui.firstChild) return;
      if (e.animationName === 'oma-piirto-hiive') return;
      ui.style.setProperty('--viive', '0s');
      asetaPiirros(ui);
    });
    return ui;
  }

  function piirrostenMaara() {
    const arvo = parseInt(getComputedStyle(root).getPropertyValue('--piirrokset'), 10);
    return Number.isFinite(arvo) ? Math.min(Math.max(arvo, 0), 14) : 6;
  }

  function luoPiirrokset() {
    if (!document.body) return;
    const maara = piirrostenMaara();
    let kerros = document.getElementById('oma-piirrokset');

    if (!maara) { if (kerros) kerros.remove(); return; }

    if (kerros && kerros.children.length === maara) return;
    if (kerros) kerros.remove();

    kerros = document.createElement('div');
    kerros.id = 'oma-piirrokset';
    for (let i = 0; i < maara; i++) kerros.appendChild(teePiirros(i, maara));
    document.body.appendChild(kerros);
    for (const ui of kerros.children) asetaPiirros(ui);
  }

  /* =========================================================
     1d4. Taustaan piirtäminen ja muistilaput

     Taustan tyhjään tilaan voi vetää hiirellä viivan samalla
     korostusvärillä kuin kuviot, ja tuplaklikki jättää siihen
     muistilapun. Jälki asuu taustakerroksessa (z-index: -1)
     kuvioiden tapaan, joten se ei ole koskaan X:n painikkeiden
     tiellä – ja jos veto kulkee aikajanan ali, se katoaa sarakkeen
     taakse ja jatkuu toisella puolella.

     Piirto alkaa vain tyhjästä kohdasta: painallus sarakkeeseen,
     otsikkoon, dialogiin tai mihin tahansa nappiin jätetään X:lle.
     Veto syntyy vasta muutaman pikselin liikkeestä, jottei
     tavallinen klikkaus jätä pistettä – ja koska pointerdownia ei
     estetä, klikkaukset toimivat kuten ennenkin.

     Taustakerros ei ota hiiren osumia, joten muistilappua ei voi
     naputella suoraan siinä. Kirjoittaminen tapahtuu erillisessä
     muokkaimessa sivun päällä, ja valmis teksti leimataan taustaan.

     Jälki tallennetaan chrome.storage.localiin ja palautetaan
     latauksen jälkeen. Koordinaatit ovat ikkunan omia, koska
     kerros on fixed.
     ========================================================= */
  const PIIRTO_KYNNYS = 4;        // px: tätä lyhyempi liike on klikkaus
  const PISTE_VALI = 3;           // px: pisteiden tihein tallennusväli
  const LAPPU_OSUMA = 12;         // px: kuinka läheltä lappu aukeaa muokattavaksi

  /* Kohdat, joissa painallus kuuluu X:lle eikä piirtoon. */
  const EI_PIIRTOA =
    '[data-testid="primaryColumn"], [data-testid="sidebarColumn"], header[role="banner"],' +
    '[role="dialog"], [data-testid="mask"], [data-testid="xchatEmbedDrawer"],' +
    '#oma-chat-pallo, #oma-taulu-ohjaus, #oma-lappu-muokkain,' +
    'a, button, input, textarea, select, [role="button"], [contenteditable="true"]';

  /* Yksi lista sekä vedoille että lapuille, syntymäjärjestyksessä:
     { t: 'v', d } tai { t: 'l', x, y, teksti }. Kumoaminen ottaa
     viimeisen riippumatta siitä, kumpi se on. */
  let taulu = [];
  let tauluElementit = [];
  let tallennusAjastin = 0;

  function onTausta(kohde) {
    return kohde instanceof Element && !kohde.closest(EI_PIIRTOA);
  }

  function tallennaTaulu() {
    clearTimeout(tallennusAjastin);
    tallennusAjastin = setTimeout(() => {
      chrome.storage.local.set({ taulu });
    }, 500);
  }

  function tauluKerros() {
    let kerros = document.getElementById('oma-taulu');
    if (kerros) return kerros;
    if (!document.body) return null;

    kerros = document.createElement('div');
    kerros.id = 'oma-taulu';
    const muste = document.createElementNS(SVG_NS, 'svg');
    muste.setAttribute('class', 'oma-muste');
    kerros.appendChild(muste);
    document.body.appendChild(kerros);
    return kerros;
  }

  function piirraKohde(kohde) {
    const kerros = tauluKerros();
    if (!kerros) return null;

    if (kohde.t === 'v') {
      const polku = document.createElementNS(SVG_NS, 'path');
      polku.setAttribute('d', kohde.d);
      kerros.firstChild.appendChild(polku);
      return polku;
    }
    const lappu = document.createElement('div');
    lappu.className = 'oma-lappu';
    lappu.textContent = kohde.teksti;
    lappu.style.left = kohde.x + 'px';
    lappu.style.top = kohde.y + 'px';
    kerros.appendChild(lappu);
    return lappu;
  }

  function lisaaKohde(kohde) {
    taulu.push(kohde);
    tauluElementit.push(piirraKohde(kohde));
    naytaOhjaus();
    tallennaTaulu();
  }

  function kumoa() {
    const el = tauluElementit.pop();
    taulu.pop();
    if (el) el.remove();
    naytaOhjaus();
    tallennaTaulu();
  }

  function tyhjennaTaulu() {
    for (const el of tauluElementit) if (el) el.remove();
    taulu = [];
    tauluElementit = [];
    naytaOhjaus();
    tallennaTaulu();
  }

  /* --- Veto ------------------------------------------------ */
  let veto = null;   // { pisteet, polku }

  function vetoAlkaa(e) {
    if (e.button !== 0 || veto || !onTausta(e.target)) return;
    veto = { pisteet: [[e.clientX, e.clientY]], polku: null };
    addEventListener('pointermove', vetoJatkuu);
    addEventListener('pointerup', vetoPaattyy, { once: true });
    addEventListener('pointercancel', vetoPaattyy, { once: true });
  }

  function vetoJatkuu(e) {
    const pisteet = veto.pisteet;
    const [x0, y0] = pisteet[pisteet.length - 1];
    if (Math.hypot(e.clientX - x0, e.clientY - y0) < PISTE_VALI) return;

    if (!veto.polku) {
      const [ax, ay] = pisteet[0];
      if (Math.hypot(e.clientX - ax, e.clientY - ay) < PIIRTO_KYNNYS) return;
      const kerros = tauluKerros();
      if (!kerros) return;
      veto.polku = document.createElementNS(SVG_NS, 'path');
      kerros.firstChild.appendChild(veto.polku);
      /* Vasta tästä eteenpäin ollaan piirtämässä: estetään tekstin
         maalautuminen ja vedon päätteeksi syntyvä klikkaus. Veto alkoi
         tavallisena painalluksena, joten selain on voinut jo ehtiä
         aloittaa maalauksen – se nollataan. */
      document.body.style.userSelect = 'none';
      getSelection().removeAllRanges();
    }
    pisteet.push([e.clientX, e.clientY]);
    veto.polku.setAttribute('d', sileaPolku(pisteet));
  }

  function vetoPaattyy() {
    if (!veto) return;                      // pointerup ja -cancel: vain ensimmäinen
    removeEventListener('pointermove', vetoJatkuu);
    if (veto.polku) document.body.style.userSelect = '';

    /* Sileä polku tarvitsee kolme pistettä. Lyhyt nykäisy jää siis
       pois – se oli käytännössä klikkaus eikä veto. */
    const piirretty = veto.polku && veto.pisteet.length >= 3;
    if (veto.polku && !piirretty) veto.polku.remove();
    if (piirretty) {
      /* Klikkaus seuraa pointerupia: syödään se kerran, ettei veto
         osu vahingossa sivun alla olevaan toimintoon. */
      addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); },
        { capture: true, once: true });
      const d = veto.polku.getAttribute('d');
      veto.polku.remove();                    // sama polku uudelleen lisaaKohteen kautta
      lisaaKohde({ t: 'v', d });
    }
    veto = null;
  }

  /* --- Muistilappu ----------------------------------------- */
  let muokkain = null;

  function avaaLappu(x, y, indeksi) {
    suljeLappu();
    muokkain = document.createElement('div');
    muokkain.id = 'oma-lappu-muokkain';
    muokkain.contentEditable = 'true';
    muokkain.spellcheck = false;
    muokkain.style.left = x + 'px';
    muokkain.style.top = y + 'px';
    muokkain.dataset.indeksi = indeksi === undefined ? '' : String(indeksi);
    if (indeksi !== undefined) {
      muokkain.textContent = taulu[indeksi].teksti;
      tauluElementit[indeksi].style.visibility = 'hidden';   // ei kahta tekstiä päällekkäin
    }
    /* X kuuntelee yhden näppäimen pikavalintoja koko sivulta, joten
       kirjoitus pidetään omana. */
    muokkain.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') muokkain.blur();
    });
    muokkain.addEventListener('blur', suljeLappu);
    document.body.appendChild(muokkain);
    muokkain.focus();
  }

  function suljeLappu() {
    if (!muokkain) return;
    const el = muokkain;
    muokkain = null;                       // blur-silmukka poikki ennen muutoksia
    const teksti = el.textContent.trim();
    const indeksi = el.dataset.indeksi === '' ? undefined : Number(el.dataset.indeksi);
    const x = parseFloat(el.style.left);
    const y = parseFloat(el.style.top);
    el.remove();

    if (indeksi === undefined) {
      if (teksti) lisaaKohde({ t: 'l', x, y, teksti });
      return;
    }
    const vanha = tauluElementit[indeksi];
    if (!teksti) {                          // tyhjäksi siivottu lappu katoaa
      taulu.splice(indeksi, 1);
      tauluElementit.splice(indeksi, 1);
      if (vanha) vanha.remove();
    } else {
      taulu[indeksi].teksti = teksti;
      vanha.textContent = teksti;
      vanha.style.visibility = '';
    }
    naytaOhjaus();
    tallennaTaulu();
  }

  /* Osuiko tuplaklikki vanhaan lappuun? Taustakerros ei ota osumia,
     joten osuma lasketaan itse elementtien reunoista. */
  function lappuKohdasta(x, y) {
    for (let i = taulu.length - 1; i >= 0; i--) {
      if (taulu[i].t !== 'l' || !tauluElementit[i]) continue;
      const r = tauluElementit[i].getBoundingClientRect();
      if (x >= r.left - LAPPU_OSUMA && x <= r.right + LAPPU_OSUMA &&
          y >= r.top - LAPPU_OSUMA && y <= r.bottom + LAPPU_OSUMA) return i;
    }
    return -1;
  }

  /* --- Kumoa / tyhjennä ------------------------------------ */
  function naytaOhjaus() {
    let ohjaus = document.getElementById('oma-taulu-ohjaus');
    if (!taulu.length) { if (ohjaus) ohjaus.remove(); return; }
    if (ohjaus || !document.body) return;

    ohjaus = document.createElement('div');
    ohjaus.id = 'oma-taulu-ohjaus';

    const kumoaNappi = document.createElement('button');
    kumoaNappi.textContent = 'Undo';
    kumoaNappi.addEventListener('click', kumoa);

    /* Tyhjennys kysyy varmistuksen napissa itsessään: dialogi olisi
       tähän turhan järeä, mutta koko taulun menettäminen vahingossa
       harmittaisi. Napit ovat englanniksi demoa varten, vaikka koodi
       ja popup puhuvat suomea. */
    const tyhjennaNappi = document.createElement('button');
    tyhjennaNappi.textContent = 'Clear';
    let varmistus = 0;
    tyhjennaNappi.addEventListener('click', () => {
      if (Date.now() < varmistus) { tyhjennaTaulu(); return; }
      varmistus = Date.now() + 3000;
      tyhjennaNappi.textContent = 'Sure?';
      setTimeout(() => { tyhjennaNappi.textContent = 'Clear'; }, 3000);
    });

    ohjaus.append(kumoaNappi, tyhjennaNappi);
    document.body.appendChild(ohjaus);
  }

  function kaynnistaTaulu() {
    chrome.storage.local.get({ taulu: [] }, (tallennettu) => {
      if (chrome.runtime.lastError) return;
      taulu = Array.isArray(tallennettu.taulu) ? tallennettu.taulu : [];
      tauluElementit = taulu.map(piirraKohde);
      naytaOhjaus();
    });

    /* Kaappausvaihe: osa X:n käsittelijöistä pysäyttää tapahtuman
       kuplimisen, eikä veto alkaisi muuten lainkaan. */
    addEventListener('pointerdown', vetoAlkaa, { capture: true });
    addEventListener('dblclick', (e) => {  // uusi tai vanha muistilappu
      if (!onTausta(e.target)) return;
      const osuma = lappuKohdasta(e.clientX, e.clientY);
      if (osuma >= 0) {
        const r = tauluElementit[osuma].getBoundingClientRect();
        avaaLappu(Math.round(r.left), Math.round(r.top), osuma);
      } else {
        avaaLappu(e.clientX, e.clientY);
      }
    });
    addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'z' || e.key === 'Z') && taulu.length) {
        e.preventDefault();
        kumoa();
      }
    });
  }

  /* =========================================================
     1f. X:n oma sininen teeman korostusväriksi

     X värittää linkit, yleisövalitsimen, "Everyone can reply"
     -napin ja osan kuvakkeista omalla sinisellään
     rgb(29, 155, 240). Väri tulee generoiduista atomiluokista,
     joiden nimet vaihtuvat buildin mukana – niitä ei siis voi
     kirjoittaa content.cssään käsin.

     Luokat opetellaan sen sijaan itse. Elementti kerrallaan
     katsotaan laskettu väri ja kirjataan luokat kahteen
     joukkoon: sinisiin ja ei-sinisiin. Oikea väriluokka on se,
     joka esiintyy vain sinisissä – asettelusta vastaavat luokat
     putoavat pois, koska niitä on muuallakin. Lopuksi luokista
     kirjoitetaan yksi tyylisääntö ja työn tekee CSS, jolloin
     Reactin uudelleenpiirrot eivät kumoa mitään.
     ========================================================= */
  const X_SININEN = 'rgb(29, 155, 240)';
  const SINISET_KOHTEET =
    'header[role="banner"] svg, [data-testid="primaryColumn"] span,' +
    '[data-testid="primaryColumn"] svg, [data-testid="primaryColumn"] [role="button"]';
  const SINISET_KATTO = 500;    // elementtiä per kierros, ettei skannaus käy kalliiksi
  const KELPO_LUOKKA = /^[A-Za-z_-][\w-]*$/;

  const tutkitut = new Map();           // luokka -> '' | 'teksti' | 'tausta'
  const hyvaksytytTeksti = new Set();
  const hyvaksytytTausta = new Set();
  let sinisetNahty = 0;
  let sinisetKierros = 0;
  let sinisetCss = '';
  let koeElementti = null;

  /* Koe-elementti, jolle annetaan yksi luokka kerrallaan. X:n CSS on
     atomista – yksi luokka, yksi ominaisuus – joten luokan oma väri
     näkyy tässä sellaisenaan riippumatta siitä, mitä sivulla on. */
  function koe() {
    if (!koeElementti) {
      koeElementti = document.createElement('span');
      koeElementti.style.cssText =
        'position:absolute;top:-9999px;left:-9999px;pointer-events:none';
      (document.body || document.documentElement).appendChild(koeElementti);
    }
    return koeElementti;
  }

  /* Tutkitaan luokka täsmälleen kerran. Tulos jää muistiin, jottei
     omaa sääntöämme mitata myöhemmin uudelleen – se antaisi väärän
     vastauksen, koska luokka on silloin jo korostusvärissä. */
  function tutkiLuokka(luokka) {
    if (tutkitut.has(luokka)) return;
    const el = koe();
    el.className = luokka;
    const tyyli = getComputedStyle(el);
    let tulos = '';
    if (tyyli.color === X_SININEN) tulos = 'teksti';
    else if (tyyli.backgroundColor === X_SININEN) tulos = 'tausta';
    tutkitut.set(luokka, tulos);
    if (tulos === 'teksti') hyvaksytytTeksti.add(luokka);
    if (tulos === 'tausta') hyvaksytytTausta.add(luokka);
  }

  /* Tarkin keino: luetaan X:n omat tyylisäännöt. Jos sääntö asettaa
     täsmälleen X:n sinisen ja sen valitsin on yksi luokka, luokka on
     väriluokka – tässä ei arvata mitään. Osa tauluista on ladattu
     toisesta origenista, jolloin selain estää lukemisen; ne vain
     ohitetaan ja koe-elementti hoitaa loput. */
  const YKSI_LUOKKA = /^\.[A-Za-z_-][\w-]*$/;
  let tauluLuettu = 0;
  let tauluEstetty = 0;

  function kayLapiSaannot(saannot) {
    for (const s of saannot) {
      if (s.cssRules) { kayLapiSaannot(s.cssRules); continue; }   // @media ym.
      if (!s.selectorText || !s.style) continue;
      const teksti = s.style.color === X_SININEN;
      const tausta = s.style.backgroundColor === X_SININEN;
      if (!teksti && !tausta) continue;
      for (const osa of s.selectorText.split(',')) {
        const nimi = osa.trim();
        if (!YKSI_LUOKKA.test(nimi)) continue;
        (teksti ? hyvaksytytTeksti : hyvaksytytTausta).add(nimi.slice(1));
      }
    }
  }

  function lueTyylitaulut() {
    tauluLuettu = 0;
    tauluEstetty = 0;
    for (const taulu of document.styleSheets) {
      let saannot = null;
      try {
        saannot = taulu.cssRules;
      } catch (e) {
        tauluEstetty++;                 // toisen origenin taulu, ei luettavissa
        continue;
      }
      if (!saannot) continue;
      tauluLuettu++;
      kayLapiSaannot(saannot);
    }
  }

  function saanto(joukko, ominaisuus) {
    if (!joukko.size) return '';
    return [...joukko].map((l) => '.' + l).join(',\n') +
      ` { ${ominaisuus}: var(--accent) !important; }`;
  }

  function skannaaSiniset() {
    lueTyylitaulut();
    const kohteet = document.querySelectorAll(SINISET_KOHTEET);
    const maara = Math.min(kohteet.length, SINISET_KATTO);
    for (let i = 0; i < maara; i++) {
      for (const luokka of kohteet[i].classList) {
        if (KELPO_LUOKKA.test(luokka)) tutkiLuokka(luokka);
      }
    }
    sinisetNahty += maara;

    const css = [
      saanto(hyvaksytytTeksti, 'color'),
      saanto(hyvaksytytTausta, 'background-color')
    ].filter(Boolean).join('\n');
    if (css === sinisetCss) return;
    sinisetCss = css;

    let tyyli = document.getElementById('oma-siniset');
    if (!tyyli) {
      tyyli = document.createElement('style');
      tyyli.id = 'oma-siniset';
      document.documentElement.appendChild(tyyli);
    }
    tyyli.textContent = css;
  }

  /* =========================================================
     1e. Tilatiedot popupille

     Laajennus mittaa itse itsensä ja tallentaa tuloksen
     chrome.storage.localiin, josta popup näyttää sen. Näin
     vianetsintä ei vaadi konsolikomentoja.
     ========================================================= */
  let edellinenTila = '';

  function mitat(el) {
    if (!el) return 'ei löydy';
    const r = el.getBoundingClientRect();
    return `${Math.round(r.left)}–${Math.round(r.right)} (${Math.round(r.width)} px)`;
  }

  /* Mistä jäljellä oleva sininen tulee? Etsitään ensimmäinen
     elementti, jonka laskettu väri on yhä X:n sininen, ja kerrotaan
     sen tunnusmerkit – niistä näkee onko väri luokassa vai
     style-attribuutissa. */
  function sininenNayte() {
    const kohteet = document.querySelectorAll(SINISET_KOHTEET);
    for (let i = 0; i < Math.min(kohteet.length, 500); i++) {
      const el = kohteet[i];
      if (el.closest('[data-testid="icon-verified"]')) continue;
      if (getComputedStyle(el).color !== X_SININEN) continue;
      const inline = el.getAttribute('style') || 'ei inline-tyyliä';
      return `<${el.tagName.toLowerCase()}> [${inline}] ${el.className}`.slice(0, 220);
    }
    return 'ei sinisiä jäljellä';
  }

  function tallennaTila() {
    const juuri = chatVarjo();
    const isanta = document.querySelector('[data-testid="chat-drawer-root"]');
    const tila = {
      sivu: location.pathname,
      sarake: mitat(document.querySelector('[data-testid="primaryColumn"]')),
      kentta: mitat(document.querySelector('[data-testid="primaryColumn"] > div > div:has([data-testid="tweetTextarea_0"])')),
      kortti: mitat(document.querySelector('[data-testid="cellInnerDiv"] article')),
      cardWidth: root.style.getPropertyValue('--cardWidth') || 'ei asetettu',
      cardLeft: root.style.getPropertyValue('--cardLeft') || 'ei asetettu',
      chatIsanta: isanta ? (isanta.getAttribute('style') || 'ei inline-tyyliä') : 'ei löydy',
      chatNakyvyys: isanta ? getComputedStyle(isanta).visibility : '-',
      chatVarjo: juuri ? 'löytyy' : 'ei löydy',
      chatAuki: juuri ? (chatAuki(juuri) ? 'auki' : 'kiinni') : '-',
      chatTyyli: juuri && juuri.getElementById('oma-chat-tyyli') ? 'injektoitu' : 'ei',
      chatAvaus: (etsiAvaus(juuri), avausTapa),
      pallo: document.getElementById('oma-chat-pallo') ? 'on' : 'ei',
      otsikkoRivi: mitat(document.querySelector('[data-testid="primaryColumn"] h1, [data-testid="primaryColumn"] h2')?.closest('div')),
      tabit: mitat(document.querySelector('[role="tablist"]')),
      tabitEmo: mitat(document.querySelector('[role="tablist"]')?.parentElement),
      lista: mitat(document.querySelector('[data-testid="cellInnerDiv"]')?.parentElement),
      solu: mitat(document.querySelector('[data-testid="cellInnerDiv"]')),
      sinisetLuokat: [...hyvaksytytTeksti, ...hyvaksytytTausta].join(' ') || 'ei yhtään',
      sininenNayte: sininenNayte(),
      siniset: `${sinisetKierros} kierrosta, ${sinisetNahty} elementtiä, ` +
        `${tauluLuettu} taulua luettu / ${tauluEstetty} estetty, ` +
        `${tutkitut.size} luokkaa tutkittu, ` +
        `${hyvaksytytTeksti.size} väri- ja ${hyvaksytytTausta.size} taustaluokkaa`
    };
    const teksti = JSON.stringify(tila);
    if (teksti === edellinenTila) return;
    edellinenTila = teksti;
    try {
      chrome.storage.local.set({ tila });
    } catch (e) {
      /* laajennuksen konteksti voi kadota päivityksen yhteydessä */
    }
  }

  /* =========================================================
     2. Dock piiloon skrollatessa
     ========================================================= */
  const KYNNYS = 8;          // px: pienemmät liikkeet ei lasketa
  const YLAOSA = 80;         // px: sivun yläosassa dock näkyy aina
  const ALAREUNA = 70;       // px: hiiri näin lähellä alareunaa tuo dockin esiin

  let edellinen = window.scrollY;
  let piilossa = false;
  let hiiriAlhaalla = false;

  function aseta(piiloon) {
    if (hiiriAlhaalla) piiloon = false;
    if (piiloon === piilossa) return;
    piilossa = piiloon;
    if (piiloon) root.setAttribute('data-dock', 'hidden');
    else root.removeAttribute('data-dock');
  }

  let odottaa = false;
  window.addEventListener('scroll', () => {
    if (odottaa) return;
    odottaa = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const ero = y - edellinen;
      if (y < YLAOSA) aseta(false);
      else if (ero > KYNNYS) aseta(true);     // alas -> piiloon
      else if (ero < -KYNNYS) aseta(false);   // ylös -> esiin
      if (Math.abs(ero) > KYNNYS) edellinen = y;
      odottaa = false;
    });
  }, { passive: true });

  // Kuten Macissa: hiiri ruudun alareunaan tuo dockin esiin
  window.addEventListener('mousemove', (e) => {
    const alhaalla = window.innerHeight - e.clientY < ALAREUNA;
    if (alhaalla !== hiiriAlhaalla) {
      hiiriAlhaalla = alhaalla;
      if (alhaalla) aseta(false);
    }
  }, { passive: true });

  /* =========================================================
     3. Käynnistys

     Tämän on oltava tiedoston lopussa: seuraaKorttia() kutsuu
     funktioita, jotka lukevat alempana määriteltyjä let/const
     -muuttujia. Jos käynnistys ajetaan ennen niitä, muuttujat
     ovat temporal dead zonessa ja koko skripti kaatuu
     ReferenceErroriin – jolloin mikään tämän jälkeinen ei aja.
     ========================================================= */
  let jaljella = 360;   // latauksen aikana tiuhaan, sitten sekunnin välein
  (function alkuTahti() {
    seuraaKorttia();
    if (jaljella-- > 0) requestAnimationFrame(alkuTahti);
  })();
  setInterval(seuraaKorttia, 1000);
  window.addEventListener('resize', sovitaKentta, { passive: true });

  /* Taulu kerran: se asentaa omat kuuntelijansa ja tarvitsee bodyn,
     jota document_startissa ei vielä ole. */
  if (document.body) kaynnistaTaulu();
  else addEventListener('DOMContentLoaded', kaynnistaTaulu, { once: true });

  /* Sinisten luokkien opettelu. Muutama tiuha kierros heti, jotta
     väri vaihtuu jo latauksen aikana, sitten harvakseltaan: X:n
     atomiluokat ovat globaaleja, joten uusia löytyy enää harvoin. */
  const sinisetAjastin = setInterval(() => {
    sinisetKierros++;
    skannaaSiniset();
    if (sinisetKierros >= 20) clearInterval(sinisetAjastin);
  }, 1500);
})();
