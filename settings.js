/* Asetusten määrittely – yhteinen content.js:lle ja popupille.
   Vastaa alkuperäisen Stylus-tyylin ==UserStyle==-otsakkeen @var-muuttujia. */

globalThis.OMA_ASETUKSET = [
  { key: 'accent',      label: 'Korostusväri',                type: 'color', oletus: '#7c9cff' },
  { key: 'bg',          label: 'Sivun tausta',                type: 'color', oletus: '#0f0f11' },
  { key: 'card',        label: 'Postauksen tausta',           type: 'color', oletus: '#1a1a1d' },
  { key: 'quote',       label: 'Lainatun postauksen tausta',  type: 'color', oletus: '#252529' },
  { key: 'viiva',       label: 'Erotinviiva (tiivis tila)',   type: 'color', oletus: '#2e2e36' },

  { key: 'colWidth',    label: 'Aikajanan leveys',            type: 'range', oletus: 600, min: 500, max: 1000, step: 10, yksikko: 'px' },
  { key: 'radius',      label: 'Kulmien pyöristys',           type: 'range', oletus: 18,  min: 0,   max: 32,   step: 1,  yksikko: 'px' },
  { key: 'gap',         label: 'Väli postausten välissä',     type: 'range', oletus: 8,   min: 0,   max: 24,   step: 1,  yksikko: 'px' },
  { key: 'dockIcon',    label: 'Dockin ikonien koko',         type: 'range', oletus: 28,  min: 20,  max: 40,   step: 1,  yksikko: 'px' },
  { key: 'actionIcon',  label: 'Tykkäys- yms. ikonien koko',  type: 'range', oletus: 22,  min: 16,  max: 30,   step: 1,  yksikko: 'px' },
  { key: 'countWeight', label: 'Lukujen paksuus',             type: 'range', oletus: 600, min: 400, max: 800,  step: 50, yksikko: '' },
  { key: 'countSize',   label: 'Lukujen koko',                type: 'range', oletus: 13,  min: 11,  max: 16,   step: 0.5, yksikko: 'px' },
  { key: 'actionSpace', label: 'Toimintopalkin väljyys',      type: 'range', oletus: 14,  min: 0,   max: 24,   step: 1,  yksikko: 'px' },
  { key: 'kalat',       label: 'Kanji-kalat taustalla',       type: 'range', oletus: 4,   min: 0,   max: 10,   step: 1,  yksikko: '' },

  {
    key: 'font',
    label: 'Fontti',
    type: 'select',
    oletus: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
    vaihtoehdot: [
      {
        label: 'Järjestelmä (SF Pro / Segoe / Inter)',
        value: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
      },
      {
        label: "X:n oma Chirp",
        value: 'TwitterChirp, -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
      }
    ]
  }
];

/* Asetusarvo -> CSS-muuttujan arvo (lisää yksikön numeroarvoille). */
globalThis.omaCssArvo = function (maarittely, arvo) {
  if (maarittely.type === 'range') return String(arvo) + (maarittely.yksikko || '');
  return String(arvo);
};

/* Oletusarvot oliona. */
globalThis.omaOletukset = function () {
  const o = {};
  for (const m of globalThis.OMA_ASETUKSET) o[m.key] = m.oletus;
  return o;
};
