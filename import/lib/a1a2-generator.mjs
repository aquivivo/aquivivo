import crypto from 'node:crypto';

export const GRAMMAR_SOURCE_URL = 'https://aniakubica.com/czesci-mowy/';
export const GRAMMAR_SOURCE_NAME = 'Ani Kubica - Czesci mowy';
export const PARTS_OF_SPEECH = [
  'rzeczownik',
  'czasownik',
  'przymiotnik',
  'przyslowek',
  'zaimek',
  'liczebnik',
  'przyimek',
  'spojnik',
  'partykula',
  'wykrzyknik',
];

export const STAGE_ORDER = ['recognition', 'controlled', 'production', 'listening', 'mixed'];
const STAGE_RANK = new Map(STAGE_ORDER.map((stage, idx) => [stage, idx + 1]));

const LISTENING_VARIANTS = new Set([
  'dictation_word',
  'dictation_sentence',
  'listen_choose',
  'listen_arrange_tiles',
  'audio_true_false',
  'choose_reply_dialogue',
  'complete_dialogue',
  'dialogue_tiles_reply',
  'reorder_dialogue_lines',
]);

const INPUT_VARIANTS = new Set([
  'type_translation_es_pl',
  'type_translation_pl_es',
  'fill_blank_word_bank',
  'fill_blank_typed',
  'type_missing_word',
  'rewrite_sentence_simple',
  'correct_the_error',
  'simple_grammar_fill_blank',
  'mini_writing',
]);

export const VARIANT_META = {
  multiple_choice_es_pl: { baseType: 'multiple_choice', stage: 'recognition', difficulty: 1 },
  multiple_choice_pl_es: { baseType: 'multiple_choice', stage: 'recognition', difficulty: 1 },
  true_false_translation: { baseType: 'binary_choice', stage: 'recognition', difficulty: 1 },
  sentence_meaning_choice: { baseType: 'multiple_choice', stage: 'recognition', difficulty: 2 },
  pick_correct_sentence: { baseType: 'multiple_choice', stage: 'controlled', difficulty: 2 },
  matching_pairs_es_pl: { baseType: 'matching', stage: 'recognition', difficulty: 1 },
  matching_example_to_word: { baseType: 'matching', stage: 'controlled', difficulty: 2 },
  matching_word_to_example: { baseType: 'matching', stage: 'controlled', difficulty: 2 },
  word_tiles_sentence: { baseType: 'word_tiles', stage: 'controlled', difficulty: 2 },
  reorder_words_sentence: { baseType: 'word_tiles', stage: 'production', difficulty: 3 },
  reorder_dialogue_lines: { baseType: 'word_tiles', stage: 'listening', difficulty: 4 },
  type_translation_es_pl: { baseType: 'translate', stage: 'production', difficulty: 3 },
  type_translation_pl_es: { baseType: 'translate', stage: 'production', difficulty: 3 },
  fill_blank_word_bank: { baseType: 'listen_arrange', stage: 'controlled', difficulty: 2 },
  fill_blank_typed: { baseType: 'fill_blank', stage: 'controlled', difficulty: 2 },
  type_missing_word: { baseType: 'fill_blank', stage: 'production', difficulty: 3 },
  rewrite_sentence_simple: { baseType: 'mini_writing', stage: 'production', difficulty: 3 },
  dictation_word: { baseType: 'dictation', stage: 'listening', difficulty: 4 },
  dictation_sentence: { baseType: 'dictation', stage: 'listening', difficulty: 4 },
  listen_choose: { baseType: 'multiple_choice', stage: 'listening', difficulty: 4 },
  listen_arrange_tiles: { baseType: 'listen_arrange', stage: 'listening', difficulty: 4 },
  audio_true_false: { baseType: 'binary_choice', stage: 'listening', difficulty: 4 },
  choose_reply_dialogue: { baseType: 'scene', stage: 'listening', difficulty: 4 },
  complete_dialogue: { baseType: 'fill_blank', stage: 'listening', difficulty: 4 },
  dialogue_tiles_reply: { baseType: 'word_tiles', stage: 'listening', difficulty: 4 },
  correct_the_error: { baseType: 'find_error', stage: 'production', difficulty: 3 },
  quick_quiz: { baseType: 'multiple_choice', stage: 'mixed', difficulty: 5 },
  boss_mixed_test: { baseType: 'multiple_choice', stage: 'mixed', difficulty: 5 },
  identify_part_of_speech: { baseType: 'multiple_choice', stage: 'recognition', difficulty: 2 },
  highlight_part_of_speech: { baseType: 'multiple_choice', stage: 'controlled', difficulty: 2 },
  part_of_speech_matching: { baseType: 'matching', stage: 'controlled', difficulty: 2 },
  choose_correct_word_class: { baseType: 'multiple_choice', stage: 'controlled', difficulty: 3 },
  simple_grammar_fill_blank: { baseType: 'fill_blank', stage: 'controlled', difficulty: 3 },
  pos_true_false: { baseType: 'binary_choice', stage: 'recognition', difficulty: 2 },
  mini_writing: { baseType: 'mini_writing', stage: 'production', difficulty: 3 },
};

export const REQUIRED_VARIANTS = Object.keys(VARIANT_META);

const POLISH_PREPOSITIONS = new Set(['w', 'na', 'do', 'z', 'od', 'bez', 'pod', 'nad', 'przed', 'za', 'po', 'przy', 'u', 'o', 'dla']);
const POLISH_PRONOUNS = new Set(['ja', 'ty', 'on', 'ona', 'ono', 'my', 'wy', 'oni', 'one', 'to', 'ten', 'ta', 'te']);
const POLISH_CONJUNCTIONS = new Set(['i', 'oraz', 'albo', 'lub', 'ale', 'a', 'poniewaz', 'ze']);
const POLISH_PARTICLES = new Set(['nie', 'czy', 'no', 'by', 'niech']);
const POLISH_INTERJECTIONS = new Set(['ojej', 'hej', 'czesc', 'aha', 'oj']);
const POS_LABEL_ES = {
  rzeczownik: 'sustantivo',
  czasownik: 'verbo',
  przymiotnik: 'adjetivo',
  przyslowek: 'adverbio',
  zaimek: 'pronombre',
  liczebnik: 'numeral',
  przyimek: 'preposicion',
  spojnik: 'conjuncion',
  partykula: 'particula',
  wykrzyknik: 'interjeccion',
};
const LESSON_EXERCISE_TARGET_MIN = 8;
const LESSON_EXERCISE_TARGET_MAX = 12;
const FLASHCARDS_TOPIC_MIN = 20;
const FLASHCARDS_TOPIC_MAX = 40;
const FLASHCARDS_LESSON_TARGET = 24;
const FLASHCARDS_LESSON_MAX = 40;
const LESSON_GRAMMAR_TEMPLATES = [
  { pl: 'To jest {N}.', es: 'Esto es {N}.' },
  { pl: 'Mam {N}.', es: 'Tengo {N}.' },
  { pl: 'Lubię {N}.', es: 'Me gusta {N}.' },
  { pl: 'Widzę {N}.', es: 'Veo {N}.' },
  { pl: 'Jestem w {N}.', es: 'Estoy en {N}.' },
];

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function safeCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function slugify(value) {
  return normalizeText(value || '').replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
}

export function hashKey(...parts) {
  return crypto.createHash('sha1').update(parts.map((x) => String(x || '')).join('||')).digest('hex');
}

function pickField(row, keys) {
  const obj = row || {};
  for (const k of keys) {
    if (k in obj) {
      const v = safeCell(obj[k]);
      if (v) return v;
    }
  }
  const wanted = keys.map((k) => normalizeText(k));
  for (const [key, raw] of Object.entries(obj)) {
    const norm = normalizeText(key);
    if (wanted.some((w) => norm.includes(w))) {
      const v = safeCell(raw);
      if (v) return v;
    }
  }
  return '';
}

export function stripSheetName(name) {
  let s = safeCell(name);
  s = s.replace(/^[^\p{L}\p{N}]+/u, '');
  s = s.replace(/^(a1|a2)\s*[-—:]+/i, '');
  s = s.replace(/^vocabulario\s*(a1|a2)?\s*[-—:]+/i, '');
  s = s.replace(/^temat\s*\d+\s*/i, '');
  return safeCell(s);
}

export function detectLevelFromWorkbookName(fileName = '', sheetNames = []) {
  const base = normalizeText(fileName);
  if (base.includes('a1')) return 'A1';
  if (base.includes('a2')) return 'A2';
  const joined = normalizeText((sheetNames || []).join(' '));
  if (joined.includes('a1')) return 'A1';
  if (joined.includes('a2')) return 'A2';
  return 'A1';
}

export function parseWorkbookSheets(XLSX, workbook, { levelHint = '', fileName = '' } = {}) {
  const names = workbook?.SheetNames || [];
  const level = String(levelHint || detectLevelFromWorkbookName(fileName, names)).toUpperCase();
  const sheets = [];
  for (const sheetName of names) {
    if (normalizeText(sheetName).includes('rodzaje zadan')) continue;
    const ws = workbook?.Sheets?.[sheetName];
    if (!ws) continue;
    const rowsRaw = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const rows = rowsRaw
      .map((row, idx) => {
        const pl = pickField(row, ['Polski', 'PL', 'Polaco']);
        const es = pickField(row, ['Español (LATAM)', 'Español', 'Espanol', 'ES']);
        const exPl = pickField(row, ['Example PL', 'Ejemplo PL', 'Ejemplo de uso (PL)', 'Przyklad (PL)']);
        const exEs = pickField(row, ['Example ES', 'Ejemplo ES', 'Ejemplo de uso (ES)', 'Przyklad (ES)']);
        return { rowNo: idx + 2, pl, es, exPl, exEs, key: hashKey(pl, es, exPl, exEs) };
      })
      .filter((r) => r.pl || r.es || r.exPl || r.exEs);
    sheets.push({
      level,
      name: sheetName,
      strippedName: stripSheetName(sheetName),
      slugHint: slugify(stripSheetName(sheetName)),
      rows,
    });
  }
  return { level, sheets };
}

function topicMatchScore(sheet, topic) {
  const sheetKey = normalizeText(sheet?.strippedName || sheet?.name || '');
  const title = normalizeText(topic?.title || topic?.name || '');
  const slug = normalizeText(topic?.slug || topic?.id || '');
  if (!sheetKey) return 0;
  const tokens = sheetKey.split(' ').filter(Boolean);
  let score = 0;
  const target = `${title} ${slug}`.trim();
  for (const t of tokens) if (target.includes(t)) score += 2;
  if (title && (title.includes(sheetKey) || sheetKey.includes(title))) score += 8;
  if (slug && (slug.includes(sheetKey) || sheetKey.includes(slug))) score += 6;
  return score;
}

export function mapSheetToTopic(sheet, topics = [], level = '') {
  const scoped = (topics || []).filter((t) => {
    if (!level) return true;
    return String(t?.level || '').toUpperCase() === String(level).toUpperCase();
  });
  let best = null;
  let bestScore = 0;
  for (const topic of scoped) {
    const score = topicMatchScore(sheet, topic);
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  if (!best || bestScore < 4) {
    const fallback = sheet.slugHint || slugify(sheet.name || '');
    return {
      topicId: fallback,
      topicSlug: fallback,
      topicTitle: sheet.strippedName || sheet.name || fallback,
      unresolved: true,
      score: bestScore,
    };
  }
  return {
    topicId: String(best.id || best.slug || '').trim(),
    topicSlug: String(best.slug || best.id || '').trim(),
    topicTitle: String(best.title || best.name || best.slug || best.id || '').trim(),
    unresolved: false,
    score: bestScore,
  };
}

export function uniqList(values) {
  return Array.from(new Set((values || []).map((v) => safeCell(v)).filter(Boolean)));
}

export function shuffleDeterministic(values, seed = 1) {
  const arr = Array.isArray(values) ? [...values] : [];
  let state = Math.abs(Number(seed || 1)) % 2147483647;
  if (!state) state = 1;
  const next = () => {
    state = (state * 48271) % 2147483647;
    return state;
  };
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function optionItemsFromTexts(texts = [], correctText = '') {
  const uniq = uniqList(texts);
  const wanted = uniq.includes(correctText) ? uniq : [correctText, ...uniq.filter((t) => t !== correctText)];
  const options = wanted.slice(0, 4).map((text, idx) => ({ id: String.fromCharCode(97 + idx), text }));
  if (!options.some((opt) => opt.text === correctText)) options[0] = { id: 'a', text: correctText };
  const shuffled = shuffleDeterministic(options, hashKey(correctText, options.length).slice(0, 8));
  const correct = shuffled.find((opt) => opt.text === correctText) || shuffled[0];
  return { options: shuffled, correctOptionId: String(correct.id || 'a') };
}

export function tokenizeSentence(sentence) {
  return safeCell(sentence)
    .replace(/([.,!?;:()])/g, ' $1 ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function ensureSentence(value, fallback = '') {
  const text = safeCell(value || fallback);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function blankSentenceForWord(sentence, word) {
  const text = safeCell(sentence);
  const target = safeCell(word);
  if (!text || !target) return '';
  const re = new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (re.test(text)) return text.replace(re, '___');
  const tokens = tokenizeSentence(text);
  if (!tokens.length) return '';
  const idx = Math.floor(tokens.length / 2);
  const clone = [...tokens];
  clone[idx] = '___';
  return clone.join(' ').replace(/\s+([.,!?;:])/g, '$1');
}

function classifyTemplateCategory(topicSlug, word) {
  const slug = normalizeText(topicSlug || '');
  const token = safeCell(word || '');
  if (!token) return 'N';

  if (
    slug.includes('kraje') ||
    slug.includes('panstwa') ||
    slug.includes('paises') ||
    slug.includes('paises') ||
    slug.includes('nacionalidades') ||
    slug.includes('narodowosci')
  ) {
    return 'PLACE';
  }

  if (
    slug.includes('opis') ||
    slug.includes('descripcion') ||
    slug.includes('descripci') ||
    slug.includes('adjetiv')
  ) {
    return 'ADJ';
  }

  if (token.includes(' ')) return 'PHRASE';
  if (/(y|a|e)$/i.test(token) && token.length > 3) return 'ADJ';
  return 'N';
}

function applySentenceTemplate(template, valuePl, valueEs) {
  return {
    pl: ensureSentence(String(template?.pl || '').replace(/\{N\}|\{ADJ\}/g, valuePl)),
    es: ensureSentence(String(template?.es || '').replace(/\{N\}|\{ADJ\}/g, valueEs)),
  };
}

function templatePoolForCategory(level, category) {
  const base = [
    { pl: 'To jest {N}.', es: 'Esto es {N}.' },
    { pl: 'Mam {N}.', es: 'Tengo {N}.' },
    { pl: 'Lubie {N}.', es: 'Me gusta {N}.' },
    { pl: 'Widze {N}.', es: 'Veo {N}.' },
  ];

  if (category === 'ADJ') {
    return [{ pl: 'To {ADJ}.', es: 'Esto es {ADJ}.' }];
  }
  if (category === 'PLACE') {
    return [
      { pl: 'Jestem z {N}.', es: 'Soy de {N}.' },
      { pl: 'Ide do {N}.', es: 'Voy a {N}.' },
    ];
  }

  // A2 can still use A1-safe frames when no verb forms are available.
  if (String(level || '').toUpperCase() === 'A2') {
    return [...base, { pl: 'Dzisiaj mam {N}.', es: 'Hoy tengo {N}.' }];
  }
  return base;
}

function spellingPromptForWord(word) {
  const text = safeCell(word);
  if (!text) return '';
  const chars = Array.from(text);
  const out = chars.map((ch, idx) => {
    if (!/[A-Za-z\u00C0-\u017F]/.test(ch)) return ch;
    return idx % 2 === 0 ? ch : '_';
  });
  return out.join('');
}

function sentenceBundleForRow({
  level,
  topicSlug,
  targetPl,
  targetEs,
  examplePl,
  exampleEs,
  seed = 0,
}) {
  const pl = safeCell(targetPl);
  const es = safeCell(targetEs);
  const exPl = ensureSentence(examplePl);
  const exEs = ensureSentence(exampleEs);

  if (exPl && exEs) {
    return {
      audioSentencePl: exPl,
      translationEs: exEs,
      blankPrompt: blankSentenceForWord(exPl, pl) || blankSentenceForWord(exPl, tokenizeSentence(exPl)[0]),
      spellingPrompt: spellingPromptForWord(pl),
      target: { pl, es },
    };
  }

  const category = classifyTemplateCategory(topicSlug, pl);
  const pool = templatePoolForCategory(level, category);
  const selected = pool[Math.abs(Number(seed || 0)) % Math.max(1, pool.length)];
  const applied = applySentenceTemplate(selected, pl || 'to', es || 'esto');
  const blankPrompt =
    blankSentenceForWord(applied.pl, pl) ||
    blankSentenceForWord(applied.pl, tokenizeSentence(applied.pl)[0]) ||
    '___';

  return {
    audioSentencePl: applied.pl,
    translationEs: applied.es,
    blankPrompt,
    spellingPrompt: spellingPromptForWord(pl),
    target: { pl, es },
  };
}

function instructionEsForVariant(variant) {
  const key = String(variant || '').trim().toLowerCase();
  if (
    key.includes('matching')
  ) {
    return 'Empareja las parejas.';
  }
  if (
    key.includes('word_tiles') ||
    key.includes('reorder') ||
    key.includes('dialogue_tiles')
  ) {
    return 'Ordena las palabras.';
  }
  if (
    key.includes('dictation')
  ) {
    return 'Escucha y escribe.';
  }
  if (key.includes('spelling')) {
    return 'Completa la palabra.';
  }
  if (
    key.includes('fill') ||
    key.includes('missing_word') ||
    key.includes('complete_dialogue') ||
    key.includes('type_translation') ||
    key.includes('rewrite') ||
    key.includes('mini_writing') ||
    key.includes('correct_the_error')
  ) {
    return 'Completa la frase.';
  }
  if (key.includes('multiple_choice') || key.includes('listen_choose') || key.includes('true_false')) {
    return 'Elige la opcion correcta.';
  }
  return 'Elige la opcion correcta.';
}

function inferPartOfSpeech(word) {
  const token = normalizeText(word).split(' ')[0] || '';
  if (!token) return 'rzeczownik';
  if (POLISH_PREPOSITIONS.has(token)) return 'przyimek';
  if (POLISH_PRONOUNS.has(token)) return 'zaimek';
  if (POLISH_CONJUNCTIONS.has(token)) return 'spojnik';
  if (POLISH_PARTICLES.has(token)) return 'partykula';
  if (POLISH_INTERJECTIONS.has(token)) return 'wykrzyknik';
  if (/^\d+$/.test(token)) return 'liczebnik';
  if (token.endsWith('ć')) return 'czasownik';
  if (/(y|i|a|e)$/.test(token) && token.length > 3) return 'przymiotnik';
  if (/(o|ie)$/.test(token) && token.length > 3) return 'przyslowek';
  return 'rzeczownik';
}

function partOfSpeechLabelEs(pos) {
  return POS_LABEL_ES[pos] || 'sustantivo';
}

function rowsWithVocabulary(rows = []) {
  return (rows || []).filter((row) => safeCell(row?.pl) && safeCell(row?.es));
}

function pickRowsForLesson(rows = [], lessonIndex = 0, wanted = FLASHCARDS_LESSON_TARGET) {
  const base = rowsWithVocabulary(rows);
  if (!base.length) return [];
  const count = Math.max(
    FLASHCARDS_TOPIC_MIN,
    Math.min(FLASHCARDS_LESSON_MAX, Number(wanted || FLASHCARDS_LESSON_TARGET)),
  );
  const shuffled = shuffleDeterministic(base, hashKey('lesson_rows', lessonIndex, base.length));
  const out = [];
  let cursor = 0;
  while (out.length < count && cursor < count * 3) {
    const row = shuffled[cursor % shuffled.length];
    if (row) out.push(row);
    cursor += 1;
    if (cursor > shuffled.length && shuffled.length >= count) break;
  }
  return out;
}

function lessonGrammarFocus(rows = [], lessonIndex = 0) {
  const vocabRows = rowsWithVocabulary(rows);
  if (!vocabRows.length) {
    return { pos: 'rzeczownik', posEs: partOfSpeechLabelEs('rzeczownik'), sample: '', sampleEs: '' };
  }
  const data = vocabRows.map((row) => {
    const word = safeCell(row.pl);
    return {
      word,
      es: safeCell(row.es),
      pos: inferPartOfSpeech(word),
    };
  });
  const byPos = {};
  data.forEach((item) => {
    byPos[item.pos] = Number(byPos[item.pos] || 0) + 1;
  });
  const rankedPos = Object.entries(byPos)
    .sort((a, b) => b[1] - a[1])
    .map(([pos]) => pos);
  const pos = rankedPos[lessonIndex % Math.max(1, rankedPos.length)] || rankedPos[0] || 'rzeczownik';
  const sample = data.find((x) => x.pos === pos) || data[0] || { word: '', es: '' };
  return { pos, posEs: partOfSpeechLabelEs(pos), sample: sample.word, sampleEs: sample.es };
}

function lessonGrammarTemplateSentence(rows = [], lessonIndex = 0) {
  const vocabRows = rowsWithVocabulary(rows);
  const row = vocabRows[lessonIndex % Math.max(1, vocabRows.length)] || {};
  const wordPl = safeCell(row.pl) || 'to';
  const wordEs = safeCell(row.es) || 'esto';
  const tpl = LESSON_GRAMMAR_TEMPLATES[lessonIndex % LESSON_GRAMMAR_TEMPLATES.length] || LESSON_GRAMMAR_TEMPLATES[0];
  return {
    pl: ensureSentence(String(tpl.pl || '').replace(/\{N\}/g, wordPl)),
    es: ensureSentence(String(tpl.es || '').replace(/\{N\}/g, wordEs)),
  };
}

function buildLessonBlocks({ topic, lessonIndex = 0, rows = [], grammarSourceUrl = GRAMMAR_SOURCE_URL }) {
  const focus = lessonGrammarFocus(rows, lessonIndex);
  const template = lessonGrammarTemplateSentence(rows, lessonIndex);
  const title = String(topic?.topicTitle || topic?.topicSlug || 'Tema').trim();
  const shortGrammar = `Gramatica breve: partes de la oracion (${focus.posEs} / ${focus.pos}).`;
  const usage = focus.sample
    ? `Palabra clave: ${focus.sample}${focus.sampleEs ? ` - ${focus.sampleEs}` : ''}.`
    : 'Palabra clave del tema en contexto simple.';

  return [
    { kind: 'heading', level: 'h3', text: `Leccion ${lessonIndex + 1}: ${title}` },
    { kind: 'paragraph', text: shortGrammar },
    { kind: 'paragraph', text: usage },
    { kind: 'tip', title: 'Ejemplo PL', text: template.pl },
    { kind: 'tip', title: 'Traduccion ES', text: template.es },
    { kind: 'paragraph', text: `Fuente: ${grammarSourceUrl}` },
  ];
}

function cardLineFromRow(level, topicSlug, row, seed = 0) {
  const pl = safeCell(row?.pl);
  const es = safeCell(row?.es);
  if (!pl || !es) return '';
  const sentence = sentenceBundleForRow({
    level,
    topicSlug,
    targetPl: pl,
    targetEs: es,
    examplePl: row?.exPl,
    exampleEs: row?.exEs,
    seed,
  });
  const exPl = safeCell(sentence.audioSentencePl || row?.exPl);
  const exEs = safeCell(sentence.translationEs || row?.exEs);
  const parts = [pl, es];
  if (exPl) parts.push(`exPL:${exPl}`);
  if (exEs) parts.push(`exES:${exEs}`);
  return parts.join(' | ');
}

function buildFlashcardExercise({
  id,
  level,
  topic,
  lessonId = '',
  lessonIndex = 0,
  rows = [],
  cardCount = FLASHCARDS_LESSON_TARGET,
  seedSource = 'a1_a2_excel_grammar',
  seedVersion = 'v1',
}) {
  const lessonRows = pickRowsForLesson(rows, lessonIndex, cardCount);
  const options = lessonRows
    .map((row, idx) => cardLineFromRow(level, topic.topicSlug, row, lessonIndex * 100 + idx))
    .filter(Boolean);
  const uniqueOptions = uniqList(options).slice(
    0,
    Math.max(FLASHCARDS_TOPIC_MIN, Math.min(FLASHCARDS_LESSON_MAX, cardCount)),
  );
  const sourceRow = lessonRows[0] || rowsWithVocabulary(rows)[0] || {};
  return {
    id,
    level,
    topicId: topic.topicId,
    topicSlug: topic.topicSlug,
    type: 'tarjeta_vocabulario',
    baseType: 'tarjeta',
    prompt: lessonId ? 'Fichas de la leccion' : 'Fichas del tema',
    options: uniqueOptions,
    answer: '',
    audio: '',
    ui: { variant: 'standard' },
    difficulty: 1,
    stage: 'recognition',
    sourceWord: safeCell(sourceRow.pl),
    sourceExample: safeCell(sourceRow.exPl),
    notes: lessonId
      ? `deck:lesson|lessonId:${lessonId}|cards:${uniqueOptions.length}`
      : `deck:topic|cards:${uniqueOptions.length}`,
    tags: uniqList([
      'variant:tarjeta_vocabulario',
      'deck:flashcards',
      lessonId ? `lesson:${lessonId}` : 'scope:topic',
    ]),
    lessonId: lessonId || '',
    lessonIds: lessonId ? [lessonId] : [],
    cardCount: uniqueOptions.length,
    category: 'flashcards',
    grammarSource: GRAMMAR_SOURCE_URL,
    seedSource,
    seedVersion,
  };
}

function makeExerciseBase({
  level,
  topicId,
  topicSlug,
  variant,
  prompt,
  options = [],
  answer = '',
  sourceWord = '',
  sourceTranslation = '',
  sourceExample = '',
  sourceExampleEs = '',
  notes = '',
  tags = [],
  audio = '',
  instruction = null,
  target = null,
  audioSentencePl = '',
  translationEs = '',
  seedIndex = 0,
  ...rest
}) {
  const meta = VARIANT_META[variant] || { baseType: 'multiple_choice', stage: 'recognition', difficulty: 1 };
  const bundle = sentenceBundleForRow({
    level,
    topicSlug,
    targetPl: target?.pl || sourceWord,
    targetEs: target?.es || sourceTranslation,
    examplePl: sourceExample,
    exampleEs: sourceExampleEs,
    seed: seedIndex,
  });
  const instructionEs = safeCell(instruction?.es || instruction || instructionEsForVariant(variant));
  const promptText = safeCell(prompt || bundle.blankPrompt || bundle.audioSentencePl || sourceWord);
  return {
    level,
    topicId,
    topicSlug,
    type: variant,
    baseType: meta.baseType,
    instruction: instructionEs,
    instructionEs,
    prompt: promptText,
    audioSentencePl: safeCell(audioSentencePl || bundle.audioSentencePl || sourceExample),
    translationEs: safeCell(translationEs || bundle.translationEs || sourceExampleEs),
    target: {
      pl: safeCell(target?.pl || bundle.target?.pl || sourceWord),
      es: safeCell(target?.es || bundle.target?.es || sourceTranslation),
    },
    options,
    answer,
    audio: safeCell(audio),
    ui: { variant: 'standard' },
    difficulty: meta.difficulty,
    stage: meta.stage,
    sourceWord: safeCell(sourceWord),
    sourceTranslation: safeCell(sourceTranslation),
    sourceExample: safeCell(sourceExample),
    sourceExampleEs: safeCell(sourceExampleEs),
    notes: safeCell(notes),
    tags: uniqList([`variant:${variant}`, `stage:${meta.stage}`, `difficulty:${meta.difficulty}`, ...tags]),
    ...rest,
  };
}

function buildWordBasedCandidates(ctx, row, index) {
  const out = [];
  const plPool = ctx.rows.map((x) => x.pl).filter(Boolean);
  const esPool = ctx.rows.map((x) => x.es).filter(Boolean);
  if (!row.pl || !row.es) return out;
  const rowMeta = {
    sourceWord: row.pl,
    sourceTranslation: row.es,
    sourceExample: row.exPl,
    sourceExampleEs: row.exEs,
    seedIndex: index,
  };
  const sentence = sentenceBundleForRow({
    level: ctx.level,
    topicSlug: ctx.topic.topicSlug,
    targetPl: row.pl,
    targetEs: row.es,
    examplePl: row.exPl,
    exampleEs: row.exEs,
    seed: index,
  });

  const mcqEsPl = optionItemsFromTexts(shuffleDeterministic(plPool, index + 11), row.pl);
  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'multiple_choice_es_pl',
      prompt: `Jak po polsku: "${row.es}"?`,
      options: mcqEsPl.options,
      answer: { correctOptionId: mcqEsPl.correctOptionId },
    }),
  );

  const mcqPlEs = optionItemsFromTexts(shuffleDeterministic(esPool, index + 19), row.es);
  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'multiple_choice_pl_es',
      prompt: `Jak po hiszpansku: "${row.pl}"?`,
      options: mcqPlEs.options,
      answer: { correctOptionId: mcqPlEs.correctOptionId },
    }),
  );

  const wrongEs = shuffleDeterministic(esPool.filter((t) => t !== row.es), index + 23)[0] || row.es;
  const falseCase = index % 2 === 1;
  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'true_false_translation',
      prompt: `"${row.pl}" = "${falseCase ? wrongEs : row.es}" ?`,
      options: [
        { id: 'a', text: 'Prawda' },
        { id: 'b', text: 'Falsz' },
      ],
      answer: { correctOptionId: falseCase ? 'b' : 'a' },
    }),
  );

  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'type_translation_es_pl',
      prompt: `Wpisz po polsku: "${row.es}".`,
      answer: { accepted: uniqList([row.pl]) },
    }),
  );

  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'type_translation_pl_es',
      prompt: `Wpisz po hiszpansku: "${row.pl}".`,
      answer: { accepted: uniqList([row.es]) },
    }),
  );

  if (row.exPl && row.exEs) {
    const sentenceOpt = optionItemsFromTexts(
      shuffleDeterministic(ctx.rows.map((x) => ensureSentence(x.exEs)).filter(Boolean), index + 31),
      ensureSentence(row.exEs),
    );
    out.push(
      makeExerciseBase({
        ...rowMeta,
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'sentence_meaning_choice',
        prompt: `Znaczenie zdania: "${ensureSentence(row.exPl)}"`,
        options: sentenceOpt.options,
        answer: { correctOptionId: sentenceOpt.correctOptionId },
        sourceExample: ensureSentence(row.exPl),
        sourceExampleEs: ensureSentence(row.exEs),
      }),
    );
  }

  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'dictation_word',
      prompt: sentence.audioSentencePl || 'Zapisz slowo, ktore slyszysz.',
      answer: { accepted: uniqList([row.pl]), typoTolerance: 1 },
      audio: sentence.audioSentencePl || row.pl,
    }),
  );

  const listenOpt = optionItemsFromTexts(shuffleDeterministic(plPool, index + 41), row.pl);
  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'listen_choose',
      prompt: 'Posluchaj i wybierz poprawne slowo.',
      options: listenOpt.options,
      answer: { correctOptionId: listenOpt.correctOptionId },
      audio: sentence.audioSentencePl || row.pl,
    }),
  );

  const falseWord = shuffleDeterministic(plPool.filter((t) => t !== row.pl), index + 47)[0] || row.pl;
  const tfFalse = index % 3 === 0;
  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'audio_true_false',
      prompt: tfFalse ? `Czy slyszysz: "${falseWord}"?` : `Czy slyszysz: "${row.pl}"?`,
      options: [
        { id: 'a', text: 'Prawda' },
        { id: 'b', text: 'Falsz' },
      ],
      answer: { correctOptionId: tfFalse ? 'b' : 'a' },
      audio: sentence.audioSentencePl || row.pl,
    }),
  );

  return out;
}

function buildExampleCandidates(ctx, row, index) {
  const out = [];
  if (!row.exPl) return out;
  const exPl = ensureSentence(row.exPl, row.pl);
  const exEs = ensureSentence(row.exEs, row.es);
  const tokens = tokenizeSentence(exPl).filter((t) => /[\p{L}\p{N}]/u.test(t));
  if (tokens.length < 2) return out;
  const rowMeta = {
    sourceWord: row.pl,
    sourceTranslation: row.es,
    sourceExample: exPl,
    sourceExampleEs: exEs,
    seedIndex: index,
  };

  const pickSentence = optionItemsFromTexts(
    shuffleDeterministic(ctx.rows.map((x) => ensureSentence(x.exPl)).filter(Boolean), index + 53),
    exPl,
  );
  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'pick_correct_sentence',
      prompt: `Wybierz poprawne zdanie dla: "${exEs || row.es}"`,
      options: pickSentence.options,
      answer: { correctOptionId: pickSentence.correctOptionId },
    }),
  );

  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'word_tiles_sentence',
      prompt: 'Uloz zdanie z kafelkow.',
      options: tokens,
      answer: { accepted: [exPl] },
    }),
  );

  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'reorder_words_sentence',
      prompt: 'Uloz zdanie we wlasciwej kolejnosci.',
      options: shuffleDeterministic(tokens, index + 59),
      answer: { accepted: [exPl] },
    }),
  );

  const blank = blankSentenceForWord(exPl, row.pl) || blankSentenceForWord(exPl, tokens[0]);
  if (blank.includes('___')) {
    const bank = uniqList([row.pl, ...shuffleDeterministic(ctx.rows.map((x) => x.pl).filter(Boolean), index + 61)]).slice(0, 6);
    out.push(
      makeExerciseBase({
        ...rowMeta,
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'fill_blank_word_bank',
        prompt: `Uzupelnij z banku: ${blank}`,
        options: bank,
        answer: { acceptedByBlank: [[row.pl]] },
        audio: exPl,
      }),
    );
    out.push(
      makeExerciseBase({
        ...rowMeta,
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'fill_blank_typed',
        prompt: blank,
        answer: { acceptedByBlank: [[row.pl]] },
      }),
    );
    out.push(
      makeExerciseBase({
        ...rowMeta,
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'type_missing_word',
        prompt: `${blank} (jedno slowo)`,
        answer: { acceptedByBlank: [[row.pl]] },
      }),
    );
  }

  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'dictation_sentence',
      prompt: 'Posluchaj i zapisz zdanie.',
      answer: { accepted: [exPl], typoTolerance: 1 },
      audio: exPl,
    }),
  );

  if (tokens.length >= 3) {
    out.push(
      makeExerciseBase({
        ...rowMeta,
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'listen_arrange_tiles',
        prompt: Array.from({ length: tokens.length }, () => '___').join(' '),
        options: shuffleDeterministic(tokens, index + 67),
        answer: { acceptedByBlank: tokens.map((token) => [token]) },
        audio: exPl,
      }),
    );
  }

  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'rewrite_sentence_simple',
      prompt: `Napisz podobne zdanie: "${exPl}"`,
      answer: '',
    }),
  );

  const bad = exPl.replace(row.pl, `${row.pl} ${row.pl}`);
  const fixOpt = optionItemsFromTexts([exPl, bad], exPl);
  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'correct_the_error',
      prompt: bad,
      options: fixOpt.options,
      answer: { correctOptionId: fixOpt.correctOptionId },
    }),
  );

  const reply = ensureSentence(row.exEs || row.es || row.pl);
  const dlgOpt = optionItemsFromTexts(
    [reply, shuffleDeterministic(ctx.rows.map((x) => ensureSentence(x.exEs || x.es || x.pl)).filter(Boolean), index + 71)[0] || reply],
    reply,
  );
  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'choose_reply_dialogue',
      prompt: `A: ${exPl}\nB: ...`,
      options: dlgOpt.options,
      answer: { correctOptionId: dlgOpt.correctOptionId },
    }),
  );

  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'complete_dialogue',
      prompt: `A: ${exPl}\nB: ___`,
      answer: { acceptedByBlank: [[reply]] },
      target: { pl: reply, es: row.es },
    }),
  );

  const replyTokens = tokenizeSentence(reply).filter((t) => /[\p{L}\p{N}]/u.test(t));
  if (replyTokens.length >= 2) {
    out.push(
      makeExerciseBase({
        ...rowMeta,
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'dialogue_tiles_reply',
        prompt: 'Uloz odpowiedz w dialogu.',
        options: shuffleDeterministic(replyTokens, index + 73),
        answer: { accepted: [replyTokens.join(' ')] },
        target: { pl: replyTokens.join(' '), es: row.es },
      }),
    );
  }

  const lines = [`A: ${reply}`, `B: ${exPl}`, `A: ${reply}`];
  out.push(
    makeExerciseBase({
      ...rowMeta,
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'reorder_dialogue_lines',
      prompt: 'Uloz linie dialogu.',
      options: shuffleDeterministic(lines, index + 79),
      answer: { accepted: [lines.join(' ')] },
      target: { pl: lines.join(' '), es: row.es },
    }),
  );

  return out;
}

function buildMatchingCandidates(ctx) {
  const out = [];
  const rows = ctx.rows.filter((r) => r.pl && r.es);
  for (let i = 0; i < rows.length; i += 8) {
    const slice = rows.slice(i, i + 8);
    if (slice.length < 3) continue;
    const first = slice[0] || {};
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'matching_pairs_es_pl',
        prompt: 'Dopasuj polski do hiszpanskiego.',
        pairs: slice.map((r) => ({ left: r.pl, right: r.es })),
        sourceWord: first.pl || '',
        sourceTranslation: first.es || '',
        sourceExample: first.exPl || '',
        sourceExampleEs: first.exEs || '',
        seedIndex: i,
      }),
    );
  }
  const exRows = ctx.rows.filter((r) => r.exPl && r.pl);
  for (let i = 0; i < exRows.length; i += 6) {
    const slice = exRows.slice(i, i + 6);
    if (slice.length < 3) continue;
    const first = slice[0] || {};
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'matching_example_to_word',
        prompt: 'Dopasuj zdanie do slowa.',
        pairs: slice.map((r) => ({ left: ensureSentence(r.exPl), right: r.pl })),
        sourceWord: first.pl || '',
        sourceTranslation: first.es || '',
        sourceExample: first.exPl || '',
        sourceExampleEs: first.exEs || '',
        seedIndex: i + 1,
      }),
    );
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'matching_word_to_example',
        prompt: 'Dopasuj slowo do zdania.',
        pairs: slice.map((r) => ({ left: r.pl, right: ensureSentence(r.exPl) })),
        sourceWord: first.pl || '',
        sourceTranslation: first.es || '',
        sourceExample: first.exPl || '',
        sourceExampleEs: first.exEs || '',
        seedIndex: i + 2,
      }),
    );
  }
  return out;
}

function buildGrammarCandidates(ctx) {
  const out = [];
  const translationByWord = new Map();
  (ctx.rows || []).forEach((r) => {
    const pl = safeCell(r?.pl);
    const es = safeCell(r?.es);
    if (!pl || !es) return;
    pl.split(/\s+/).forEach((token) => {
      if (!translationByWord.has(token)) translationByWord.set(token, es);
    });
  });
  const words = uniqList(
    ctx.rows
      .map((r) => r.pl)
      .filter(Boolean)
      .flatMap((w) => safeCell(w).split(/\s+/)),
  ).slice(0, 60);
  const posData = words.map((w) => ({ word: w, pos: inferPartOfSpeech(w) }));
  if (!posData.length) return out;

  posData.forEach((item, idx) => {
    const distractors = shuffleDeterministic(PARTS_OF_SPEECH.filter((p) => p !== item.pos), idx + 101).slice(0, 3);
    const opt = optionItemsFromTexts([item.pos, ...distractors], item.pos);
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'identify_part_of_speech',
        prompt: `Jaka to czesc mowy: "${item.word}"?`,
        options: opt.options,
        answer: { correctOptionId: opt.correctOptionId },
        sourceWord: item.word,
        sourceTranslation: translationByWord.get(item.word) || '',
        seedIndex: idx,
      }),
    );

    const wrongPos = shuffleDeterministic(PARTS_OF_SPEECH.filter((p) => p !== item.pos), idx + 103)[0] || item.pos;
    const falseCase = idx % 2 === 0;
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'pos_true_false',
        prompt: `Czy "${item.word}" to ${falseCase ? wrongPos : item.pos}?`,
        options: [
          { id: 'a', text: 'Prawda' },
          { id: 'b', text: 'Falsz' },
        ],
        answer: { correctOptionId: falseCase ? 'b' : 'a' },
        sourceWord: item.word,
        sourceTranslation: translationByWord.get(item.word) || '',
        seedIndex: idx + 1,
      }),
    );
  });

  for (let i = 0; i < posData.length; i += 6) {
    const slice = posData.slice(i, i + 6);
    if (slice.length < 3) continue;
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'part_of_speech_matching',
        prompt: 'Dopasuj slowo do czesci mowy.',
        pairs: slice.map((x) => ({ left: x.word, right: x.pos })),
        sourceWord: slice[0]?.word || '',
        sourceTranslation: translationByWord.get(slice[0]?.word || '') || '',
        seedIndex: i + 2,
      }),
    );
  }

  posData.slice(0, 20).forEach((item, idx) => {
    const sentence = `${['To jest', 'Mam', 'Lubie', 'Ide do', 'Jestem w'][idx % 5]} ${item.word}.`;
    const sameClass = shuffleDeterministic(
      posData.filter((x) => x.pos === item.pos && x.word !== item.word).map((x) => x.word),
      idx + 127,
    )[0] || item.word;
    const distract = shuffleDeterministic(
      posData.filter((x) => x.pos !== item.pos).map((x) => x.word),
      idx + 131,
    ).slice(0, 2);
    const opt = optionItemsFromTexts([sameClass, ...distract], sameClass);
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'highlight_part_of_speech',
        prompt: `Wybierz ${item.pos} w zdaniu: "${sentence}"`,
        options: opt.options,
        answer: { correctOptionId: opt.correctOptionId },
        sourceWord: item.word,
        sourceExample: sentence,
        sourceTranslation: translationByWord.get(item.word) || '',
        seedIndex: idx + 3,
      }),
    );
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'choose_correct_word_class',
        prompt: `Wybierz slowo tej samej klasy (${item.pos}): "${sentence}"`,
        options: opt.options,
        answer: { correctOptionId: opt.correctOptionId },
        sourceWord: item.word,
        sourceExample: sentence,
        sourceTranslation: translationByWord.get(item.word) || '',
        seedIndex: idx + 4,
      }),
    );
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'simple_grammar_fill_blank',
        prompt: `${sentence.replace(item.word, '___')} (${item.pos})`,
        options: uniqList([item.word, sameClass, ...distract]).slice(0, 4),
        answer: { acceptedByBlank: [[item.word]] },
        sourceWord: item.word,
        sourceExample: sentence,
        sourceTranslation: translationByWord.get(item.word) || '',
        seedIndex: idx + 5,
      }),
    );
  });

  return out;
}

function buildMixedTestCandidates(ctx) {
  const out = [];
  const rows = ctx.rows.filter((r) => r.pl && r.es).slice(0, 28);
  rows.forEach((row, idx) => {
    const pool = ctx.rows.map((x) => x.pl).filter(Boolean);
    const quick = optionItemsFromTexts(shuffleDeterministic(pool, idx + 157), row.pl);
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'quick_quiz',
        prompt: `Quick quiz: "${row.es}"`,
        options: quick.options,
        answer: { correctOptionId: quick.correctOptionId },
        sourceWord: row.pl,
        sourceTranslation: row.es,
        sourceExample: row.exPl,
        sourceExampleEs: row.exEs,
        seedIndex: idx,
      }),
    );
    const boss = optionItemsFromTexts(shuffleDeterministic(pool, idx + 163), row.pl);
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'boss_mixed_test',
        prompt: `Boss: jak po polsku "${row.es}"?`,
        options: boss.options,
        answer: { correctOptionId: boss.correctOptionId },
        sourceWord: row.pl,
        sourceTranslation: row.es,
        sourceExample: row.exPl,
        sourceExampleEs: row.exEs,
        seedIndex: idx + 1,
      }),
    );
  });
  return out;
}

function promptAnswerKey(ex) {
  const ans = typeof ex.answer === 'string' ? ex.answer : JSON.stringify(ex.answer || '');
  return hashKey(normalizeText(ex.prompt), normalizeText(ans));
}

function sortCandidates(list) {
  return [...list].sort((a, b) => {
    const stage = (STAGE_RANK.get(a.stage) || 99) - (STAGE_RANK.get(b.stage) || 99);
    if (stage) return stage;
    const diff = Number(a.difficulty || 9) - Number(b.difficulty || 9);
    if (diff) return diff;
    return String(a.type || '').localeCompare(String(b.type || ''));
  });
}

function interleaveByType(list) {
  const items = Array.isArray(list) ? list : [];
  if (items.length <= 2) return [...items];

  const byType = new Map();
  const typeOrder = [];
  items.forEach((item) => {
    const type = String(item?.type || '').trim() || '__unknown__';
    if (!byType.has(type)) {
      byType.set(type, []);
      typeOrder.push(type);
    }
    byType.get(type).push(item);
  });

  const out = [];
  let lastType = '';
  let cursor = 0;
  let safety = items.length * Math.max(2, typeOrder.length);

  while (out.length < items.length && safety > 0) {
    safety -= 1;
    let pickedType = '';

    for (let step = 0; step < typeOrder.length; step += 1) {
      const idx = (cursor + step) % typeOrder.length;
      const t = typeOrder[idx];
      const arr = byType.get(t) || [];
      if (!arr.length) continue;
      if (t === lastType) continue;
      pickedType = t;
      cursor = (idx + 1) % typeOrder.length;
      break;
    }

    if (!pickedType) {
      for (let step = 0; step < typeOrder.length; step += 1) {
        const idx = (cursor + step) % typeOrder.length;
        const t = typeOrder[idx];
        const arr = byType.get(t) || [];
        if (!arr.length) continue;
        pickedType = t;
        cursor = (idx + 1) % typeOrder.length;
        break;
      }
    }

    if (!pickedType) break;
    const next = (byType.get(pickedType) || []).shift();
    if (!next) continue;
    out.push(next);
    lastType = pickedType;
  }

  if (out.length < items.length) {
    typeOrder.forEach((t) => {
      const arr = byType.get(t) || [];
      while (arr.length) out.push(arr.shift());
    });
  }
  return out;
}

function applySelectionConstraints(candidates, targetCount = 120) {
  const unique = [];
  const seen = new Set();
  for (const c of sortCandidates(candidates)) {
    const key = promptAnswerKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  const byVariant = new Map();
  unique.forEach((c) => {
    const arr = byVariant.get(c.type) || [];
    arr.push(c);
    byVariant.set(c.type, arr);
  });

  const selected = [];
  const selectedKeys = new Set();
  const typeCount = {};
  const wordCount = {};
  const exCount = {};
  const maxType = Math.max(1, Math.ceil(targetCount * 0.2));

  const canAdd = (c, strictType = true) => {
    const key = promptAnswerKey(c);
    if (selectedKeys.has(key)) return false;
    if (strictType && Number(typeCount[c.type] || 0) >= maxType) return false;
    const sw = safeCell(c.sourceWord);
    const se = safeCell(c.sourceExample);
    if (sw && Number(wordCount[sw] || 0) >= 4) return false;
    if (se && Number(exCount[se] || 0) >= 3) return false;
    return true;
  };

  const add = (c) => {
    selected.push(c);
    selectedKeys.add(promptAnswerKey(c));
    typeCount[c.type] = Number(typeCount[c.type] || 0) + 1;
    const sw = safeCell(c.sourceWord);
    const se = safeCell(c.sourceExample);
    if (sw) wordCount[sw] = Number(wordCount[sw] || 0) + 1;
    if (se) exCount[se] = Number(exCount[se] || 0) + 1;
  };

  for (const variant of REQUIRED_VARIANTS) {
    const first = (byVariant.get(variant) || []).find((c) => canAdd(c, false));
    if (first) add(first);
  }

  const queue = REQUIRED_VARIANTS.filter((v) => (byVariant.get(v) || []).length > 0);
  const idx = {};
  queue.forEach((v) => {
    idx[v] = 0;
  });

  let progress = true;
  while (selected.length < targetCount && progress) {
    progress = false;
    for (const variant of queue) {
      const arr = byVariant.get(variant) || [];
      let i = idx[variant];
      while (i < arr.length && !canAdd(arr[i], true)) i += 1;
      idx[variant] = i + 1;
      if (i >= arr.length) continue;
      add(arr[i]);
      progress = true;
      if (selected.length >= targetCount) break;
    }
  }

  const ensureCategory = (pred, minCount) => {
    let current = selected.filter((x) => pred(x.type)).length;
    if (current >= minCount) return;
    for (const c of unique) {
      if (current >= minCount) break;
      if (!pred(c.type)) continue;
      if (!canAdd(c, false)) continue;
      add(c);
      current += 1;
    }
  };
  ensureCategory((v) => LISTENING_VARIANTS.has(v), Math.ceil(targetCount * 0.2));
  ensureCategory((v) => INPUT_VARIANTS.has(v), Math.ceil(targetCount * 0.2));

  return {
    selected: interleaveByType(selected),
    counters: {
      byType: typeCount,
      byWord: wordCount,
      byExample: exCount,
      targetCount,
      maxType,
    },
  };
}

function finalizeTopicExercises(level, topic, selected, seedSource, seedVersion) {
  return selected.map((ex, idx) => {
    const order = idx + 1;
    const id = `${level}__${topic.topicId}__GEN__${String(order).padStart(4, '0')}`;
    return {
      ...ex,
      id,
      level,
      topicId: topic.topicId,
      topicSlug: topic.topicSlug,
      order,
      type: ex.type || '',
      baseType: ex.baseType || '',
      prompt: ex.prompt || '',
      options: ex.options || [],
      answer: ex.answer ?? '',
      audio: ex.audio || '',
      ui: ex.ui || { variant: 'standard' },
      difficulty: ex.difficulty || 1,
      stage: ex.stage || 'recognition',
      sourceWord: ex.sourceWord || '',
      sourceExample: ex.sourceExample || '',
      notes: ex.notes || '',
      tags: ex.tags || [],
      category: 'vocabulary',
      grammarSource: GRAMMAR_SOURCE_URL,
      seedSource,
      seedVersion,
    };
  });
}

function splitByStage(exercises) {
  const map = new Map(STAGE_ORDER.map((s) => [s, []]));
  exercises.forEach((ex) => {
    const stage = STAGE_ORDER.includes(ex.stage) ? ex.stage : 'mixed';
    map.get(stage).push(ex);
  });
  return map;
}

function pullN(arr, n) {
  const out = [];
  for (let i = 0; i < n && arr.length; i += 1) out.push(arr.shift());
  return out;
}

function buildLessonsForTopic(level, topic, exercises, reviewPool, baseLessons = 5, rows = []) {
  const buckets = splitByStage(sortCandidates(exercises));
  const lessons = [];
  const lessonIds = [];
  const miniTestIds = [];
  const regularLessonIds = [];

  for (let i = 0; i < baseLessons; i += 1) {
    let chosen = [];
    chosen.push(...pullN(buckets.get('recognition'), 2));
    chosen.push(...pullN(buckets.get('controlled'), 2));
    chosen.push(...pullN(buckets.get('production'), 2));
    chosen.push(...pullN(buckets.get('listening'), 1));
    chosen.push(...pullN(buckets.get('mixed'), 1));
    if (chosen.length < LESSON_EXERCISE_TARGET_MIN) {
      const rest = [
        ...buckets.get('recognition'),
        ...buckets.get('controlled'),
        ...buckets.get('production'),
        ...buckets.get('listening'),
        ...buckets.get('mixed'),
      ];
      chosen = chosen.concat(rest.slice(0, LESSON_EXERCISE_TARGET_MIN - chosen.length));
    }
    if (chosen.length > LESSON_EXERCISE_TARGET_MAX) chosen = chosen.slice(0, LESSON_EXERCISE_TARGET_MAX);

    const review = shuffleDeterministic(reviewPool, i + 301).slice(0, reviewPool.length ? 1 : 0);
    const lessonExerciseIds = uniqList([...chosen.map((x) => x.id), ...review.map((x) => x.id)]);
    const lessonId = `${level}__${topic.topicSlug}__L${String(i + 1).padStart(2, '0')}`;
    regularLessonIds.push(lessonId);

    const vocabRows = pickRowsForLesson(rows, i, FLASHCARDS_LESSON_TARGET);
    const vocab = uniqList(
      vocabRows
        .map((row) => {
          const pl = safeCell(row?.pl);
          const es = safeCell(row?.es);
          if (!pl || !es) return '';
          return `${pl} — ${es}`;
        })
        .filter(Boolean),
    ).slice(0, FLASHCARDS_LESSON_MAX);

    const lessonBlocks = buildLessonBlocks({
      topic,
      lessonIndex: i,
      rows: vocabRows.length ? vocabRows : rows,
      grammarSourceUrl: GRAMMAR_SOURCE_URL,
    });

    lessons.push({
      id: lessonId,
      level,
      topicSlug: topic.topicSlug,
      topicId: topic.topicId,
      title: `${topic.topicTitle} - leccion ${i + 1}`,
      stageFocus: STAGE_ORDER[i % STAGE_ORDER.length],
      difficultyTarget: i < 2 ? 2 : i < 4 ? 3 : 4,
      exerciseIds: lessonExerciseIds,
      estimatedMinutes: Math.max(10, Math.min(20, lessonExerciseIds.length * 2)),
      vocab,
      grammarSummaryEs: lessonBlocks[1]?.text || '',
      grammarSource: GRAMMAR_SOURCE_URL,
      blocks: lessonBlocks,
      flashcardTargetMin: FLASHCARDS_TOPIC_MIN,
      flashcardTargetMax: FLASHCARDS_LESSON_MAX,
    });
    lessonIds.push(lessonId);

    const miniId = `${lessonId}__MINITEST`;
    miniTestIds.push(miniId);
    const mixedPool = shuffleDeterministic(
      exercises.filter((x) => x.stage === 'mixed' || Number(x.difficulty || 0) >= 3),
      i + 901,
    );
    const miniExerciseIds = uniqList([
      ...mixedPool.slice(0, 8).map((x) => x.id),
      ...shuffleDeterministic(chosen, i + 905).slice(0, 4).map((x) => x.id),
    ]).slice(0, LESSON_EXERCISE_TARGET_MAX);
    lessons.push({
      id: miniId,
      level,
      topicSlug: topic.topicSlug,
      topicId: topic.topicId,
      title: `${topic.topicTitle} - mini test ${i + 1}`,
      stageFocus: 'mixed',
      difficultyTarget: 4,
      exerciseIds: miniExerciseIds.length ? miniExerciseIds : lessonExerciseIds.slice(0, 8),
      estimatedMinutes: 10,
      miniTest: true,
      miniTestAfterLesson: lessonId,
      blocks: [
        { kind: 'heading', level: 'h3', text: `Mini test ${i + 1}` },
        { kind: 'paragraph', text: 'Repaso rapido: vocabulario + gramatica del paso actual.' },
      ],
    });
    lessonIds.push(miniId);
  }

  const moduleTestId = `${level}__${topic.topicSlug}__MODULE_TEST`;
  const moduleCandidates = shuffleDeterministic(
    exercises.filter((x) => x.type === 'boss_mixed_test' || x.type === 'quick_quiz' || Number(x.difficulty || 0) >= 3),
    hashKey(level, topic.topicSlug, 'module_test'),
  );
  const moduleTestExerciseIds = uniqList(moduleCandidates.slice(0, 12).map((x) => x.id));
  lessons.push({
    id: moduleTestId,
    level,
    topicSlug: topic.topicSlug,
    topicId: topic.topicId,
    title: `${topic.topicTitle} - test del modulo`,
    stageFocus: 'mixed',
    difficultyTarget: 5,
    exerciseIds: moduleTestExerciseIds.length ? moduleTestExerciseIds : exercises.slice(0, 12).map((x) => x.id),
    estimatedMinutes: 20,
    checkpoint: true,
    moduleTest: true,
    blocks: [
      { kind: 'heading', level: 'h3', text: 'Test del modulo' },
      { kind: 'paragraph', text: 'Evaluacion corta del tema completo.' },
    ],
  });
  lessonIds.push(moduleTestId);

  const remedialId = `${level}__${topic.topicSlug}__REMEDIAL`;
  lessons.push({
    id: remedialId,
    level,
    topicSlug: topic.topicSlug,
    topicId: topic.topicId,
    title: `${topic.topicTitle} - remedial`,
    stageFocus: 'recognition',
    difficultyTarget: 2,
    exerciseIds: exercises.filter((x) => Number(x.difficulty || 0) <= 2).slice(0, 10).map((x) => x.id),
    estimatedMinutes: 15,
    remedial: true,
    adaptiveWhen: 'low_score',
    blocks: [
      { kind: 'heading', level: 'h3', text: 'Refuerzo' },
      { kind: 'paragraph', text: 'Practica adicional para recuperar bases de vocabulario y gramatica.' },
    ],
  });

  return {
    lessons,
    regularLessonIds,
    miniTestIds,
    module: {
      id: `${level}__${topic.topicSlug}__MODULE`,
      level,
      topicSlug: topic.topicSlug,
      topicId: topic.topicId,
      title: `${topic.topicTitle} - modulo`,
      lessonIds,
      checkpointLessonId: moduleTestId,
      miniTestLessonIds: miniTestIds,
      primaryLessonIds: regularLessonIds,
    },
  };
}

function buildFlashcardExercisesForTopic({
  level,
  topic,
  rows = [],
  lessons = [],
  seedSource = 'a1_a2_excel_grammar',
  seedVersion = 'v1',
}) {
  const out = [];
  const regularLessons = (lessons || []).filter(
    (lesson) => !lesson?.miniTest && !lesson?.moduleTest && !lesson?.remedial,
  );
  const vocabRows = rowsWithVocabulary(rows);
  if (!vocabRows.length) return out;
  const cardCountPerLesson = Math.max(
    FLASHCARDS_TOPIC_MIN,
    Math.min(
      FLASHCARDS_LESSON_MAX,
      vocabRows.length >= FLASHCARDS_TOPIC_MAX ? 32 : vocabRows.length >= 24 ? 24 : FLASHCARDS_TOPIC_MIN,
    ),
  );

  regularLessons.forEach((lesson, idx) => {
    const deckId = `${lesson.id}__FLASHCARDS`;
    const deck = buildFlashcardExercise({
      id: deckId,
      level,
      topic,
      lessonId: lesson.id,
      lessonIndex: idx,
      rows,
      cardCount: cardCountPerLesson,
      seedSource,
      seedVersion,
    });
    lesson.flashcardExerciseId = deckId;
    lesson.flashcardExerciseIds = [deckId];
    lesson.flashcardCount = deck.cardCount;
    out.push(deck);
  });

  const topicDeck = buildFlashcardExercise({
    id: `${level}__${topic.topicSlug}__FLASHCARDS_TOPIC`,
    level,
    topic,
    lessonId: '',
    lessonIndex: 99,
    rows,
    cardCount: FLASHCARDS_TOPIC_MAX,
    seedSource,
    seedVersion,
  });
  topicDeck.lessonIds = regularLessons.map((lesson) => lesson.id);
  topicDeck.notes = `deck:topic|cards:${topicDeck.cardCount}|lessons:${topicDeck.lessonIds.length}`;
  out.unshift(topicDeck);
  return out;
}

function countBy(arr, keyFn) {
  const out = {};
  for (const item of arr || []) {
    const key = String(keyFn(item) || '').trim() || '(none)';
    out[key] = Number(out[key] || 0) + 1;
  }
  return out;
}

function coverageReport(rows, exercises) {
  const words = uniqList(rows.map((r) => r.pl).filter(Boolean));
  const examples = uniqList(rows.map((r) => ensureSentence(r.exPl)).filter(Boolean));
  const usedWords = new Set(exercises.map((x) => safeCell(x.sourceWord)).filter(Boolean));
  const usedExamples = new Set(exercises.map((x) => ensureSentence(x.sourceExample)).filter(Boolean));
  const missingWords = words.filter((w) => !usedWords.has(w));
  const missingExamples = examples.filter((e) => !usedExamples.has(e));
  return {
    words: {
      total: words.length,
      covered: words.length - missingWords.length,
      pct: words.length ? Math.round(((words.length - missingWords.length) / words.length) * 100) : 100,
      missing: missingWords.slice(0, 80),
    },
    examples: {
      total: examples.length,
      covered: examples.length - missingExamples.length,
      pct: examples.length ? Math.round(((examples.length - missingExamples.length) / examples.length) * 100) : 100,
      missing: missingExamples.slice(0, 80),
    },
  };
}

function buildLevelReport(level, topicPackages, lessons, modules, course, extraExercises = []) {
  const allExercises = [...topicPackages.flatMap((p) => p.exercises), ...(extraExercises || [])];
  const extraByTopic = countBy(extraExercises, (x) => x.topicSlug || x.topicId || '');
  const perTopic = {};
  topicPackages.forEach((p) => {
    const flashDecks = Number(extraByTopic[p.topic.topicSlug] || 0);
    perTopic[p.topic.topicSlug] = {
      topicId: p.topic.topicId,
      topicTitle: p.topic.topicTitle,
      exercises: p.exercises.length,
      flashcardDecks: flashDecks,
      exercisesWithFlashcards: p.exercises.length + flashDecks,
      unresolvedTopicMapping: p.topic.unresolved === true,
      mappingScore: p.topic.score,
      coverage: coverageReport(p.rows, p.exercises),
    };
  });
  const sampleByVariant = {};
  for (const variant of REQUIRED_VARIANTS) {
    const sample = allExercises.find((x) => x.type === variant);
    if (sample) sampleByVariant[variant] = sample;
  }
  const sampleLesson = lessons.find((l) => !l.checkpoint && !l.remedial && !l.finalExam) || lessons[0] || null;
  return {
    level,
    counts: {
      exercisesTotal: allExercises.length,
      flashcardDecks: allExercises.filter((x) => normalizeText(x?.type || '').includes('tarjeta')).length,
      exerciseTypesTotal: Object.keys(countBy(allExercises, (x) => x.type)).length,
      perTopic,
      perType: countBy(allExercises, (x) => x.type),
      perDifficulty: countBy(allExercises, (x) => x.difficulty),
      perStage: countBy(allExercises, (x) => x.stage),
      lessonsTotal: lessons.length,
      lessonsPerTopic: countBy(lessons.filter((l) => l.topicSlug), (l) => l.topicSlug),
      modulesTotal: modules.length,
    },
    samples: {
      variants: sampleByVariant,
      lesson: sampleLesson
        ? {
            ...sampleLesson,
            exerciseTypes: sampleLesson.exerciseIds
              .map((id) => allExercises.find((x) => x.id === id)?.type || '')
              .filter(Boolean),
          }
        : null,
      module: modules[0] || null,
      course,
    },
  };
}

function buildTopicPackage(level, sheet, topic, seedSource, seedVersion) {
  const ctx = { level, rows: sheet.rows, topic };
  const candidates = [];
  sheet.rows.forEach((row, idx) => {
    candidates.push(...buildWordBasedCandidates(ctx, row, idx));
    candidates.push(...buildExampleCandidates(ctx, row, idx));
  });
  candidates.push(...buildMatchingCandidates(ctx));
  candidates.push(...buildGrammarCandidates(ctx));
  candidates.push(...buildMixedTestCandidates(ctx));
  const writingPrompts = [
    `Napisz 4-6 zdan na temat: ${topic.topicTitle}.`,
    `Napisz krotki opis (3-5 zdan): ${topic.topicTitle}.`,
    `Napisz mini dialog (4 linie): ${topic.topicTitle}.`,
    `Napisz 3 zdania z uzyciem slow z tematu: ${topic.topicTitle}.`,
    `Napisz 2 pytania i 2 odpowiedzi o temacie: ${topic.topicTitle}.`,
    `Napisz krotka wiadomosc o temacie: ${topic.topicTitle}.`,
  ];
  const fallbackWord = safeCell(sheet.rows?.[0]?.pl || topic.topicTitle || '');
  const fallbackEs = safeCell(sheet.rows?.[0]?.es || '');
  writingPrompts.forEach((prompt, idx) => {
    candidates.push(
      makeExerciseBase({
        level,
        topicId: topic.topicId,
        topicSlug: topic.topicSlug,
        variant: 'mini_writing',
        prompt: `${prompt} [${idx + 1}]`,
        answer: '',
        sourceWord: fallbackWord,
        sourceTranslation: fallbackEs,
        sourceExample: ensureSentence(prompt),
        sourceExampleEs: fallbackEs ? ensureSentence(fallbackEs) : '',
        seedIndex: idx,
      }),
    );
  });
  const target = Math.max(120, Math.min(320, sheet.rows.length * 7));
  const picked = applySelectionConstraints(candidates, target);
  return {
    topic,
    rows: sheet.rows,
    counters: picked.counters,
    exercises: finalizeTopicExercises(level, topic, picked.selected, seedSource, seedVersion),
  };
}

export function generateLevelFromWorkbook({
  XLSX,
  workbook,
  fileName = '',
  topics = [],
  seedSource = 'a1_a2_excel_grammar',
  seedVersion = 'v1',
  levelHint = '',
  topicLimit = 0,
}) {
  const parsed = parseWorkbookSheets(XLSX, workbook, { levelHint, fileName });
  const level = parsed.level;
  const sheets = Number(topicLimit) > 0 ? parsed.sheets.slice(0, Number(topicLimit)) : parsed.sheets;
  const topicPackages = sheets.map((sheet) => {
    const topic = mapSheetToTopic(sheet, topics, level);
    return buildTopicPackage(level, sheet, topic, seedSource, seedVersion);
  });

  const lessons = [];
  const modules = [];
  const reviewPool = [];
  const flashcardExercises = [];
  topicPackages.forEach((pkg) => {
    const built = buildLessonsForTopic(
      level,
      pkg.topic,
      pkg.exercises,
      reviewPool,
      pkg.rows.length < 24 ? 3 : 5,
      pkg.rows,
    );
    const cards = buildFlashcardExercisesForTopic({
      level,
      topic: pkg.topic,
      rows: pkg.rows,
      lessons: built.lessons,
      seedSource,
      seedVersion,
    });
    flashcardExercises.push(...cards);
    lessons.push(...built.lessons);
    modules.push(built.module);
    reviewPool.push(...pkg.exercises.filter((x) => Number(x.difficulty || 0) <= 3));
  });

  const tail = topicPackages[topicPackages.length - 1];
  const prev = topicPackages[topicPackages.length - 2];
  const older = topicPackages.slice(0, Math.max(0, topicPackages.length - 2));
  const finalPool = [];
  if (tail) finalPool.push(...tail.exercises.slice(0, 10));
  if (prev) finalPool.push(...prev.exercises.slice(0, 6));
  older.forEach((p) => finalPool.push(...p.exercises.slice(0, 4)));
  const finalExamLessonId = `${level}__FINAL_EXAM`;
  lessons.push({
    id: finalExamLessonId,
    level,
    topicSlug: '',
    topicId: '',
    title: `${level} final exam`,
    stageFocus: 'mixed',
    difficultyTarget: 5,
    exerciseIds: uniqList(shuffleDeterministic(finalPool, hashKey(level, finalPool.length)).slice(0, 20).map((x) => x.id)),
    estimatedMinutes: 30,
    finalExam: true,
    blocks: [
      { kind: 'heading', level: 'h3', text: `${level} - examen final` },
      { kind: 'paragraph', text: 'Evaluacion global de vocabulario, gramatica, escucha y produccion.' },
    ],
  });

  const course = {
    id: `${level}__COURSE_PATH`,
    level,
    moduleIds: modules.map((m) => m.id),
    finalExamLessonId,
    adaptiveRules: {
      lowScore: { addRemedialLesson: true, focusDifficulties: [1, 2], repeatMistakes: true },
      highScore: { accelerateTo: [3, 4, 5], increaseListeningDialogue: true },
      reviewInsertionEvery: 6,
      bossMixRatio: { currentTopic: 0.5, previousTopic: 0.3, olderTopics: 0.2 },
    },
  };

  const allExercises = [...topicPackages.flatMap((p) => p.exercises), ...flashcardExercises];
  const report = buildLevelReport(level, topicPackages, lessons, modules, course, flashcardExercises);
  return {
    level,
    grammarSource: { name: GRAMMAR_SOURCE_NAME, url: GRAMMAR_SOURCE_URL, partsOfSpeech: PARTS_OF_SPEECH },
    topicPackages,
    exercises: allExercises,
    flashcardExercises,
    lessons,
    modules,
    course,
    report,
  };
}

export function generateA1A2Package({
  XLSX,
  workbooks = [],
  topics = [],
  seedSource = 'a1_a2_excel_grammar',
  seedVersion = 'v1',
  topicLimit = 0,
}) {
  const levels = {};
  for (const wb of workbooks) {
    const levelData = generateLevelFromWorkbook({
      XLSX,
      workbook: wb.workbook,
      fileName: wb.fileName || '',
      levelHint: wb.level || '',
      topics,
      seedSource,
      seedVersion,
      topicLimit,
    });
    levels[levelData.level] = levelData;
  }

  const collections = { exercises: [], lessons: [], modules: [], courses: [] };
  const levelOrder = ['A1', 'A2', 'B1', 'B2'];
  const orderedLevels = Object.keys(levels).sort((a, b) => {
    const ai = levelOrder.indexOf(String(a || '').toUpperCase());
    const bi = levelOrder.indexOf(String(b || '').toUpperCase());
    const av = ai >= 0 ? ai : 999;
    const bv = bi >= 0 ? bi : 999;
    if (av !== bv) return av - bv;
    return String(a || '').localeCompare(String(b || ''));
  });

  for (const levelKey of orderedLevels) {
    const lvl = levels[levelKey];
    collections.exercises.push(...lvl.exercises.map((x) => ({ id: x.id, data: x })));
    collections.lessons.push(...lvl.lessons.map((x) => ({ id: x.id, data: x })));
    collections.modules.push(...lvl.modules.map((x) => ({ id: x.id, data: x })));
  }

  const mergedModuleIds = uniqList(
    orderedLevels.flatMap((levelKey) => (levels[levelKey]?.modules || []).map((m) => m.id)),
  );
  const firstLevel = orderedLevels[0] || 'A1';
  const lastLevel = orderedLevels[orderedLevels.length - 1] || firstLevel;
  const fallbackRules = {
    lowScore: { addRemedialLesson: true, focusDifficulties: [1, 2], repeatMistakes: true },
    highScore: { accelerateTo: [3, 4, 5], increaseListeningDialogue: true },
    reviewInsertionEvery: 6,
    bossMixRatio: { currentTopic: 0.5, previousTopic: 0.3, olderTopics: 0.2 },
  };
  const mergedCourse = {
    id: 'COURSE_PATH',
    level: firstLevel,
    scope: 'all_levels',
    levels: orderedLevels,
    moduleIds: mergedModuleIds,
    finalExamLessonId: `${lastLevel}__FINAL_EXAM`,
    adaptiveRules: levels[firstLevel]?.course?.adaptiveRules || fallbackRules,
  };
  collections.courses.push({ id: mergedCourse.id, data: mergedCourse });

  return {
    generatedAt: new Date().toISOString(),
    grammarSource: { name: GRAMMAR_SOURCE_NAME, url: GRAMMAR_SOURCE_URL, partsOfSpeech: PARTS_OF_SPEECH },
    levels,
    collections,
  };
}
