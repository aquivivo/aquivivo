import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'img', 'landmarks');

const LANDMARKS = [
  { id: 'poznan_stary_rynek', title: 'Poznań — Stary Rynek', type: 'townhall' },
  { id: 'poznan_ostrow_tumski', title: 'Poznań — Ostrów Tumski', type: 'cathedral' },
  { id: 'poznan_zamek_cesarski', title: 'Poznań — Zamek Cesarski', type: 'castle' },
  { id: 'poznan_malta', title: 'Poznań — Jezioro Malta', type: 'pier' },
  { id: 'wielkopolski_park_narodowy', title: 'Wielkopolski Park Narodowy', type: 'forest' },
  { id: 'kornik_zamek', title: 'Kórnik — Zamek', type: 'castle_fairy' },
  { id: 'rogalin_palac', title: 'Rogalin — Pałac', type: 'palacepark' },
  { id: 'lednica_ostrow', title: 'Lednica — Ostrów Lednicki', type: 'ruins' },
  { id: 'gniezno_katedra', title: 'Gniezno — Katedra', type: 'cathedral' },
  { id: 'goluchow_zamek', title: 'Gołuchów — Zamek', type: 'castle' },
  { id: 'wawel', title: 'Wawel', type: 'castle' },
  { id: 'rynek_glowny', title: 'Rynek Główny', type: 'oldtown' },
  { id: 'sukiennice', title: 'Sukiennice', type: 'oldtown' },
  { id: 'bazylika_mariacka_krakow', title: 'Bazylika Mariacka', type: 'cathedral' },
  { id: 'ojcowski_park_narodowy', title: 'Ojcowski Park Narodowy', type: 'mountains' },
  { id: 'wieliczka', title: 'Wieliczka', type: 'mine' },
  { id: 'malbork', title: 'Zamek w Malborku', type: 'castle' },
  { id: 'stare_miasto_warszawa', title: 'Stare Miasto (Warszawa)', type: 'oldtown' },
  { id: 'lazienki', title: 'Łazienki Królewskie', type: 'palacepark' },
  { id: 'wilanow', title: 'Pałac w Wilanowie', type: 'palacepark' },
  { id: 'palac_kultury', title: 'Pałac Kultury i Nauki', type: 'skyscraper' },
  { id: 'muzeum_powstania_warszawskiego', title: 'Warszawa — Muzeum Powstania', type: 'science_modern' },
  { id: 'muzeum_polin', title: 'Warszawa — Muzeum POLIN', type: 'science_modern' },
  { id: 'zelazowa_wola', title: 'Żelazowa Wola', type: 'palacepark' },
  { id: 'dlugi_targ', title: 'Długi Targ', type: 'oldtown' },
  { id: 'zuraw_gdanski', title: 'Żuraw Gdański', type: 'crane' },
  { id: 'molo_sopot', title: 'Molo w Sopocie', type: 'pier' },
  { id: 'hala_stulecia', title: 'Hala Stulecia', type: 'dome' },
  { id: 'ostrow_tumski', title: 'Ostrów Tumski', type: 'cathedral' },
  { id: 'rynek_wroclaw', title: 'Rynek (Wrocław)', type: 'oldtown' },
  { id: 'wroclaw_panorama_raclawicka', title: 'Wrocław — Panorama Racławicka', type: 'dome' },
  { id: 'wroclaw_most_grunwaldzki', title: 'Wrocław — Most Grunwaldzki', type: 'bridgepark' },
  { id: 'czocha_zamek', title: 'Zamek Czocha', type: 'castle_lake' },
  { id: 'klodzko_twierdza', title: 'Kłodzko — Twierdza', type: 'wall' },
  { id: 'torun', title: 'Toruń', type: 'oldtown' },
  { id: 'kopernik_torun', title: 'Kopernik (Toruń)', type: 'science' },
  { id: 'zamosc', title: 'Zamość', type: 'oldtown' },
  { id: 'jasna_gora', title: 'Jasna Góra', type: 'monastery' },
  { id: 'ksiaz', title: 'Zamek Książ', type: 'castle' },
  { id: 'lancut', title: 'Łańcut', type: 'castle' },
  { id: 'moszna', title: 'Moszna', type: 'castle_fairy' },
  { id: 'ogrodzieniec', title: 'Ogrodzieniec', type: 'ruins' },
  { id: 'niedzica', title: 'Niedzica', type: 'castle_lake' },
  { id: 'bialowieza', title: 'Białowieża', type: 'forest' },
  { id: 'morskie_oko', title: 'Morskie Oko', type: 'mountains_lake' },
  { id: 'giewont', title: 'Giewont', type: 'mountains' },
  { id: 'park_muzakowski', title: 'Park Mużakowski', type: 'bridgepark' },
  { id: 'tarnowskie_gory', title: 'Tarnowskie Góry', type: 'mine' },
  { id: 'kosciol_pokoju_swidnica', title: 'Kościół Pokoju (Świdnica)', type: 'church_wood' },
  { id: 'kosciol_pokoju_jawor', title: 'Kościół Pokoju (Jawor)', type: 'church_wood' },
  { id: 'kalwaria_zebrzydowska', title: 'Kalwaria Zebrzydowska', type: 'monastery' },
  { id: 'krzemionki', title: 'Krzemionki', type: 'mine' },
  { id: 'biskupin', title: 'Biskupin', type: 'settlement' },
  { id: 'zamek_krolewski_warszawa', title: 'Zamek Królewski (Warszawa)', type: 'castle' },
  { id: 'barbakan_warszawa', title: 'Barbakan (Warszawa)', type: 'wall' },
  { id: 'kopernik_warszawa', title: 'Centrum Nauki Kopernik', type: 'science_modern' },
];

const PALETTES = [
  { a: '#081b44', b: '#1e4aa5', c: '#ff9b2f', glow: '#ffd08a' },
  { a: '#07122c', b: '#0b5d6a', c: '#fcd116', glow: '#ffe58a' },
  { a: '#07122c', b: '#243c8f', c: '#ff7a2f', glow: '#ffd1a0' },
  { a: '#07122c', b: '#1d6fb8', c: '#ffb23f', glow: '#ffe0a6' },
  { a: '#07122c', b: '#205a73', c: '#ff8c3a', glow: '#ffd19b' },
  { a: '#07122c', b: '#2e4aa8', c: '#fcd116', glow: '#fff2b0' },
];

function hashString(input) {
  const s = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

function paletteFor(id) {
  const idx = hashString(id) % PALETTES.length;
  return PALETTES[idx];
}

function lcg(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function silhouette(type, ink, outline) {
  const common = `fill="${ink}" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" stroke-linejoin="round"`;

  if (type === 'castle' || type === 'castle_lake' || type === 'castle_fairy') {
    return `
      <path ${common} d="M134 342v-52l22-14v-18l20-14v-18l22 14v18l20 14v18l22-14v52h34v-72l26-18v-20l24-16v-20l26 16v20l24 16v20l26 18v72h26v86H134v-86z"/>
      <path fill="#0b1a3a" opacity="0.9" d="M172 428h44v-48c0-12-10-22-22-22s-22 10-22 22z"/>
      <path fill="#0b1a3a" opacity="0.9" d="M300 428h44v-62c0-12-10-22-22-22s-22 10-22 22z"/>
      ${
        type === 'castle_fairy'
          ? `<path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="4" d="M410 154c12 10 18 22 18 36 0 18-10 34-30 48" />`
          : ''
      }
      ${
        type === 'castle_lake'
          ? `<path fill="#0b5d6a" opacity="0.42" d="M92 446c56-26 112-38 168-36 50 2 98 16 152 34 36 12 74 20 108 22v34H92z"/>`
          : ''
      }
    `;
  }

  if (type === 'townhall') {
    return `
      <path ${common} d="M132 428v-104h92v-42l32-22v-32l44-28v-26l44 26v28l44 28v32l32 22v42h92v104H132z"/>
      <path fill="#0b1a3a" opacity="0.9" d="M238 428v-54c0-16 14-30 32-30s32 14 32 30v54z"/>
      <circle cx="256" cy="232" r="16" fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4"/>
      <path d="M256 232l10-8" fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" stroke-linecap="round"/>
    `;
  }

  if (type === 'cathedral') {
    return `
      <path ${common} d="M122 428v-134l38-24v-48l44-30v-32l44 32v30l16 12 16-12v-30l44-32v32l44 30v48l38 24v134H122z"/>
      <path fill="#0b1a3a" opacity="0.9" d="M236 428v-60c0-16 14-30 32-30s32 14 32 30v60z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M256 140v-20"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M246 130h20"/>
    `;
  }

  if (type === 'oldtown') {
    return `
      <path ${common} d="M110 428v-96l34-24 34 24v-52l34-24 34 24v-62l44-32 44 32v62l34-24 34 24v52l34-24 34 24v96H110z"/>
      <path fill="#0b1a3a" opacity="0.9" d="M150 428v-44h38v44z"/>
      <path fill="#0b1a3a" opacity="0.9" d="M324 428v-56h44v56z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M110 366h292"/>
    `;
  }

  if (type === 'mine') {
    return `
      <path ${common} d="M116 428v-120c0-64 52-116 116-116h48c64 0 116 52 116 116v120H116z"/>
      <path fill="#0b1a3a" opacity="0.85" d="M152 428v-98c0-46 38-84 84-84h40c46 0 84 38 84 84v98H152z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M186 240l86 86"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M326 240l-86 86"/>
      <path fill="#0b5d6a" opacity="0.26" d="M116 428h280v24H116z"/>
    `;
  }

  if (type === 'palacepark') {
    return `
      <path ${common} d="M120 428v-90h40v-26l24-18v-26l72-44 72 44v26l24 18v26h40v90H120z"/>
      <path fill="#0b1a3a" opacity="0.9" d="M232 428v-60c0-18 14-32 32-32s32 14 32 32v60z"/>
      <path fill="#0b5d6a" opacity="0.38" d="M92 452c58-24 118-34 180-30 50 3 98 14 148 30v60H92z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M92 456c58-24 118-34 180-30 50 3 98 14 148 30"/>
      <path fill="${ink}" opacity="0.75" d="M156 360c-20 10-34 26-42 48h54c-4-18-6-34-12-48z"/>
      <path fill="${ink}" opacity="0.75" d="M356 360c20 10 34 26 42 48h-54c4-18 6-34 12-48z"/>
    `;
  }

  if (type === 'skyscraper') {
    return `
      <path ${common} d="M160 428v-168l28-18v-28l24-18v-28l44-28v-26l44 26v28l24 18v28l28 18v168H160z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M256 118v-28"/>
      <path fill="${ink}" opacity="0.82" d="M198 416h32v-22h-32zm0-34h32v-22h-32zm84 34h32v-22h-32zm0-34h32v-22h-32z"/>
      <path fill="${ink}" opacity="0.82" d="M198 348h32v-22h-32zm84 0h32v-22h-32z"/>
    `;
  }

  if (type === 'crane') {
    return `
      <path ${common} d="M124 428v-56h44v56H124zm64 0V232h36v196h-36z"/>
      <path ${common} d="M224 248l130-88 34 50-130 88z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M246 234h224"/>
      <path fill="#0b5d6a" opacity="0.42" d="M92 452c74-28 150-40 228-36 54 3 104 14 148 30v66H92z"/>
      <path fill="${ink}" opacity="0.92" d="M320 428v-40h112v40H320z"/>
    `;
  }

  if (type === 'pier') {
    return `
      <path fill="#0b5d6a" opacity="0.55" d="M56 444c70-36 142-52 216-48 68 3 130 22 184 48v68H56z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M56 448c70-36 142-52 216-48 68 3 130 22 184 48"/>
      <path ${common} d="M214 456l-24-146 132-112 30 36-116 98 20 124z"/>
      <path fill="${ink}" opacity="0.88" d="M220 456h48v-30h-48z"/>
    `;
  }

  if (type === 'dome') {
    return `
      <path ${common} d="M112 428v-86c0-88 72-160 160-160s160 72 160 160v86H112z"/>
      <path fill="${ink}" opacity="0.9" d="M142 428v-78c0-70 58-128 128-128s128 58 128 128v78H142z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.45" stroke-width="3" d="M142 350h256"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.45" stroke-width="3" d="M270 222v206"/>
    `;
  }

  if (type === 'science' || type === 'science_modern') {
    const base =
      type === 'science_modern'
        ? `<path ${common} d="M118 428v-92l92-62 76 44 108-76 44 64-92 62v60H118z"/>`
        : `<path ${common} d="M128 428v-84l92-66 72 44 92-66 40 58-92 66v48H128z"/>`;
    return `
      ${base}
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M256 172c44 0 80 34 80 76"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M256 172c-44 0-80 34-80 76"/>
      <circle cx="256" cy="172" r="10" fill="${outline}" opacity="0.85"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M170 232l-28-18"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M342 232l28-18"/>
    `;
  }

  if (type === 'ruins') {
    return `
      <path ${common} d="M118 428v-92l48-34v-64l62-44v36l30 20v-40l62 44v64l48 34v92H118z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M180 234l22-16"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M332 234l-22-16"/>
      <path fill="#0b1a3a" opacity="0.9" d="M232 428v-52c0-14 12-26 32-26s32 12 32 26v52z"/>
      <path fill="${ink}" opacity="0.75" d="M92 452c50-30 104-44 162-42 54 2 108 18 166 42v60H92z"/>
    `;
  }

  if (type === 'forest') {
    return `
      <path fill="#0b5d6a" opacity="0.32" d="M84 452c60-26 124-40 192-38 58 2 112 14 152 28v70H84z"/>
      <path ${common} d="M132 428l42-96 42 96h-84zm96 0l38-86 38 86h-76zm92 0l44-104 44 104h-88z"/>
      <path fill="${ink}" opacity="0.92" d="M210 436c18-16 44-18 62-4 12 10 20 10 34 4 22-10 44 4 52 24H210z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M240 430c14-12 30-14 44-6"/>
    `;
  }

  if (type === 'mountains' || type === 'mountains_lake') {
    const lake =
      type === 'mountains_lake'
        ? `<path fill="#0b5d6a" opacity="0.52" d="M92 452c60-30 124-44 192-42 56 2 108 16 152 34v60H92z"/>`
        : `<path fill="#0b5d6a" opacity="0.42" d="M92 458c56-22 114-34 176-34 62 0 120 12 176 34v54H92z"/>`;
    return `
      <path ${common} d="M116 428l92-148 72 110 54-78 86 116H116z"/>
      <path fill="${ink}" opacity="0.84" d="M150 428l58-92 48 72 26-38 58 58z"/>
      ${lake}
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M92 458c56-22 114-34 176-34 62 0 120 12 176 34"/>
    `;
  }

  if (type === 'bridgepark') {
    return `
      <path fill="#0b5d6a" opacity="0.44" d="M72 456c64-28 130-42 200-40 62 2 118 16 168 34v62H72z"/>
      <path ${common} d="M116 428c26-56 68-84 128-84s102 28 128 84h-28c-22-40-56-60-100-60s-78 20-100 60h-28z"/>
      <path ${common} d="M140 428v-40h28v40h-28zm204 0v-40h28v40h-28z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M116 428h256"/>
    `;
  }

  if (type === 'monastery') {
    return `
      <path ${common} d="M116 428v-108l50-34v-52l64-44v28l26 18v-22l44-30 44 30v22l26-18v-28l64 44v52l50 34v108H116z"/>
      <path fill="#0b1a3a" opacity="0.9" d="M236 428v-56c0-16 14-30 32-30s32 14 32 30v56z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M256 150v-22"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.55" stroke-width="4" d="M244 140h24"/>
    `;
  }

  if (type === 'church_wood') {
    return `
      <path ${common} d="M128 428v-120l44-28v-54l54-38v30l20 14v-18l40-28 40 28v18l20-14v-30l54 38v54l44 28v120H128z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M156 300l200 0"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M156 332l200 0"/>
      <path fill="#0b1a3a" opacity="0.9" d="M236 428v-58c0-16 14-30 32-30s32 14 32 30v58z"/>
    `;
  }

  if (type === 'settlement') {
    return `
      <path fill="#0b5d6a" opacity="0.38" d="M92 452c62-26 128-38 198-36 56 2 108 14 152 30v66H92z"/>
      <path ${common} d="M120 428v-74l54-40 54 40v74H120z"/>
      <path ${common} d="M284 428v-88l60-44 60 44v88H284z"/>
      <path ${common} d="M116 428v-128h12v128h-12zm28 0v-128h12v128h-12zm28 0v-128h12v128h-12zm28 0v-128h12v128h-12z"/>
      <path fill="${ink}" opacity="0.92" d="M152 428v-38h44v38z"/>
    `;
  }

  if (type === 'wall') {
    return `
      <path ${common} d="M112 428v-116h44v-34l28-18v-22l32-22v22l28 18v56h40v-56l28-18v-22l32-22v22l28 18v34h44v116H112z"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M132 368h248"/>
      <path fill="none" stroke="${outline}" stroke-opacity="0.35" stroke-width="3" d="M132 398h248"/>
      <path fill="#0b1a3a" opacity="0.9" d="M238 428v-48c0-14 12-26 26-26s26 12 26 26v48z"/>
    `;
  }

  return `
    <path ${common} d="M134 342v-52l22-14v-18l20-14v-18l22 14v18l20 14v18l22-14v52h34v-72l26-18v-20l24-16v-20l26 16v20l24 16v20l26 18v72h26v86H134v-86z"/>
  `;
}

function svgFor(landmark) {
  const p = paletteFor(landmark.id);
  const seed = hashString(landmark.id) % 1000;
  const ink = 'url(#inkGrad)';
  const outline = '#fcd116';

  const rand = lcg(hashString(`${landmark.id}__bokeh`));
  const bokeh = Array.from({ length: 7 })
    .map(() => {
      const cx = Math.round(60 + rand() * 392);
      const cy = Math.round(52 + rand() * 186);
      const r = Math.round(10 + rand() * 26);
      const op = (0.08 + rand() * 0.12).toFixed(3);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.glow}" opacity="${op}" />`;
    })
    .join('\n    ');

  const brush1 =
    'M44 206c40-20 80-28 120-26 34 2 66 12 98 24 28 10 58 18 92 18 30 0 60-6 86-18v74H44z';
  const brush2 =
    'M44 250c48-20 94-28 138-26 36 2 70 10 102 22 30 10 60 16 94 16 28 0 54-6 78-16v90H44z';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Ilustracja: ${escapeXml(
    landmark.title,
  )}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.a}" />
      <stop offset="0.55" stop-color="${p.b}" />
      <stop offset="1" stop-color="${p.c}" />
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="18%" r="70%">
      <stop offset="0" stop-color="${p.glow}" stop-opacity="0.95" />
      <stop offset="0.42" stop-color="${p.glow}" stop-opacity="0.35" />
      <stop offset="1" stop-color="${p.c}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1233" stop-opacity="0" />
      <stop offset="1" stop-color="#0b1233" stop-opacity="0.78" />
    </linearGradient>
    <linearGradient id="inkGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#10357a" stop-opacity="0.92" />
      <stop offset="1" stop-color="#07122c" stop-opacity="1" />
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="14" flood-color="#000" flood-opacity="0.35" />
    </filter>
    <filter id="grain" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="${seed}" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.22" />
      </feComponentTransfer>
    </filter>
    <filter id="bokeh" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" />
    </filter>
  </defs>

  <rect x="0" y="0" width="512" height="512" rx="84" fill="url(#bg)" />
  <rect x="0" y="0" width="512" height="512" rx="84" fill="url(#glow)" />

  <g filter="url(#bokeh)">
    ${bokeh}
  </g>

  <g opacity="0.92">
    <path d="${brush1}" fill="#0d2b66" opacity="0.55" />
    <path d="${brush2}" fill="#0a234f" opacity="0.48" />
  </g>

  <g filter="url(#softShadow)">
    ${silhouette(landmark.type, ink, outline)}
  </g>

  <rect x="0" y="0" width="512" height="512" rx="84" fill="url(#vignette)" />
  <rect x="0" y="0" width="512" height="512" rx="84" filter="url(#grain)" opacity="0.35" />
</svg>
`;
}

function escapeXml(input) {
  return String(input || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let written = 0;

  LANDMARKS.forEach((lm) => {
    const outPath = path.join(OUT_DIR, `${lm.id}.svg`);
    fs.writeFileSync(outPath, svgFor(lm), 'utf8');
    written += 1;
  });

  // eslint-disable-next-line no-console
  console.log(`Generated ${written} SVGs in ${path.relative(ROOT, OUT_DIR)}`);
}

main();
