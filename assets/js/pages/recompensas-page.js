import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { levelsFromPlan, normalizeLevelList } from '../plan-levels.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const QS = new URLSearchParams(window.location.search);
const PRE_LEVEL = String(QS.get('level') || '').toUpperCase();
const TRACK = String(QS.get('track') || '').trim().toLowerCase();
const COURSE_VIEW = String(QS.get('view') || '').trim().toLowerCase();
let ACTIVE_TRACK = TRACK;
let ACTIVE_VIEW = COURSE_VIEW;

const passportHint = $('passportHint');
const passportLevel = $('passportLevel');
const passportGrid = $('passportGrid');
const passportMapHint = $('passportMapHint');
const passportMap = $('passportMap');

const stampModal = $('stampModal');
const stampModalTitle = $('stampModalTitle');
const stampModalBody = $('stampModalBody');
const stampModalClose = $('stampModalClose');

const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];
const ALL_LEVELS = ['A1', 'A2', 'B1', 'B2'];

const LANDMARK_IMAGE_BASE = 'assets/img/landmarks';
const LANDMARK_IMAGE_PLACEHOLDER = `${LANDMARK_IMAGE_BASE}/placeholder.svg`;
const LANDMARK_IMAGE_EXTS = ['webp', 'svg', 'png', 'jpg', 'jpeg'];

const LANDMARK_COORDS = {
  poznan_stary_rynek: [52.4083, 16.9345],
  poznan_ostrow_tumski: [52.4139, 16.9562],
  poznan_zamek_cesarski: [52.4084, 16.9157],
  poznan_malta: [52.4039, 16.9712],
  gniezno_katedra: [52.5349, 17.5989],
  lednica_ostrow: [52.5288, 17.3909],
  kornik_zamek: [52.2469, 17.0903],
  rogalin_palac: [52.2437, 16.8849],
  goluchow_zamek: [51.8506, 17.9348],
  wielkopolski_park_narodowy: [52.2587, 16.8086],
  wawel: [50.0546, 19.9352],
  rynek_glowny: [50.0619, 19.9383],
  sukiennice: [50.0618, 19.9373],
  bazylika_mariacka_krakow: [50.0617, 19.9395],
  wieliczka: [49.9827, 20.0642],
  malbork: [54.04, 19.0266],
  stare_miasto_warszawa: [52.2495, 21.0131],
  lazienki: [52.2159, 21.0356],
  wilanow: [52.1657, 21.0904],
  palac_kultury: [52.2318, 21.0067],
  muzeum_powstania_warszawskiego: [52.2326, 20.9875],
  muzeum_polin: [52.2492, 20.9935],
  zelazowa_wola: [52.2442, 20.4448],
  dlugi_targ: [54.3486, 18.653],
  zuraw_gdanski: [54.3491, 18.656],
  molo_sopot: [54.445, 18.57],
  hala_stulecia: [51.1063, 17.077],
  ostrow_tumski: [51.1149, 17.0451],
  rynek_wroclaw: [51.1103, 17.031],
  wroclaw_panorama_raclawicka: [51.1102, 17.0496],
  wroclaw_most_grunwaldzki: [51.1132, 17.0582],
  czocha_zamek: [51.0203, 15.3082],
  klodzko_twierdza: [50.4396, 16.6542],
  torun: [53.0138, 18.5984],
  kopernik_torun: [53.0088, 18.6033],
  zamosc: [50.723, 23.252],
  jasna_gora: [50.8116, 19.122],
  ksiaz: [50.8429, 16.293],
  lancut: [50.068, 22.23],
  moszna: [50.4482, 17.8379],
  ogrodzieniec: [50.4539, 19.5364],
  niedzica: [49.4242, 20.3011],
  bialowieza: [52.7015, 23.8625],
  morskie_oko: [49.2013, 20.0707],
  giewont: [49.2681, 19.9343],
  ojcowski_park_narodowy: [50.2119, 19.8293],
  park_muzakowski: [51.5462, 14.7345],
  tarnowskie_gory: [50.444, 18.859],
  kosciol_pokoju_swidnica: [50.8431, 16.4887],
  kosciol_pokoju_jawor: [51.0511, 16.1931],
  kalwaria_zebrzydowska: [49.868, 19.677],
  krzemionki: [50.9314, 21.432],
  biskupin: [52.7819, 17.7327],
  zamek_krolewski_warszawa: [52.2475, 21.0147],
  barbakan_warszawa: [52.2502, 21.0115],
  kopernik_warszawa: [52.2419, 21.0232],
};

const LANDMARKS = [
  {
    id: 'poznan_stary_rynek',
    emoji: '🐐',
    pl: 'Poznań — Stary Rynek',
    es: 'Poznań — Plaza del Mercado',
    descPl:
      'Stary Rynek w Poznaniu to serce miasta. W południe na ratuszu pojawiają się słynne koziołki.',
    descEs:
      'La Plaza del Mercado de Poznań es el corazón de la ciudad. Al mediodía aparecen los famosos cabritos en el ayuntamiento.',
    challenge: {
      prompt: 'W Poznaniu na ratuszu są słynne ___.',
      answer: 'koziołki|koziolki',
      tts: 'W Poznaniu na ratuszu są słynne koziołki.',
    },
  },
  {
    id: 'poznan_ostrow_tumski',
    emoji: '⛪',
    pl: 'Poznań — Ostrów Tumski',
    es: 'Poznań — Ostrów Tumski',
    descPl:
      'Ostrów Tumski to najstarsza część Poznania. Znajduje się tu katedra i ślady pierwszych Piastów.',
    descEs:
      'Ostrów Tumski es la parte más antigua de Poznań. Aquí está la catedral y los rastros de los primeros Piastas.',
    challenge: {
      prompt: 'Ostrów Tumski to naj___ część Poznania.',
      answer: 'starsza|najstarsza',
      tts: 'Ostrów Tumski to najstarsza część Poznania.',
    },
  },
  {
    id: 'poznan_zamek_cesarski',
    emoji: '🏰',
    pl: 'Poznań — Zamek Cesarski',
    es: 'Poznań — Castillo Imperial',
    descPl: 'Zamek Cesarski w Poznaniu to monumentalny budynek z początku XX wieku.',
    descEs: 'El Castillo Imperial de Poznań es un edificio monumental de principios del siglo XX.',
    challenge: {
      prompt: 'Zamek Cesarski jest w ___.',
      answer: 'Poznaniu|Poznań|Poznan',
      tts: 'Zamek Cesarski jest w Poznaniu.',
    },
  },
  {
    id: 'poznan_malta',
    emoji: '🌊',
    pl: 'Poznań — Jezioro Malta',
    es: 'Poznań — Lago Malta',
    descPl:
      'Jezioro Malta w Poznaniu to popularne miejsce spacerów, sportu i rekreacji.',
    descEs:
      'El Lago Malta en Poznań es un lugar popular para pasear, hacer deporte y relajarse.',
    challenge: {
      prompt: 'Jezioro Malta to miejsce ___ i rekreacji.',
      answer: 'sportu',
      tts: 'Jezioro Malta to miejsce sportu i rekreacji.',
    },
  },
  {
    id: 'gniezno_katedra',
    emoji: '⛪',
    pl: 'Gniezno — Katedra',
    es: 'Gniezno — Catedral',
    descPl: 'Katedra w Gnieźnie to jedno z najważniejszych miejsc początków państwa polskiego.',
    descEs:
      'La catedral de Gniezno es uno de los lugares más importantes de los inicios del estado polaco.',
    challenge: {
      prompt: 'Katedra w Gnieźnie jest bardzo ___.',
      answer: 'ważna|wazna',
      tts: 'Katedra w Gnieźnie jest bardzo ważna.',
    },
  },
  {
    id: 'lednica_ostrow',
    emoji: '🏝️',
    pl: 'Lednica — Ostrów Lednicki',
    es: 'Lednica — Isla Lednicka',
    descPl:
      'Ostrów Lednicki to wyspa na jeziorze Lednica, związana z początkami Polski i dynastią Piastów.',
    descEs:
      'Ostrów Lednicki es una isla en el lago Lednica, vinculada a los inicios de Polonia y la dinastía Piast.',
    challenge: {
      prompt: 'Ostrów Lednicki to ___ na jeziorze.',
      answer: 'wyspa',
      tts: 'Ostrów Lednicki to wyspa na jeziorze.',
    },
  },
  {
    id: 'kornik_zamek',
    emoji: '🏰',
    pl: 'Kórnik — Zamek',
    es: 'Kórnik — Castillo',
    descPl: 'Zamek w Kórniku to piękna rezydencja otoczona parkiem i arboretum.',
    descEs: 'El castillo de Kórnik es una hermosa residencia rodeada de parque y arboreto.',
    challenge: {
      prompt: 'Zamek w Kórniku to piękna ___.',
      answer: 'rezydencja',
      tts: 'Zamek w Kórniku to piękna rezydencja.',
    },
  },
  {
    id: 'rogalin_palac',
    emoji: '🏛️',
    pl: 'Rogalin — Pałac',
    es: 'Rogalin — Palacio',
    descPl: 'Pałac w Rogalinie słynie z galerii sztuki i zabytkowych dębów w parku.',
    descEs:
      'El palacio de Rogalin es famoso por su galería de arte y robles históricos en el parque.',
    challenge: {
      prompt: 'Pałac w Rogalinie jest w województwie ___.',
      answer: 'wielkopolskim|Wielkopolskim',
      tts: 'Pałac w Rogalinie jest w województwie wielkopolskim.',
    },
  },
  {
    id: 'goluchow_zamek',
    emoji: '🏰',
    pl: 'Gołuchów — Zamek',
    es: 'Gołuchów — Castillo',
    descPl: 'Zamek w Gołuchowie to malownicza rezydencja w stylu renesansowym.',
    descEs: 'El castillo de Gołuchów es una pintoresca residencia de estilo renacentista.',
    challenge: {
      prompt: 'Zamek w Gołuchowie jest ___.',
      answer: 'malowniczy|malownicza|piękny|piekny',
      tts: 'Zamek w Gołuchowie jest malowniczy.',
    },
  },
  {
    id: 'wielkopolski_park_narodowy',
    emoji: '🌿',
    pl: 'Wielkopolski Park Narodowy',
    es: 'Parque Nacional de Gran Polonia',
    descPl: 'Wielkopolski Park Narodowy to lasy, jeziora i szlaki blisko Poznania.',
    descEs:
      'El Parque Nacional de Gran Polonia tiene bosques, lagos y rutas cerca de Poznań.',
    challenge: {
      prompt: 'W parku narodowym są lasy i ___.',
      answer: 'jeziora|jezioro',
      tts: 'W parku narodowym są lasy i jeziora.',
    },
  },
  {
    id: 'wawel',
    emoji: '🏰',
    pl: 'Wawel',
    es: 'Wawel',
    descPl: 'Wawel to zamek królewski w Krakowie. To jedno z najważniejszych miejsc w historii Polski.',
    descEs: 'Wawel es un castillo real en Cracovia. Es uno de los lugares más importantes de la historia de Polonia.',
    challenge: {
      prompt: 'Wawel to zamek królewski w ___.',
      answer: 'Krakowie|Kraków',
      tts: 'Wawel to zamek królewski w Krakowie.',
    },
  },
  {
    id: 'rynek_glowny',
    emoji: '🏛️',
    pl: 'Rynek Główny',
    es: 'Plaza del Mercado (Kraków)',
    descPl:
      'Rynek Główny w Krakowie to jeden z największych rynków w Europie. Spotkasz tu Sukiennice i Kościół Mariacki.',
    descEs:
      'La Plaza del Mercado de Cracovia es una de las más grandes de Europa. Allí están las Sukiennice y la Basílica de Santa María.',
    challenge: {
      prompt: 'Rynek Główny jest w ___.',
      answer: 'Krakowie|Kraków',
      tts: 'Rynek Główny jest w Krakowie.',
    },
  },
  {
    id: 'sukiennice',
    emoji: '🧵',
    pl: 'Sukiennice',
    es: 'Sukiennice',
    descPl: 'Sukiennice to słynna hala targowa na Rynku Głównym w Krakowie.',
    descEs: 'Las Sukiennice son un famoso mercado cubierto en la Plaza del Mercado de Cracovia.',
    challenge: {
      prompt: 'Sukiennice są na ___ Głównym.',
      answer: 'Rynku|Rynek',
      tts: 'Sukiennice są na Rynku Głównym.',
    },
  },
  {
    id: 'bazylika_mariacka_krakow',
    emoji: '⛪',
    pl: 'Bazylika Mariacka',
    es: 'Basílica de Santa María (Kraków)',
    descPl:
      'Bazylika Mariacka to gotycki kościół w centrum Krakowa. Słynie z ołtarza Wita Stwosza i hejnału.',
    descEs:
      'La Basílica de Santa María es una iglesia gótica en el centro de Cracovia. Es famosa por el altar de Veit Stoss y el toque de trompeta.',
    challenge: {
      prompt: 'Bazylika Mariacka słynie z ___.',
      answer: 'hejnału|hejnalu',
      tts: 'Bazylika Mariacka słynie z hejnału.',
    },
  },
  {
    id: 'wieliczka',
    emoji: '🧂',
    pl: 'Wieliczka',
    es: 'Wieliczka',
    descPl:
      'Kopalnia Soli w Wieliczce to podziemne korytarze, jeziora i kaplice wykute w soli.',
    descEs:
      'La Mina de Sal de Wieliczka tiene túneles subterráneos, lagos y capillas talladas en sal.',
    challenge: {
      prompt: 'Kopalnia Soli jest w ___.',
      answer: 'Wieliczce|Wieliczka',
      tts: 'Kopalnia Soli jest w Wieliczce.',
    },
  },
  {
    id: 'malbork',
    emoji: '🏰',
    pl: 'Zamek w Malborku',
    es: 'Castillo de Malbork',
    descPl:
      'Zamek w Malborku to największy zamek z cegły w Europie. Był siedzibą Zakonu Krzyżackiego.',
    descEs:
      'El Castillo de Malbork es el castillo de ladrillo más grande de Europa. Fue la sede de la Orden Teutónica.',
    challenge: {
      prompt: 'Zamek w Malborku był siedzibą Zakonu ___.',
      answer: 'Krzyżackiego|krzyzackiego',
      tts: 'Zamek w Malborku był siedzibą Zakonu Krzyżackiego.',
    },
  },
  {
    id: 'stare_miasto_warszawa',
    emoji: '🏙️',
    pl: 'Stare Miasto (Warszawa)',
    es: 'Casco antiguo (Varsovia)',
    descPl:
      'Stare Miasto w Warszawie zostało odbudowane po II wojnie światowej i jest wpisane na listę UNESCO.',
    descEs:
      'El casco antiguo de Varsovia fue reconstruido tras la Segunda Guerra Mundial y está en la lista de la UNESCO.',
    challenge: {
      prompt: 'Stare Miasto jest w ___.',
      answer: 'Warszawie|Warszawa',
      tts: 'Stare Miasto jest w Warszawie.',
    },
  },
  {
    id: 'lazienki',
    emoji: '🌳',
    pl: 'Łazienki Królewskie',
    es: 'Parque Łazienki',
    descPl:
      'Łazienki Królewskie to park i zespół pałacowy w Warszawie. Latem odbywają się tu koncerty pod pomnikiem Chopina.',
    descEs:
      'Łazienki es un parque y conjunto palaciego en Varsovia. En verano hay conciertos junto al monumento a Chopin.',
    challenge: {
      prompt: 'Łazienki Królewskie to park w ___.',
      answer: 'Warszawie|Warszawa',
      tts: 'Łazienki Królewskie to park w Warszawie.',
    },
  },
  {
    id: 'wilanow',
    emoji: '🏛️',
    pl: 'Pałac w Wilanowie',
    es: 'Palacio de Wilanów',
    descPl: 'Pałac w Wilanowie to barokowa rezydencja królewska w Warszawie.',
    descEs: 'El Palacio de Wilanów es una residencia real barroca en Varsovia.',
    challenge: {
      prompt: 'Pałac w Wilanowie jest w ___.',
      answer: 'Warszawie|Warszawa',
      tts: 'Pałac w Wilanowie jest w Warszawie.',
    },
  },
  {
    id: 'palac_kultury',
    emoji: '🏢',
    pl: 'Pałac Kultury i Nauki',
    es: 'Palacio de la Cultura (Varsovia)',
    descPl:
      'Pałac Kultury i Nauki to wysoki budynek w centrum Warszawy. Z tarasu widokowego widać całe miasto.',
    descEs:
      'El Palacio de la Cultura y la Ciencia es un edificio alto en el centro de Varsovia. Desde la terraza se ve toda la ciudad.',
    challenge: {
      prompt: 'Pałac Kultury i Nauki jest w ___.',
      answer: 'Warszawie|Warszawa',
      tts: 'Pałac Kultury i Nauki jest w Warszawie.',
    },
  },
  {
    id: 'dlugi_targ',
    emoji: '⚓',
    pl: 'Długi Targ',
    es: 'Długi Targ (Gdańsk)',
    descPl: 'Długi Targ to reprezentacyjna ulica na Starym Mieście w Gdańsku.',
    descEs: 'Długi Targ es la calle principal del casco antiguo de Gdansk.',
    challenge: {
      prompt: 'Długi Targ jest w ___.',
      answer: 'Gdańsku|Gdańsk|Gdansku',
      tts: 'Długi Targ jest w Gdańsku.',
    },
  },
  {
    id: 'zuraw_gdanski',
    emoji: '🪝',
    pl: 'Żuraw Gdański',
    es: 'Grúa medieval (Gdansk)',
    descPl: 'Żuraw Gdański to średniowieczny dźwig portowy nad Motławą.',
    descEs: 'El Żuraw de Gdansk es una grúa portuaria medieval junto al río Motława.',
    challenge: {
      prompt: 'Żuraw Gdański stoi nad ___.',
      answer: 'Motławą|Motława|Motlawa',
      tts: 'Żuraw Gdański stoi nad Motławą.',
    },
  },
  {
    id: 'molo_sopot',
    emoji: '🌊',
    pl: 'Molo w Sopocie',
    es: 'Muelle de Sopot',
    descPl: 'Molo w Sopocie to jedno z najdłuższych drewnianych mól w Europie.',
    descEs: 'El muelle de Sopot es uno de los muelles de madera más largos de Europa.',
    challenge: {
      prompt: 'Molo jest w ___.',
      answer: 'Sopocie|Sopot',
      tts: 'Molo jest w Sopocie.',
    },
  },
  {
    id: 'hala_stulecia',
    emoji: '🏟️',
    pl: 'Hala Stulecia',
    es: 'Centennial Hall (Wrocław)',
    descPl:
      'Hala Stulecia we Wrocławiu to obiekt UNESCO i ważny przykład architektury XX wieku.',
    descEs:
      'El Centennial Hall de Breslavia es un sitio de la UNESCO y un ejemplo importante de arquitectura del siglo XX.',
    challenge: {
      prompt: 'Hala Stulecia jest we ___.',
      answer: 'Wrocławiu|Wrocław|Wroclawiu|Wroclaw',
      tts: 'Hala Stulecia jest we Wrocławiu.',
    },
  },
  {
    id: 'ostrow_tumski',
    emoji: '⛪',
    pl: 'Ostrów Tumski',
    es: 'Ostrów Tumski (Wrocław)',
    descPl: 'Ostrów Tumski to najstarsza część Wrocławia, pełna kościołów i historii.',
    descEs: 'Ostrów Tumski es la parte más antigua de Breslavia, llena de iglesias e historia.',
    challenge: {
      prompt: 'Ostrów Tumski jest we ___.',
      answer: 'Wrocławiu|Wrocław|Wroclawiu|Wroclaw',
      tts: 'Ostrów Tumski jest we Wrocławiu.',
    },
  },
  {
    id: 'rynek_wroclaw',
    emoji: '🌉',
    pl: 'Rynek (Wrocław)',
    es: 'Plaza del Mercado (Wrocław)',
    descPl:
      'Rynek we Wrocławiu jest jednym z największych rynków w Polsce. Wokół stoją kolorowe kamienice.',
    descEs:
      'La plaza del mercado de Breslavia es una de las más grandes de Polonia. Alrededor hay casas coloridas.',
    challenge: {
      prompt: 'Rynek we Wrocławiu jest jednym z największych rynków w ___.',
      answer: 'Polsce|Polska',
      tts: 'Rynek we Wrocławiu jest jednym z największych rynków w Polsce.',
    },
  },
  {
    id: 'wroclaw_panorama_raclawicka',
    emoji: '🖼️',
    pl: 'Wrocław — Panorama Racławicka',
    es: 'Breslavia — Panorama Racławicka',
    descPl:
      'Panorama Racławicka to słynny obraz panoramiczny we Wrocławiu. To wyjątkowe doświadczenie dla zwiedzających.',
    descEs:
      'La Panorama Racławicka es una famosa pintura panorámica en Breslavia. Es una experiencia única para los visitantes.',
    challenge: {
      prompt: 'Panorama Racławicka jest we ___.',
      answer: 'Wrocławiu|Wrocław|Wroclawiu|Wroclaw',
      tts: 'Panorama Racławicka jest we Wrocławiu.',
    },
  },
  {
    id: 'wroclaw_most_grunwaldzki',
    emoji: '🌉',
    pl: 'Wrocław — Most Grunwaldzki',
    es: 'Breslavia — Puente Grunwaldzki',
    descPl: 'Most Grunwaldzki to jeden z symboli Wrocławia i ważna przeprawa przez Odrę.',
    descEs:
      'El Puente Grunwaldzki es uno de los símbolos de Breslavia y un paso importante sobre el río Óder.',
    challenge: {
      prompt: 'Most Grunwaldzki jest nad rzeką ___.',
      answer: 'Odrą|Odra|Odraą|Odre|Oder',
      tts: 'Most Grunwaldzki jest nad rzeką Odrą.',
    },
  },
  {
    id: 'czocha_zamek',
    emoji: '🏰',
    pl: 'Zamek Czocha',
    es: 'Castillo Czocha',
    descPl: 'Zamek Czocha to malowniczy zamek na Dolnym Śląsku, położony nad jeziorem.',
    descEs:
      'El Castillo Czocha es un castillo pintoresco en Baja Silesia, situado junto a un lago.',
    challenge: {
      prompt: 'Zamek Czocha jest na Dolnym ___.',
      answer: 'Śląsku|Slasku|Śląsk|Slask',
      tts: 'Zamek Czocha jest na Dolnym Śląsku.',
    },
  },
  {
    id: 'klodzko_twierdza',
    emoji: '🧱',
    pl: 'Kłodzko — Twierdza',
    es: 'Kłodzko — Fortaleza',
    descPl: 'Twierdza Kłodzko to potężna fortyfikacja z pięknym widokiem na miasto i okolicę.',
    descEs:
      'La Fortaleza de Kłodzko es una gran fortificación con una hermosa vista de la ciudad y los alrededores.',
    challenge: {
      prompt: 'Twierdza Kłodzko to ___.',
      answer: 'fortyfikacja|forteca|twierdza',
      tts: 'Twierdza Kłodzko to fortyfikacja.',
    },
  },
  {
    id: 'torun',
    emoji: '🧁',
    pl: 'Stare Miasto (Toruń)',
    es: 'Casco antiguo (Toruń)',
    descPl: 'Stare Miasto w Toruniu słynie z pierników i Mikołaja Kopernika.',
    descEs: 'El casco antiguo de Torun es famoso por el pan de jengibre y Nicolás Copérnico.',
    challenge: {
      prompt: 'Toruń słynie z ___.',
      answer: 'pierników|pierniki',
      tts: 'Toruń słynie z pierników.',
    },
  },
  {
    id: 'kopernik_torun',
    emoji: '⭐',
    pl: 'Dom Kopernika (Toruń)',
    es: 'Casa de Copérnico (Toruń)',
    descPl: 'W Toruniu możesz zobaczyć dom Mikołaja Kopernika.',
    descEs: 'En Torun puedes ver la casa de Nicolás Copérnico.',
    challenge: {
      prompt: 'Mikołaj Kopernik urodził się w ___.',
      answer: 'Toruniu|Toruń',
      tts: 'Mikołaj Kopernik urodził się w Toruniu.',
    },
  },
  {
    id: 'zamosc',
    emoji: '🧱',
    pl: 'Zamość',
    es: 'Zamość',
    descPl:
      "Zamość nazywa się 'Perłą Renesansu'. Jego Stare Miasto jest na liście UNESCO.",
    descEs:
      "Zamość se conoce como la 'Perla del Renacimiento'. Su casco antiguo está en la lista de la UNESCO.",
    challenge: {
      prompt: 'Zamość nazywa się Perłą ___.',
      answer: 'Renesansu',
      tts: 'Zamość nazywa się Perłą Renesansu.',
    },
  },
  {
    id: 'jasna_gora',
    emoji: '🙏',
    pl: 'Jasna Góra',
    es: 'Jasna Góra (Częstochowa)',
    descPl: 'Jasna Góra w Częstochowie to ważne miejsce pielgrzymek.',
    descEs: 'Jasna Góra en Częstochowa es un lugar importante de peregrinación.',
    challenge: {
      prompt: 'Jasna Góra jest w ___.',
      answer: 'Częstochowie|Częstochowa|Czestochowie|Czestochowa',
      tts: 'Jasna Góra jest w Częstochowie.',
    },
  },
  {
    id: 'ksiaz',
    emoji: '🏰',
    pl: 'Zamek Książ',
    es: 'Castillo Książ',
    descPl: 'Zamek Książ to jeden z największych zamków w Polsce. Leży w pobliżu Wałbrzycha.',
    descEs: 'El Castillo de Książ es uno de los castillos más grandes de Polonia. Está cerca de Wałbrzych.',
    challenge: {
      prompt: 'Zamek Książ leży w pobliżu ___.',
      answer: 'Wałbrzycha|Wałbrzych|Walbrzycha|Walbrzych',
      tts: 'Zamek Książ leży w pobliżu Wałbrzycha.',
    },
  },
  {
    id: 'lancut',
    emoji: '🏰',
    pl: 'Łańcut',
    es: 'Łańcut',
    descPl: 'Zamek w Łańcucie słynie z pięknych wnętrz i muzeum powozów.',
    descEs: 'El castillo de Łańcut es famoso por sus interiores y su museo de carruajes.',
    challenge: {
      prompt: 'Zamek w Łańcucie słynie z muzeum ___.',
      answer: 'powozów|powozy',
      tts: 'Zamek w Łańcucie słynie z muzeum powozów.',
    },
  },
  {
    id: 'moszna',
    emoji: '🏰',
    pl: 'Moszna',
    es: 'Moszna',
    descPl: 'Zamek w Mosznej wygląda jak z bajki — ma wiele wież i ozdobnych detali.',
    descEs: 'El castillo de Moszna parece de cuento: tiene muchas torres y detalles decorativos.',
    challenge: {
      prompt: 'Zamek w Mosznej wygląda jak z ___.',
      answer: 'bajki',
      tts: 'Zamek w Mosznej wygląda jak z bajki.',
    },
  },
  {
    id: 'ogrodzieniec',
    emoji: '🪨',
    pl: 'Ogrodzieniec',
    es: 'Ogrodzieniec',
    descPl: 'Ruiny zamku Ogrodzieniec leżą na Szlaku Orlich Gniazd.',
    descEs: 'Las ruinas del castillo de Ogrodzieniec están en la Ruta de los Nidos de Águilas.',
    challenge: {
      prompt: 'Ogrodzieniec leży na Szlaku Orlich ___.',
      answer: 'Gniazd|gniazd',
      tts: 'Ogrodzieniec leży na Szlaku Orlich Gniazd.',
    },
  },
  {
    id: 'niedzica',
    emoji: '🏰',
    pl: 'Niedzica',
    es: 'Niedzica',
    descPl: 'Zamek w Niedzicy stoi nad Jeziorem Czorsztyńskim.',
    descEs: 'El castillo de Niedzica está junto al lago Czorsztyn.',
    challenge: {
      prompt: 'Zamek w Niedzicy stoi nad Jeziorem ___.',
      answer: 'Czorsztyńskim|Czorsztyn|Czorsztynskim',
      tts: 'Zamek w Niedzicy stoi nad Jeziorem Czorsztyńskim.',
    },
  },
  {
    id: 'bialowieza',
    emoji: '🌲',
    pl: 'Puszcza Białowieska',
    es: 'Bosque de Białowieża',
    descPl:
      'Puszcza Białowieska to jeden z ostatnich naturalnych lasów w Europie. Można tu spotkać żubra.',
    descEs:
      'El Bosque de Białowieża es uno de los últimos bosques naturales de Europa. Allí se puede ver al bisonte europeo.',
    challenge: {
      prompt: 'W Puszczy Białowieskiej można spotkać ___.',
      answer: 'żubra|żubr|zubra|zubr',
      tts: 'W Puszczy Białowieskiej można spotkać żubra.',
    },
  },
  {
    id: 'morskie_oko',
    emoji: '🏔️',
    pl: 'Morskie Oko',
    es: 'Morskie Oko',
    descPl: 'Morskie Oko to popularne jezioro w Tatrach, otoczone górami.',
    descEs: 'Morskie Oko es un lago popular en los Tatras, rodeado de montañas.',
    challenge: {
      prompt: 'Morskie Oko leży w ___.',
      answer: 'Tatrach|Tatry',
      tts: 'Morskie Oko leży w Tatrach.',
    },
  },
  {
    id: 'giewont',
    emoji: '⛰️',
    pl: 'Giewont',
    es: 'Giewont',
    descPl: 'Giewont to charakterystyczny szczyt w Tatrach, często kojarzony z Zakopanem.',
    descEs: 'Giewont es un pico característico de los Tatras, a menudo asociado con Zakopane.',
    challenge: {
      prompt: 'Giewont to szczyt w ___.',
      answer: 'Tatrach|Tatry',
      tts: 'Giewont to szczyt w Tatrach.',
    },
  },
  {
    id: 'park_muzakowski',
    emoji: '🌳',
    pl: 'Park Mużakowski',
    es: 'Parque de Muskau',
    descPl: 'Park Mużakowski to rozległy park krajobrazowy na granicy Polski i Niemiec.',
    descEs: 'El Parque de Muskau es un gran parque paisajístico en la frontera entre Polonia y Alemania.',
    challenge: {
      prompt: 'Park Mużakowski leży na granicy Polski i ___.',
      answer: 'Niemiec|Niemcy',
      tts: 'Park Mużakowski leży na granicy Polski i Niemiec.',
    },
  },
  {
    id: 'tarnowskie_gory',
    emoji: '⛏️',
    pl: 'Tarnowskie Góry',
    es: 'Tarnowskie Góry',
    descPl: 'Kopalnie w Tarnowskich Górach to podziemia związane z wydobyciem srebra i ołowiu.',
    descEs: 'Las minas de Tarnowskie Góry son galerías subterráneas ligadas a la extracción de plata y plomo.',
    challenge: {
      prompt: 'W Tarnowskich Górach wydobywano ___.',
      answer: 'srebro|srebra',
      tts: 'W Tarnowskich Górach wydobywano srebro.',
    },
  },
  {
    id: 'kosciol_pokoju_swidnica',
    emoji: '⛪',
    pl: 'Kościół Pokoju (Świdnica)',
    es: 'Iglesia de la Paz (Świdnica)',
    descPl: 'Kościół Pokoju w Świdnicy jest drewniany, ogromny i wpisany na listę UNESCO.',
    descEs: 'La Iglesia de la Paz en Świdnica es de madera, enorme y está en la lista de la UNESCO.',
    challenge: {
      prompt: 'Kościół Pokoju jest w ___.',
      answer: 'Świdnicy|Świdnica|Swidnicy|Swidnica',
      tts: 'Kościół Pokoju jest w Świdnicy.',
    },
  },
  {
    id: 'kosciol_pokoju_jawor',
    emoji: '⛪',
    pl: 'Kościół Pokoju (Jawor)',
    es: 'Iglesia de la Paz (Jawor)',
    descPl: 'Kościół Pokoju w Jaworze to wyjątkowy zabytek drewnianej architektury.',
    descEs: 'La Iglesia de la Paz en Jawor es un monumento único de arquitectura de madera.',
    challenge: {
      prompt: 'Kościół Pokoju jest w ___.',
      answer: 'Jaworze|Jawor',
      tts: 'Kościół Pokoju jest w Jaworze.',
    },
  },
  {
    id: 'kalwaria_zebrzydowska',
    emoji: '⛪',
    pl: 'Kalwaria Zebrzydowska',
    es: 'Kalwaria Zebrzydowska',
    descPl: 'Kalwaria Zebrzydowska to zespół klasztorny i dróżki pielgrzymkowe.',
    descEs: 'Kalwaria Zebrzydowska es un conjunto monástico y rutas de peregrinación.',
    challenge: {
      prompt: 'Kalwaria Zebrzydowska to zespół ___.',
      answer: 'klasztorny|klasztoru',
      tts: 'Kalwaria Zebrzydowska to zespół klasztorny.',
    },
  },
  {
    id: 'ojcowski_park_narodowy',
    emoji: '🌿',
    pl: 'Ojcowski Park Narodowy',
    es: 'Parque Nacional de Ojców',
    descPl:
      'Ojcowski Park Narodowy to doliny, skały i jaskinie niedaleko Krakowa. To najmniejszy park narodowy w Polsce.',
    descEs:
      'El Parque Nacional de Ojców tiene valles, rocas y cuevas cerca de Cracovia. Es el parque nacional más pequeño de Polonia.',
    challenge: {
      prompt: 'Ojcowski Park Narodowy jest niedaleko ___.',
      answer: 'Krakowa|Kraków|Krakowa|Cracovia',
      tts: 'Ojcowski Park Narodowy jest niedaleko Krakowa.',
    },
  },
  {
    id: 'krzemionki',
    emoji: '🪓',
    pl: 'Krzemionki',
    es: 'Krzemionki',
    descPl: 'Krzemionki to prehistoryczne kopalnie krzemienia pasiastego.',
    descEs: 'Krzemionki son minas prehistóricas de sílex rayado.',
    challenge: {
      prompt: 'Krzemionki to prehistoryczne kopalnie ___.',
      answer: 'krzemienia|krzemien',
      tts: 'Krzemionki to prehistoryczne kopalnie krzemienia.',
    },
  },
  {
    id: 'biskupin',
    emoji: '🏺',
    pl: 'Biskupin',
    es: 'Biskupin',
    descPl: 'Biskupin to słynne stanowisko archeologiczne i rekonstrukcja osady z epoki żelaza.',
    descEs: 'Biskupin es un famoso yacimiento arqueológico y reconstrucción de un poblado de la Edad de Hierro.',
    challenge: {
      prompt: 'Biskupin to stanowisko ___.',
      answer: 'archeologiczne|archeologia',
      tts: 'Biskupin to stanowisko archeologiczne.',
    },
  },
  {
    id: 'zamek_krolewski_warszawa',
    emoji: '👑',
    pl: 'Zamek Królewski (Warszawa)',
    es: 'Castillo Real (Varsovia)',
    descPl: 'Zamek Królewski w Warszawie był siedzibą królów i jest symbolem miasta.',
    descEs: 'El Castillo Real de Varsovia fue residencia de reyes y es un símbolo de la ciudad.',
    challenge: {
      prompt: 'Zamek Królewski jest w ___.',
      answer: 'Warszawie|Warszawa',
      tts: 'Zamek Królewski jest w Warszawie.',
    },
  },
  {
    id: 'barbakan_warszawa',
    emoji: '🧱',
    pl: 'Barbakan (Warszawa)',
    es: 'Barbacana (Varsovia)',
    descPl: 'Barbakan w Warszawie to fragment dawnych murów obronnych Starego Miasta.',
    descEs: 'El Barbican de Varsovia es un fragmento de las antiguas murallas del casco antiguo.',
    challenge: {
      prompt: 'Barbakan to fragment murów ___.',
      answer: 'obronnych|obronne',
      tts: 'Barbakan to fragment murów obronnych.',
    },
  },
  {
    id: 'kopernik_warszawa',
    emoji: '🔭',
    pl: 'Centrum Nauki Kopernik',
    es: 'Centro de Ciencias Copérnico',
    descPl: 'Centrum Nauki Kopernik w Warszawie to interaktywne muzeum nauki.',
    descEs: 'El Centro de Ciencias Copérnico en Varsovia es un museo interactivo de ciencia.',
    challenge: {
      prompt: 'Centrum Nauki Kopernik jest w ___.',
      answer: 'Warszawie|Warszawa',
      tts: 'Centrum Nauki Kopernik jest w Warszawie.',
    },
  },
  {
    id: 'muzeum_powstania_warszawskiego',
    emoji: '🏛️',
    pl: 'Warszawa — Muzeum Powstania',
    es: 'Varsovia — Museo del Alzamiento',
    descPl: 'Muzeum Powstania Warszawskiego opowiada o historii miasta i jego mieszkańców.',
    descEs:
      'El Museo del Alzamiento de Varsovia cuenta la historia de la ciudad y sus habitantes.',
    challenge: {
      prompt: 'Muzeum Powstania jest w ___.',
      answer: 'Warszawie|Warszawa',
      tts: 'Muzeum Powstania jest w Warszawie.',
    },
  },
  {
    id: 'muzeum_polin',
    emoji: '🏛️',
    pl: 'Warszawa — Muzeum POLIN',
    es: 'Varsovia — Museo POLIN',
    descPl: 'Muzeum POLIN to nowoczesne muzeum historii Żydów polskich w Warszawie.',
    descEs:
      'El Museo POLIN es un museo moderno de la historia de los judíos polacos en Varsovia.',
    challenge: {
      prompt: 'Muzeum POLIN jest w ___.',
      answer: 'Warszawie|Warszawa',
      tts: 'Muzeum POLIN jest w Warszawie.',
    },
  },
  {
    id: 'zelazowa_wola',
    emoji: '🎹',
    pl: 'Żelazowa Wola',
    es: 'Żelazowa Wola',
    descPl: 'Żelazowa Wola to miejsce urodzenia Fryderyka Chopina, położone w województwie mazowieckim.',
    descEs:
      'Żelazowa Wola es el lugar de nacimiento de Fryderyk Chopin, en la voivodía de Mazovia.',
    challenge: {
      prompt: 'Żelazowa Wola to miejsce urodzenia ___.',
      answer: 'Chopina|chopin',
      tts: 'Żelazowa Wola to miejsce urodzenia Chopina.',
    },
  },
].map((landmark) => {
  const coords = LANDMARK_COORDS[landmark.id] || null;
  const imageUrl = String(landmark?.imageUrl || '').trim();

  return {
    ...landmark,
    ...(coords ? { lat: coords[0], lng: coords[1] } : {}),
    imageUrl,
  };
});

function createLandmarkImageEl(landmark) {
  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';

  const candidates = [];
  const direct = String(landmark?.imageUrl || '').trim();
  if (direct) candidates.push(direct);
  else {
    const id = String(landmark?.id || '').trim();
    if (id) {
      LANDMARK_IMAGE_EXTS.forEach((ext) => {
        candidates.push(`${LANDMARK_IMAGE_BASE}/${id}.${ext}`);
      });
    }
  }
  candidates.push(LANDMARK_IMAGE_PLACEHOLDER);

  let idx = 0;
  const tryNext = () => {
    const next = candidates[idx] || LANDMARK_IMAGE_PLACEHOLDER;
    idx += 1;
    img.src = next;
  };

  img.addEventListener('error', () => {
    if (idx >= candidates.length) return;
    tryNext();
  });

  tryNext();
  return img;
}

const LANDMARK_BY_ID = Object.fromEntries(LANDMARKS.map((x) => [x.id, x]));

const ROUTES_BY_LEVEL = {
  A1: {
    regionPl: 'Wielkopolskie',
    center: [52.35, 16.9],
    route: [
      'poznan_stary_rynek',
      'poznan_ostrow_tumski',
      'poznan_zamek_cesarski',
      'poznan_malta',
      'wielkopolski_park_narodowy',
      'kornik_zamek',
      'rogalin_palac',
      'lednica_ostrow',
      'gniezno_katedra',
      'goluchow_zamek',
    ],
  },
  A2: {
    regionPl: 'Dolnośląskie',
    center: [51.1, 17.0],
    route: [
      'rynek_wroclaw',
      'ostrow_tumski',
      'wroclaw_most_grunwaldzki',
      'wroclaw_panorama_raclawicka',
      'hala_stulecia',
      'kosciol_pokoju_swidnica',
      'kosciol_pokoju_jawor',
      'ksiaz',
      'klodzko_twierdza',
      'czocha_zamek',
    ],
  },
  B1: {
    regionPl: 'Małopolskie',
    center: [50.06, 19.94],
    route: [
      'rynek_glowny',
      'sukiennice',
      'bazylika_mariacka_krakow',
      'wawel',
      'ojcowski_park_narodowy',
      'wieliczka',
      'kalwaria_zebrzydowska',
      'giewont',
      'morskie_oko',
      'niedzica',
    ],
  },
  B2: {
    regionPl: 'Mazowieckie',
    center: [52.23, 21.0],
    route: [
      'stare_miasto_warszawa',
      'zamek_krolewski_warszawa',
      'barbakan_warszawa',
      'muzeum_polin',
      'palac_kultury',
      'muzeum_powstania_warszawskiego',
      'kopernik_warszawa',
      'lazienki',
      'wilanow',
      'zelazowa_wola',
    ],
  },
};

function routeForLevel(level) {
  const lvl = String(level || '').toUpperCase();
  return ROUTES_BY_LEVEL[lvl] || ROUTES_BY_LEVEL.A1;
}

function seededOffset(seed, min, max) {
  const h = Math.max(1, Number(seed || 1));
  const x = (Math.sin(h * 999) + 1) / 2;
  return min + (max - min) * x;
}

function regionalBonusLandmark({ level, index }) {
  const cfg = routeForLevel(level);
  const reg = cfg?.regionPl || 'Polska';
  const seed = (index + 1) * 37;
  const lat = Number(cfg?.center?.[0] || 52.1) + seededOffset(seed, -0.18, 0.18);
  const lng = Number(cfg?.center?.[1] || 19.4) + seededOffset(seed + 13, -0.28, 0.28);

  return {
    id: `bonus_${String(level || 'A1').toUpperCase()}_${index + 1}`,
    emoji: '🏛️',
    pl: `Zabytek (${reg}) #${index + 1}`,
    es: `Monumento (${reg}) #${index + 1}`,
    descPl: `W tym poziomie podróżujemy po województwie ${reg}.`,
    descEs: `En este nivel viajamos por la región ${reg}.`,
    lat,
    lng,
    imageUrl: '',
    challenge: {
      prompt: `To jest zabytek w województwie ___.`,
      answer: reg,
      tts: `To jest zabytek w województwie ${reg}.`,
    },
  };
}

function buildLandmarkRoute(level, topicsCount) {
  const want = Math.max(0, Number(topicsCount || 0));
  const primary = routeForLevel(level)?.route || [];

  const out = [];
  const used = new Set();

  const appendLandmarkId = (id) => {
    const lm = LANDMARK_BY_ID[id];
    if (!lm) return false;
    if (used.has(lm.id)) return false;
    out.push(lm);
    used.add(lm.id);
    return true;
  };

  primary.forEach((id) => {
    if (out.length >= want) return;
    appendLandmarkId(id);
  });

  if (out.length < want) {
    for (let i = 0; i < want; i += 1) {
      if (out.length >= want) break;
      const bonus = regionalBonusLandmark({ level, index: i });
      if (used.has(bonus.id)) continue;
      out.push(bonus);
      used.add(bonus.id);
    }
  }

  while (out.length < want) out.push(null);
  return out;
}

function clamp(n, a, b) {
  const x = Number(n);
  if (Number.isNaN(x)) return a;
  return Math.min(b, Math.max(a, x));
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeTrack(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function normalizeCourseView(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function topicTrackList(topic) {
  const raw = topic?.track;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeTrack).filter(Boolean);
  const one = normalizeTrack(raw);
  return one ? [one] : [];
}

function topicMatchesTrack(topic, track) {
  const tracks = topicTrackList(topic);
  const want = normalizeTrack(track);
  if (want) return tracks.includes(want);
  return tracks.length === 0;
}

function contextFromReferrer() {
  try {
    const ref = String(document.referrer || '').trim();
    if (!ref) return { track: '', view: '' };
    const url = new URL(ref);
    const qs = url.searchParams;
    const track = normalizeTrack(qs.get('track') || '');
    const view = normalizeCourseView(qs.get('view') || '');

    const path = String(url.pathname || '').toLowerCase();
    if (!track && path.endsWith('/curso-latam.html')) return { track: 'latam', view: view || 'latam' };
    if (!track && path.endsWith('/curso-latam')) return { track: 'latam', view: view || 'latam' };

    return { track, view };
  } catch {
    return { track: '', view: '' };
  }
}

function impliedTrackFromView(view) {
  const v = normalizeCourseView(view);
  if (v === 'latam') return 'latam';
  return '';
}

function pickMostCommonTrack(topics) {
  const counts = new Map();
  topics.forEach((t) => {
    const tracks = topicTrackList(t);
    tracks.forEach((tr) => {
      const key = normalizeTrack(tr);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  let best = '';
  let bestCount = 0;
  counts.forEach((count, key) => {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  });

  return best;
}

(() => {
  const ref = contextFromReferrer();
  if (!ACTIVE_TRACK && ref.track) ACTIVE_TRACK = ref.track;
  if (!ACTIVE_VIEW && ref.view) ACTIVE_VIEW = ref.view;
})();

function parseList(raw) {
  return String(raw || '')
    .split(/[\n;|,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function canRecordVoice() {
  return (
    typeof window !== 'undefined' &&
    'MediaRecorder' in window &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function speakPolish(text) {
  const t = String(text || '').trim();
  if (!t) return;
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;

  try {
    const utter = new SpeechSynthesisUtterance(t);
    utter.lang = 'pl-PL';
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const plVoice = voices.find((v) =>
      String(v.lang || '').toLowerCase().startsWith('pl'),
    );
    if (plVoice) utter.voice = plVoice;

    window.speechSynthesis?.cancel?.();
    window.speechSynthesis?.speak?.(utter);
  } catch {}
}

function topicKey(level, topic) {
  const lvl = String(level || '').toUpperCase();
  const slug = String(topic?.slug || topic?.id || '').trim();
  return slug ? `${lvl}__${slug}` : null;
}

function progressPct(progress) {
  if (!progress) return 0;
  if (progress.completed === true) return 100;
  const practice = Number(progress.practicePercent || 0);
  const testTotal = Number(progress.testTotal || 0);
  const testScore = Number(progress.testScore || 0);
  const best = testTotal > 0 ? Math.max(practice, testScore) : practice;
  return clamp(Math.round(best), 0, 100);
}

function progressState(progress) {
  const pct = progressPct(progress);
  const done = progress?.completed === true || pct >= 100;
  return { pct, done };
}

function highlightStep(topicIdx) {
  if (!passportGrid) return;
  const el = passportGrid.querySelector(`[data-step-index="${String(topicIdx)}"]`);
  if (!el) return;
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch {}

  el.classList.add('is-highlight');
  window.setTimeout(() => el.classList.remove('is-highlight'), 1200);
}

function landmarkForTopic(topicIndex) {
  const idx = Math.max(0, Number(topicIndex || 0));
  const base = LANDMARKS[idx % LANDMARKS.length];
  if (base) return base;
  return {
    id: `bonus_${idx + 1}`,
    emoji: '🏛️',
    pl: `Zabytek #${idx + 1}`,
    es: `Monumento #${idx + 1}`,
    descPl: 'Polska ma wiele pięknych zabytków i miejsc wartych zobaczenia.',
    descEs: 'Polonia tiene muchos monumentos y lugares que vale la pena ver.',
    challenge: {
      prompt: 'Polska ma wiele pięknych ___.',
      answer: 'zabytków|zabytki',
      tts: 'Polska ma wiele pięknych zabytków.',
    },
  };
}

function buildSteps({ level, topics, progressMap }) {
  const route = buildLandmarkRoute(level, topics.length);
  return topics.map((topic, topicIdx) => {
    const landmark = route[topicIdx] || landmarkForTopic(topicIdx);
    const key = topicKey(level, topic);
    const prog = key ? progressMap[key] : null;
    const state = progressState(prog);
    return {
      level,
      topicIdx,
      topic,
      landmark,
      progress: { pct: state.pct },
      isDone: state.done,
    };
  });
}

async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() || {} : {};
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').toLowerCase());
}

function computeLevelFlags(userDoc, email) {
  const isAdmin =
    isAdminEmail(email) ||
    userDoc?.admin === true ||
    String(userDoc?.role || '').toLowerCase() === 'admin';
  if (isAdmin) {
    return {
      isAdmin: true,
      isUntilValid: true,
      visibleLevels: ALL_LEVELS.slice(),
      unlocked: new Set(ALL_LEVELS),
    };
  }

  const until = userDoc?.accessUntil || null;
  const untilDate = until?.toDate ? until.toDate() : until ? new Date(until) : null;
  const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
  const isUntilValid = hasUntil ? untilDate.getTime() > Date.now() : false;

  const raw = normalizeLevelList(userDoc?.levels);
  const levels = raw.length ? raw : normalizeLevelList(levelsFromPlan(userDoc?.plan));

  const plan = String(userDoc?.plan || '').toLowerCase();
  const hasGlobal = plan === 'premium' || (userDoc?.access === true && levels.length === 0);
  const allowed = hasGlobal ? ALL_LEVELS : levels;

  // Visible: always show all levels, but lock what isn't available.
  const visibleLevels = ALL_LEVELS.slice();

  // Unlock rules: preview A1 always; other levels require (allowed + valid accessUntil).
  const unlocked = new Set(['A1']);
  if (isUntilValid) {
    allowed.forEach((lvl) => {
      const up = String(lvl || '').toUpperCase();
      if (ALL_LEVELS.includes(up)) unlocked.add(up);
    });
  }

  return { isAdmin: false, isUntilValid, visibleLevels, unlocked };
}

function fillLevelSelect(levels, preferred, unlockedSet) {
  if (!passportLevel) return;
  passportLevel.innerHTML = '';
  levels.forEach((lvl) => {
    const opt = document.createElement('option');
    opt.value = lvl;
    const locked = unlockedSet && !unlockedSet.has(lvl);
    opt.textContent = locked ? `Nivel ${lvl} 🔒` : `Nivel ${lvl}`;
    passportLevel.appendChild(opt);
  });
  if (preferred && levels.includes(preferred)) passportLevel.value = preferred;
}

async function loadProgressMap(uid, level) {
  const map = {};
  if (!uid) return map;
  try {
    const snap = await getDocs(
      query(collection(db, 'user_progress', uid, 'topics'), where('level', '==', level)),
    );
    snap.forEach((d) => {
      map[d.id] = d.data() || {};
    });
  } catch (e) {
    console.warn('[passport] loadProgressMap failed', e);
  }
  return map;
}

async function loadTopics(level) {
  const all = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', level), orderBy('order')),
    );
    snap.forEach((d) => {
      const t = { id: d.id, ...(d.data() || {}) };
      if (t.isArchived === true) return;
      all.push(t);
    });
  } catch (e) {
    console.warn('[passport] loadTopics failed', e);
  }

  const explicit = normalizeTrack(ACTIVE_TRACK);
  const implied = impliedTrackFromView(ACTIVE_VIEW);

  const trackCounts = new Map();
  all.forEach((t) => {
    const tracks = topicTrackList(t);
    tracks.forEach((tr) => {
      const key = normalizeTrack(tr);
      if (!key) return;
      trackCounts.set(key, (trackCounts.get(key) || 0) + 1);
    });
  });

  const byFrequency = Array.from(trackCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  const candidates = [];
  const addCandidate = (raw) => {
    const key = normalizeTrack(raw);
    const val = raw ? key : '';
    if (val === '' && candidates.includes('')) return;
    if (val && candidates.includes(val)) return;
    candidates.push(val);
  };

  // Candidate ordering:
  // - Explicit (URL) first, but don't hard-fail if empty.
  // - If view suggests a track (LATAM), try it early.
  // - Then classic/untracked.
  // - Then any other known tracks by frequency.
  if (explicit) addCandidate(explicit);
  if (implied) addCandidate(implied);
  addCandidate('');
  byFrequency.forEach((t) => addCandidate(t));

  for (const wantTrack of candidates) {
    const list = all.filter((t) => topicMatchesTrack(t, wantTrack));
    if (list.length) {
      ACTIVE_TRACK = wantTrack;
      return list;
    }
  }

  return [];
}

function renderGrid({ level, steps }) {
  if (!passportGrid) return;
  passportGrid.innerHTML = '';

  let items = Array.isArray(steps) ? steps : [];
  let isPreview = false;

  if (!items.length) {
    const cfg = routeForLevel(level);
    const route = Array.isArray(cfg?.route) ? cfg.route : [];
    const previewSteps = route
      .map((id, idx) => {
        const landmark = LANDMARK_BY_ID[id];
        if (!landmark) return null;
        return {
          level: String(level || 'A1').toUpperCase(),
          topicIdx: idx,
          topic: null,
          landmark,
          progress: { pct: 0 },
          isDone: false,
          isPreview: true,
        };
      })
      .filter(Boolean);

    if (!previewSteps.length) {
      if (passportHint) passportHint.textContent = 'No hay temas para este nivel.';
      passportGrid.innerHTML = `<div class="muted">No hay temas para este nivel.</div>`;
      return;
    }

    isPreview = true;
    items = previewSteps;
  }

  let unlocked = 0;

  items.forEach((stepData) => {
    const topicIdx = stepData.topicIdx;
    const topic = stepData.topic;
    const landmark = stepData.landmark;
    const pct = stepData.progress.pct;
    const isDone = stepData.isDone;
    if (isDone) unlocked += 1;

    const step = document.createElement('div');
    step.className = `passportStep ${isDone ? 'is-unlocked' : ''}`;
    step.dataset.stepIndex = String(topicIdx);

    const stamp = document.createElement('button');
    stamp.type = 'button';
    stamp.className = `passportStamp ${isDone ? 'is-unlocked' : 'is-locked'}`;
    stamp.setAttribute('aria-label', `Recompensa: ${landmark.es || landmark.pl}`);

    const top = document.createElement('div');
    top.className = 'passportStampTop';

    const media = document.createElement('div');
    media.className = 'passportStampEmoji';
    media.appendChild(createLandmarkImageEl(landmark));

    const textWrap = document.createElement('div');
    textWrap.style.minWidth = '0';
    textWrap.style.flex = '1';

    const title = document.createElement('div');
    title.className = 'passportStampTitle';
    title.textContent = landmark.es ? `${landmark.pl} · ${landmark.es}` : landmark.pl;

    const meta = document.createElement('div');
    meta.className = 'passportStampMeta';
    const topicLabel = String(topic?.title || topic?.slug || topic?.id || '').trim();
    meta.textContent = [`Tema ${topicIdx + 1}`, topicLabel, `${pct}%`].filter(Boolean).join(' · ');

    textWrap.appendChild(title);
    textWrap.appendChild(meta);

    top.appendChild(media);
    top.appendChild(textWrap);
    stamp.appendChild(top);

    const pills = document.createElement('div');
    pills.className = 'passportStampPillRow';

    const p1 = document.createElement('span');
    p1.className = 'pill';
    p1.textContent = `Tema ${topicIdx + 1}`;
    pills.appendChild(p1);

    const p2 = document.createElement('span');
    p2.className = isDone ? 'pill pill-blue' : 'pill';
    p2.textContent = isDone ? 'Recompensa ganada' : pct > 0 ? 'En curso' : 'Bloqueada';
    pills.appendChild(p2);

    const p3 = document.createElement('span');
    p3.className = 'pill pill-yellow';
    p3.textContent = `${pct}%`;
    pills.appendChild(p3);

    stamp.appendChild(pills);

    stamp.addEventListener('click', () =>
      openStampModal({
        level,
        isDone,
        topicIdx,
        topic,
        progress: { pct },
        landmark,
      }),
    );

    step.appendChild(stamp);
    passportGrid.appendChild(step);
  });

  if (passportHint) {
    if (isPreview) {
      const cfg = routeForLevel(level);
      const region = cfg?.regionPl ? ` (${cfg.regionPl})` : '';
      passportHint.textContent = `Vista previa de la ruta${region}: ${items.length} sellos · Temas: 0`;
    } else {
      passportHint.textContent = `Temas: ${items.length} · Recompensas: ${unlocked}/${items.length}`;
    }
  }
}

let LEAFLET_MAP = null;
let LEAFLET_LAYER = null;

function ensureLeafletMap() {
  if (!passportMap) return null;
  const L = window.L;
  if (!L || typeof L.map !== 'function') return null;
  if (LEAFLET_MAP) return LEAFLET_MAP;

  LEAFLET_MAP = L.map(passportMap, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
  });

  const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution:
      '&copy; OpenStreetMap contributors &copy; CARTO',
  });
  tiles.addTo(LEAFLET_MAP);

  LEAFLET_LAYER = L.layerGroup().addTo(LEAFLET_MAP);
  LEAFLET_MAP.setView([52.1, 19.4], 6);

  window.setTimeout(() => {
    try {
      LEAFLET_MAP?.invalidateSize?.();
    } catch {}
  }, 0);

  return LEAFLET_MAP;
}

function renderMap({ level, steps }) {
  if (!passportMap) return;

  const map = ensureLeafletMap();
  if (!map || !LEAFLET_LAYER) {
    passportMap.style.display = 'none';
    if (passportMapHint) passportMapHint.textContent = 'Mapa niedostępna.';
    return;
  }

  passportMap.style.display = '';
  window.setTimeout(() => {
    try {
      map?.invalidateSize?.();
    } catch {}
  }, 0);

  const lvl = String(level || steps[0]?.level || '').toUpperCase();
  const fallbackCfg = lvl ? routeForLevel(lvl) : null;

  const startName =
    steps[0]?.landmark?.pl ||
    (fallbackCfg?.route?.length ? LANDMARK_BY_ID[fallbackCfg.route[0]]?.pl : '') ||
    '—';
  const endName =
    steps[steps.length - 1]?.landmark?.pl ||
    (fallbackCfg?.route?.length
      ? LANDMARK_BY_ID[fallbackCfg.route[fallbackCfg.route.length - 1]]?.pl
      : '') ||
    '—';

  const region = fallbackCfg?.regionPl ? ` (${fallbackCfg.regionPl})` : '';
  if (passportMapHint) passportMapHint.textContent = `Trasa${region}: ${startName} → ${endName}`;

  LEAFLET_LAYER.clearLayers();

  const L = window.L;
  const points = [];

  const fallbackLevel = lvl;

  const renderOne = (stepData, idxOverride = null) => {
    const idx = idxOverride ?? stepData.topicIdx;
    const landmark = stepData.landmark;
    if (!landmark || typeof landmark.lat !== 'number' || typeof landmark.lng !== 'number') return;

    const latlng = [landmark.lat, landmark.lng];
    points.push(latlng);

    const icon = L.divIcon({
      className: 'passportMapMarker',
      html: `<div class="passportMapMarkerInner ${stepData.isDone ? 'is-done' : ''}">${idx + 1}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    const marker = L.marker(latlng, { icon, title: landmark.pl || landmark.es || '' });

    marker.on('click', () => {
      openStampModal({
        level: stepData.level,
        topicIdx: idx,
        topic: stepData.topic,
        isDone: stepData.isDone,
        progress: stepData.progress,
        landmark: stepData.landmark,
      });
      highlightStep(idx);
    });

    marker.addTo(LEAFLET_LAYER);
  };

  if (steps.length) {
    steps.forEach((s) => renderOne(s));
  } else if (fallbackCfg?.route?.length) {
    fallbackCfg.route.forEach((id, idx) => {
      const lm = LANDMARK_BY_ID[id];
      if (!lm) return;
      renderOne(
        {
          level: fallbackLevel || 'A1',
          topicIdx: idx,
          topic: null,
          landmark: lm,
          progress: { pct: 0 },
          isDone: false,
        },
        idx,
      );
    });
  }

  if (points.length >= 2) {
    L.polyline(points, {
      color: 'rgba(252, 209, 22, 0.9)',
      weight: 4,
      opacity: 0.85,
    }).addTo(LEAFLET_LAYER);
  }

  if (points.length) {
    try {
      map.fitBounds(points, { padding: [26, 26] });
    } catch {}
  } else {
    map.setView([52.1, 19.4], 6);
  }
}

function openStampModal({ level, topicIdx, topic, isDone, progress, landmark }) {
  if (!stampModal || !stampModalTitle || !stampModalBody) return;

  stampModalTitle.textContent = `${landmark.emoji} ${landmark.es || landmark.pl}`;
  stampModalBody.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'stampBodyGrid';

  const art = createLandmarkImageEl(landmark);
  art.className = 'stampArt';
  wrap.appendChild(art);

  const status = document.createElement('div');
  status.className = 'hintSmall';
  status.style.marginBottom = '8px';
  status.textContent = isDone
    ? `✅ Recompensa ganada · Tema ${topicIdx + 1} · Nivel ${level}`
    : `🔒 Bloqueada · Tema ${topicIdx + 1} · Progreso ${progress.pct}%`;
  wrap.appendChild(status);

  if (topic?.title || topic?.slug || topic?.id) {
    const topicRow = document.createElement('div');
    topicRow.className = 'muted';
    topicRow.textContent = `Tema del curso: ${topic?.title || topic?.slug || topic?.id}`;
    wrap.appendChild(topicRow);
  }

  if (!isDone) {
    const lock = document.createElement('div');
    lock.className = 'muted';
    lock.textContent = topic
      ? 'Completa este tema para ganar la recompensa.'
      : 'Aún no hay temas importados para este nivel. Esta es una vista previa de la ruta.';
    wrap.appendChild(lock);
  }

  const boxPl = document.createElement('div');
  boxPl.className = 'stampTextBox';
  boxPl.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">Texto (PL)</div>
    <div class="mutedStrong" style="margin-top:6px;">${landmark.descPl}</div>
  `;
  wrap.appendChild(boxPl);

  if (landmark.descEs) {
    const boxEs = document.createElement('div');
    boxEs.className = 'stampTextBox';
    boxEs.innerHTML = `
      <div class="sectionTitle" style="margin-top:0;">Traducci&oacute;n (ES)</div>
      <div class="mutedStrong" style="margin-top:6px;">${landmark.descEs}</div>
    `;
    wrap.appendChild(boxEs);
  }

  const challenge = document.createElement('div');
  challenge.className = 'stampChallenge';

  const cTitle = document.createElement('div');
  cTitle.className = 'sectionTitle';
  cTitle.style.marginTop = '0';
  cTitle.textContent = 'Mini-misión: escucha y completa';
  challenge.appendChild(cTitle);

  const cPrompt = document.createElement('div');
  cPrompt.className = 'stampChallengePrompt';

  const inputs = [];
  const parts = String(landmark?.challenge?.prompt || '').split('___');
  if (parts.length > 1) {
    parts.forEach((part, idx) => {
      cPrompt.appendChild(document.createTextNode(part));
      if (idx === parts.length - 1) return;
      const inp = document.createElement('input');
      inp.className = 'exerciseInlineInput';
      inp.type = 'text';
      inp.placeholder = '...';
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      inputs.push(inp);
      cPrompt.appendChild(inp);
    });
  } else {
    cPrompt.textContent = String(landmark?.challenge?.prompt || '').trim();
  }
  challenge.appendChild(cPrompt);

  const cActions = document.createElement('div');
  cActions.className = 'exerciseActions';
  cActions.style.marginTop = '10px';

  const btnListen = document.createElement('button');
  btnListen.className = 'ttsIconBtn';
  btnListen.type = 'button';
  btnListen.textContent = '🔊';
  btnListen.title = 'Odsłuchaj (PL)';
  btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
  btnListen.addEventListener('click', () =>
    speakPolish(landmark?.challenge?.tts || landmark.descPl),
  );

  const btnCheck = document.createElement('button');
  btnCheck.className = 'btn-yellow';
  btnCheck.type = 'button';
  btnCheck.textContent = 'Comprobar';

  const cRes = document.createElement('div');
  cRes.className = 'stampChallengeResult';

  btnCheck.addEventListener('click', () => {
    const expected = parseList(landmark?.challenge?.answer || '');
    const exp = expected.map((x) => normalizeText(x));
    const vals = inputs.length ? inputs.map((i) => String(i.value || '').trim()) : [];
    if (!inputs.length) return;
    if (vals.some((v) => !v)) {
      cRes.className = 'stampChallengeResult bad';
      cRes.textContent = 'Completa los espacios.';
      return;
    }

    const ok = vals.every((v) => exp.includes(normalizeText(v)));
    cRes.className = `stampChallengeResult ${ok ? 'ok' : 'bad'}`;
    cRes.textContent = ok ? '¡Perfecto!' : 'Intenta de nuevo.';
  });

  cActions.appendChild(btnListen);
  cActions.appendChild(btnCheck);
  challenge.appendChild(cActions);
  challenge.appendChild(cRes);
  wrap.appendChild(challenge);

  // Optional voice recorder (local only)
  const voice = document.createElement('div');
  voice.className = 'stampChallenge';
  voice.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">Voz: lee y graba</div>
    <div class="muted" style="margin-top:6px;">Graba tu voz leyendo el texto (no se publica).</div>
  `;

  const vActions = document.createElement('div');
  vActions.className = 'exerciseActions';
  vActions.style.marginTop = '10px';

  const vAudio = document.createElement('audio');
  vAudio.controls = true;
  vAudio.className = 'exerciseAudioPreview';
  vAudio.style.display = 'none';

  const vCan = canRecordVoice();
  let vRecording = false;
  let vRecorder = null;
  let vStream = null;
  let vChunks = [];
  let vUrl = '';

  const vBtnListen = document.createElement('button');
  vBtnListen.className = 'ttsIconBtn';
  vBtnListen.type = 'button';
  vBtnListen.textContent = '🔊';
  vBtnListen.title = 'Odsłuchaj (PL)';
  vBtnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
  vBtnListen.addEventListener('click', () => speakPolish(landmark.descPl));

  const vBtnRec = document.createElement('button');
  vBtnRec.className = 'btn-white-outline';
  vBtnRec.type = 'button';
  vBtnRec.textContent = 'Grabar voz';
  vBtnRec.disabled = !vCan;

  const vBtnClear = document.createElement('button');
  vBtnClear.className = 'btn-white-outline';
  vBtnClear.type = 'button';
  vBtnClear.textContent = 'Quitar voz';
  vBtnClear.style.display = 'none';

  const vCleanup = () => {
    try {
      vStream?.getTracks?.()?.forEach((t) => t.stop());
    } catch {}
    vStream = null;
    vRecorder = null;
    vChunks = [];
    vRecording = false;
  };

  const vClear = () => {
    if (vUrl) {
      try {
        URL.revokeObjectURL(vUrl);
      } catch {}
    }
    vUrl = '';
    try {
      vAudio.pause?.();
    } catch {}
    vAudio.removeAttribute('src');
    vAudio.style.display = 'none';
    vBtnClear.style.display = 'none';
  };

  vBtnClear.addEventListener('click', () => vClear());

  vBtnRec.addEventListener('click', async () => {
    if (!vCan) return;
    if (vRecording) {
      try {
        vRecorder?.stop();
      } catch {}
      return;
    }

    try {
      vClear();
      vCleanup();

      vStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      vRecorder = new MediaRecorder(vStream);
      vChunks = [];
      vRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size) vChunks.push(e.data);
      };
      vRecorder.onstop = () => {
        vRecording = false;
        vBtnRec.textContent = 'Grabar voz';

        const blob = new Blob(vChunks, { type: vRecorder?.mimeType || 'audio/webm' });
        vUrl = URL.createObjectURL(blob);
        vAudio.src = vUrl;
        vAudio.style.display = 'block';
        vBtnClear.style.display = '';

        vCleanup();
      };

      vRecorder.start();
      vRecording = true;
      vBtnRec.textContent = 'Detener';
    } catch (e) {
      console.warn('[stamp] record failed', e);
      vCleanup();
    }
  });

  vActions.appendChild(vBtnListen);
  vActions.appendChild(vBtnRec);
  vActions.appendChild(vBtnClear);

  voice.appendChild(vActions);
  voice.appendChild(vAudio);

  if (!vCan) {
    const warn = document.createElement('div');
    warn.className = 'hintSmall';
    warn.style.marginTop = '8px';
    warn.textContent = 'Grabación no disponible en este navegador.';
    voice.appendChild(warn);
  }

  wrap.appendChild(voice);

  stampModalBody.appendChild(wrap);

  const close = () => {
    stampModal.style.display = 'none';
    vClear();
    vCleanup();
  };

  if (stampModalClose) stampModalClose.onclick = close;

  stampModal.addEventListener(
    'click',
    (e) => {
      if (e.target === stampModal) close();
    },
    { once: true },
  );

  stampModal.style.display = 'flex';
}

let CURRENT_UID = null;
let USER_DOC = null;
let LEVEL_FLAGS = null;
let loading = false;

function showLockedLevel(level) {
  const lvl = String(level || '').toUpperCase();
  if (passportHint) passportHint.textContent = `Nivel ${lvl} bloqueado.`;

  if (passportMapHint) passportMapHint.textContent = 'Acceso requerido.';
  if (passportMap) passportMap.style.display = 'none';

  if (passportGrid) {
    passportGrid.innerHTML = `
      <div class="card" style="padding:16px;">
        <div class="sectionTitle" style="margin-top:0;">Acceso requerido</div>
        <div class="muted" style="margin-top:6px; line-height:1.6;">
          Este nivel est&aacute; bloqueado para tu cuenta en este momento.
        </div>
        <div class="metaRow" style="margin-top:14px; flex-wrap:wrap; gap:10px;">
          <a class="btn-yellow" href="services.html?level=${encodeURIComponent(lvl)}" style="text-decoration:none;">Activar acceso</a>
          <a class="btn-white-outline" href="espanel.html" style="text-decoration:none;">Volver</a>
        </div>
      </div>
    `;
  }
}

async function loadForLevel(level) {
  if (loading) return;
  loading = true;
  try {
    if (passportHint) passportHint.textContent = 'Cargando...';
    if (passportGrid) passportGrid.innerHTML = '';

    const lvl = String(level || '').toUpperCase();
    const unlocked = LEVEL_FLAGS?.unlocked || null;
    if (unlocked && !unlocked.has(lvl)) {
      showLockedLevel(lvl);
      return;
    }

    const topics = await loadTopics(level);
    const progress = await loadProgressMap(CURRENT_UID, level);
    const steps = buildSteps({ level, topics, progressMap: progress });
    renderGrid({ level, steps });
    renderMap({ level, steps });
  } finally {
    loading = false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html?next=recompensas.html';
    return;
  }

  CURRENT_UID = user.uid;
  USER_DOC = await getUserDoc(user.uid);

  LEVEL_FLAGS = computeLevelFlags(USER_DOC, user.email);
  const levels = LEVEL_FLAGS?.visibleLevels?.length ? LEVEL_FLAGS.visibleLevels : ALL_LEVELS;

  const preferred =
    PRE_LEVEL && levels.includes(PRE_LEVEL)
      ? PRE_LEVEL
      : (LEVEL_FLAGS?.unlocked?.has?.('A2') ? 'A2' : levels[0] || 'A1');

  fillLevelSelect(levels, preferred, LEVEL_FLAGS?.unlocked || new Set(['A1']));

  passportLevel?.addEventListener('change', () => loadForLevel(passportLevel.value));
  await loadForLevel(passportLevel?.value || preferred);
});
