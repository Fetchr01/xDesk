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
    return Number.isFinite(arvo) ? Math.min(Math.max(arvo, 0), 10) : 4;
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

  /* Sinisten luokkien opettelu. Muutama tiuha kierros heti, jotta
     väri vaihtuu jo latauksen aikana, sitten harvakseltaan: X:n
     atomiluokat ovat globaaleja, joten uusia löytyy enää harvoin. */
  const sinisetAjastin = setInterval(() => {
    sinisetKierros++;
    skannaaSiniset();
    if (sinisetKierros >= 20) clearInterval(sinisetAjastin);
  }, 1500);
})();
