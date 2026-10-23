/* Popup: säätimet chrome.storage.syncistä ja sinne takaisin.
   Säätimet rakennetaan settings.js:n määrittelyistä. */

(function () {
  'use strict';

  const saili = document.getElementById('asetukset');
  const maaritykset = globalThis.OMA_ASETUKSET;

  function tallenna(key, arvo) {
    chrome.storage.sync.set({ [key]: arvo });
  }

  function rakennaVari(m, arvo) {
    const rivi = document.createElement('div');
    rivi.className = 'rivi';

    const label = document.createElement('label');
    label.textContent = m.label;
    label.htmlFor = 'f-' + m.key;

    const input = document.createElement('input');
    input.type = 'color';
    input.id = 'f-' + m.key;
    input.value = arvo;
    input.addEventListener('input', () => tallenna(m.key, input.value));

    rivi.append(label, input);
    return rivi;
  }

  function rakennaLiuku(m, arvo) {
    const rivi = document.createElement('div');
    rivi.className = 'rivi leveä';

    const ylarivi = document.createElement('div');
    ylarivi.className = 'sade';

    const label = document.createElement('label');
    label.textContent = m.label;
    label.htmlFor = 'f-' + m.key;

    const naytto = document.createElement('span');
    naytto.className = 'arvo';
    naytto.textContent = arvo + (m.yksikko || '');

    ylarivi.append(label, naytto);

    const input = document.createElement('input');
    input.type = 'range';
    input.id = 'f-' + m.key;
    input.min = m.min;
    input.max = m.max;
    input.step = m.step;
    input.value = arvo;
    input.addEventListener('input', () => {
      const n = Number(input.value);
      naytto.textContent = n + (m.yksikko || '');
      tallenna(m.key, n);
    });

    rivi.append(ylarivi, input);
    return rivi;
  }

  function rakennaValinta(m, arvo) {
    const rivi = document.createElement('div');
    rivi.className = 'rivi leveä';

    const label = document.createElement('label');
    label.textContent = m.label;
    label.htmlFor = 'f-' + m.key;

    const select = document.createElement('select');
    select.id = 'f-' + m.key;
    for (const v of m.vaihtoehdot) {
      const option = document.createElement('option');
      option.value = v.value;
      option.textContent = v.label;
      select.append(option);
    }
    select.value = arvo;
    select.addEventListener('change', () => tallenna(m.key, select.value));

    rivi.append(label, select);
    return rivi;
  }

  function piirra(arvot) {
    saili.textContent = '';
    for (const m of maaritykset) {
      const arvo = arvot[m.key] !== undefined ? arvot[m.key] : m.oletus;
      if (m.type === 'color') saili.append(rakennaVari(m, arvo));
      else if (m.type === 'range') saili.append(rakennaLiuku(m, arvo));
      else saili.append(rakennaValinta(m, arvo));
    }
  }

  chrome.storage.sync.get(globalThis.omaOletukset(), (arvot) => piirra(arvot));

  /* Tilatiedot: content.js kirjoittaa ne storageen, popup näyttää.
     Näin vianetsintä onnistuu ilman konsolikomentoja. */
  const tilaKentta = document.getElementById('tila');

  const OTSIKOT = {
    sivu: 'sivu', sarake: 'sarake', kentta: 'postauskenttä', kortti: 'kortti',
    cardWidth: '--cardWidth', cardLeft: '--cardLeft',
    chatIsanta: 'chat inline-tyyli', chatNakyvyys: 'chat näkyvyys',
    chatVarjo: 'chat shadow-juuri', chatAuki: 'chat tila',
    chatTyyli: 'chat-tyyli', chatAvaus: 'chat avaustapa', pallo: 'oma pallo',
    siniset: 'sinisen korvaus',
    sinisetLuokat: 'löydetyt luokat', sininenNayte: 'sininen näyte',
    otsikkoRivi: 'otsikkorivi', tabit: 'tabit', tabitEmo: 'tabien kääre',
    lista: 'lista', solu: 'solu'
  };

  function naytaTila(tila) {
    if (!tila) return;
    const leveys = Math.max(...Object.values(OTSIKOT).map((o) => o.length));
    tilaKentta.textContent = Object.keys(OTSIKOT)
      .filter((avain) => avain in tila)
      .map((avain) => OTSIKOT[avain].padEnd(leveys) + '  ' + tila[avain])
      .join('\n');
  }

  chrome.storage.local.get('tila', (t) => naytaTila(t.tila));
  chrome.storage.onChanged.addListener((muutokset, alue) => {
    if (alue === 'local' && muutokset.tila) naytaTila(muutokset.tila.newValue);
  });

  document.getElementById('kopioi').addEventListener('click', () => {
    navigator.clipboard.writeText(tilaKentta.textContent);
  });

  document.getElementById('palauta').addEventListener('click', () => {
    const oletukset = globalThis.omaOletukset();
    chrome.storage.local.remove('palloSijainti');   // pallo takaisin automaattiin
    chrome.storage.sync.set(oletukset, () => piirra(oletukset));
  });
})();
