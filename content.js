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

  const MUODOT = [kierre, heinapallo, silmukka, renkaat, aalto, vyyhti, alus, teslanMerkki];
  /* Nämä ovat tunnistettavia muotoja: CSS antaa niille pidemmän
     pysähdyksen kokonaisena. */
  const TUNNUKSET = new Set([alus, teslanMerkki]);

  /* Uusi muoto, koko ja paikka. Kutsutaan vain kun elementti on
     DOM:issa: getTotalLength tarvitsee piirretyn polun. */
  function asetaPiirros(ui) {
    const polku = ui.firstChild;
    const muoto = MUODOT[Math.floor(Math.random() * MUODOT.length)];
    polku.setAttribute('d', muoto().map(sileaPolku).join(' '));
    ui.classList.toggle('oma-tunnus', TUNNUKSET.has(muoto));
    ui.style.setProperty('--pit', polku.getTotalLength().toFixed(1) + 'px');

    const koko = 170 + Math.random() * 230;
    ui.style.width = koko.toFixed(0) + 'px';
    ui.style.height = koko.toFixed(0) + 'px';
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

    const polku = document.createElementNS(SVG_NS, 'path');
    // Viivan paksuus pysyy samana, vaikka viewBox venyy eri kokoihin
    polku.setAttribute('vector-effect', 'non-scaling-stroke');
    ui.appendChild(polku);

    const kesto = 26 + Math.random() * 22;      // s: yksi piirto ja purku
    polku.style.animationDuration = kesto.toFixed(1) + 's';
    /* Positiivinen viive, ei negatiivinen: negatiivisella muoto
       käynnistyisi keskeltä kierrosta, jolloin sivun avatessa yksi
       niistä olisi jo purkautumassa ennen kuin se on edes piirtynyt.
       Porrastus levittää aloitukset silti eri hetkiin, ja CSS:n
       animation-fill-mode: backwards pitää viivan piilossa odotuksen
       ajan. */
    polku.style.animationDelay = (kesto * 0.7 * (jarjestys / Math.max(maara, 1))).toFixed(1) + 's';
    ui.style.animationDuration = (18 + Math.random() * 14).toFixed(1) + 's';

    /* Kierros loppuun -> uusi muoto. Polulla on kaksi animaatiota,
       joten nimi tarkistetaan, ettei muoto vaihdu kahdesti. */
    polku.addEventListener('animationiteration', (e) => {
      if (e.animationName === 'oma-piirto-veto') asetaPiirros(ui);
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
