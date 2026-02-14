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
    key.includes('complete_dialogue')
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
    instruction: { es: instructionEs },
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

  const mcqEsPl = optionItemsFromTexts(shuffleDeterministic(plPool, index + 11), row.pl);
  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'multiple_choice_es_pl',
      prompt: `Jak po polsku: "${row.es}"?`,
      options: mcqEsPl.options,
      answer: { correctOptionId: mcqEsPl.correctOptionId },
      sourceWord: row.pl,
      sourceExample: row.exPl,
    }),
  );

  const mcqPlEs = optionItemsFromTexts(shuffleDeterministic(esPool, index + 19), row.es);
  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'multiple_choice_pl_es',
      prompt: `Jak po hiszpansku: "${row.pl}"?`,
      options: mcqPlEs.options,
      answer: { correctOptionId: mcqPlEs.correctOptionId },
      sourceWord: row.pl,
      sourceExample: row.exPl,
    }),
  );

  const wrongEs = shuffleDeterministic(esPool.filter((t) => t !== row.es), index + 23)[0] || row.es;
  const falseCase = index % 2 === 1;
  out.push(
    makeExerciseBase({
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
      sourceWord: row.pl,
      sourceExample: row.exPl,
    }),
  );

  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'type_translation_es_pl',
      prompt: `Wpisz po polsku: "${row.es}".`,
      answer: { accepted: uniqList([row.pl]) },
      sourceWord: row.pl,
      sourceExample: row.exPl,
    }),
  );

  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'type_translation_pl_es',
      prompt: `Wpisz po hiszpansku: "${row.pl}".`,
      answer: { accepted: uniqList([row.es]) },
      sourceWord: row.pl,
      sourceExample: row.exPl,
    }),
  );

  if (row.exPl && row.exEs) {
    const sentenceOpt = optionItemsFromTexts(
      shuffleDeterministic(ctx.rows.map((x) => ensureSentence(x.exEs)).filter(Boolean), index + 31),
      ensureSentence(row.exEs),
    );
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'sentence_meaning_choice',
        prompt: `Znaczenie zdania: "${ensureSentence(row.exPl)}"`,
        options: sentenceOpt.options,
        answer: { correctOptionId: sentenceOpt.correctOptionId },
        sourceWord: row.pl,
        sourceExample: ensureSentence(row.exPl),
      }),
    );
  }

  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'dictation_word',
      prompt: 'Zapisz slowo, ktore slyszysz.',
      answer: { accepted: uniqList([row.pl]), typoTolerance: 1 },
      audio: row.pl,
      sourceWord: row.pl,
    }),
  );

  const listenOpt = optionItemsFromTexts(shuffleDeterministic(plPool, index + 41), row.pl);
  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'listen_choose',
      prompt: 'Posluchaj i wybierz poprawne slowo.',
      options: listenOpt.options,
      answer: { correctOptionId: listenOpt.correctOptionId },
      audio: row.pl,
      sourceWord: row.pl,
    }),
  );

  const falseWord = shuffleDeterministic(plPool.filter((t) => t !== row.pl), index + 47)[0] || row.pl;
  const tfFalse = index % 3 === 0;
  out.push(
    makeExerciseBase({
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
      audio: row.pl,
      sourceWord: row.pl,
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

  const pickSentence = optionItemsFromTexts(
    shuffleDeterministic(ctx.rows.map((x) => ensureSentence(x.exPl)).filter(Boolean), index + 53),
    exPl,
  );
  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'pick_correct_sentence',
      prompt: `Wybierz poprawne zdanie dla: "${exEs || row.es}"`,
      options: pickSentence.options,
      answer: { correctOptionId: pickSentence.correctOptionId },
      sourceWord: row.pl,
      sourceExample: exPl,
    }),
  );

  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'word_tiles_sentence',
      prompt: 'Uloz zdanie z kafelkow.',
      options: tokens,
      answer: { accepted: [exPl] },
      sourceWord: row.pl,
      sourceExample: exPl,
    }),
  );

  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'reorder_words_sentence',
      prompt: 'Uloz zdanie we wlasciwej kolejnosci.',
      options: shuffleDeterministic(tokens, index + 59),
      answer: { accepted: [exPl] },
      sourceWord: row.pl,
      sourceExample: exPl,
    }),
  );

  const blank = blankSentenceForWord(exPl, row.pl) || blankSentenceForWord(exPl, tokens[0]);
  if (blank.includes('___')) {
    const bank = uniqList([row.pl, ...shuffleDeterministic(ctx.rows.map((x) => x.pl).filter(Boolean), index + 61)]).slice(0, 6);
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'fill_blank_word_bank',
        prompt: `Uzupelnij z banku: ${blank}`,
        options: bank,
        answer: { acceptedByBlank: [[row.pl]] },
        sourceWord: row.pl,
        sourceExample: exPl,
        audio: exPl,
      }),
    );
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'fill_blank_typed',
        prompt: blank,
        answer: { acceptedByBlank: [[row.pl]] },
        sourceWord: row.pl,
        sourceExample: exPl,
      }),
    );
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'type_missing_word',
        prompt: `${blank} (jedno slowo)`,
        answer: { acceptedByBlank: [[row.pl]] },
        sourceWord: row.pl,
        sourceExample: exPl,
      }),
    );
  }

  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'dictation_sentence',
      prompt: 'Posluchaj i zapisz zdanie.',
      answer: { accepted: [exPl], typoTolerance: 1 },
      audio: exPl,
      sourceWord: row.pl,
      sourceExample: exPl,
    }),
  );

  if (tokens.length >= 3) {
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'listen_arrange_tiles',
        prompt: Array.from({ length: tokens.length }, () => '___').join(' '),
        options: shuffleDeterministic(tokens, index + 67),
        answer: { acceptedByBlank: tokens.map((token) => [token]) },
        audio: exPl,
        sourceWord: row.pl,
        sourceExample: exPl,
      }),
    );
  }

  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'rewrite_sentence_simple',
      prompt: `Napisz podobne zdanie: "${exPl}"`,
      answer: '',
      sourceWord: row.pl,
      sourceExample: exPl,
    }),
  );

  const bad = exPl.replace(row.pl, `${row.pl} ${row.pl}`);
  const fixOpt = optionItemsFromTexts([exPl, bad], exPl);
  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'correct_the_error',
      prompt: bad,
      options: fixOpt.options,
      answer: { correctOptionId: fixOpt.correctOptionId },
      sourceWord: row.pl,
      sourceExample: exPl,
    }),
  );

  const reply = ensureSentence(row.exEs || row.es || row.pl);
  const dlgOpt = optionItemsFromTexts(
    [reply, shuffleDeterministic(ctx.rows.map((x) => ensureSentence(x.exEs || x.es || x.pl)).filter(Boolean), index + 71)[0] || reply],
    reply,
  );
  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'choose_reply_dialogue',
      prompt: `A: ${exPl}\nB: ...`,
      options: dlgOpt.options,
      answer: { correctOptionId: dlgOpt.correctOptionId },
      sourceWord: row.pl,
      sourceExample: exPl,
    }),
  );

  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'complete_dialogue',
      prompt: `A: ${exPl}\nB: ___`,
      answer: { acceptedByBlank: [[reply]] },
      sourceWord: row.pl,
      sourceExample: exPl,
    }),
  );

  const replyTokens = tokenizeSentence(reply).filter((t) => /[\p{L}\p{N}]/u.test(t));
  if (replyTokens.length >= 2) {
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'dialogue_tiles_reply',
        prompt: 'Uloz odpowiedz w dialogu.',
        options: shuffleDeterministic(replyTokens, index + 73),
        answer: { accepted: [replyTokens.join(' ')] },
        sourceWord: row.pl,
        sourceExample: exPl,
      }),
    );
  }

  const lines = [`A: ${reply}`, `B: ${exPl}`, `A: ${reply}`];
  out.push(
    makeExerciseBase({
      level: ctx.level,
      topicId: ctx.topic.topicId,
      topicSlug: ctx.topic.topicSlug,
      variant: 'reorder_dialogue_lines',
      prompt: 'Uloz linie dialogu.',
      options: shuffleDeterministic(lines, index + 79),
      answer: { accepted: [lines.join(' ')] },
      sourceWord: row.pl,
      sourceExample: exPl,
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
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'matching_pairs_es_pl',
        prompt: 'Dopasuj polski do hiszpanskiego.',
        pairs: slice.map((r) => ({ left: r.pl, right: r.es })),
      }),
    );
  }
  const exRows = ctx.rows.filter((r) => r.exPl && r.pl);
  for (let i = 0; i < exRows.length; i += 6) {
    const slice = exRows.slice(i, i + 6);
    if (slice.length < 3) continue;
    out.push(
      makeExerciseBase({
        level: ctx.level,
        topicId: ctx.topic.topicId,
        topicSlug: ctx.topic.topicSlug,
        variant: 'matching_example_to_word',
        prompt: 'Dopasuj zdanie do slowa.',
        pairs: slice.map((r) => ({ left: ensureSentence(r.exPl), right: r.pl })),
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
      }),
    );
  }
  return out;
}

function buildGrammarCandidates(ctx) {
  const out = [];
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
    selected: sortCandidates(selected),
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

function buildLessonsForTopic(level, topic, exercises, reviewPool, baseLessons = 5) {
  const buckets = splitByStage(sortCandidates(exercises));
  const lessons = [];
  const lessonIds = [];

  for (let i = 0; i < baseLessons; i += 1) {
    let chosen = [];
    chosen.push(...pullN(buckets.get('recognition'), 2));
    chosen.push(...pullN(buckets.get('controlled'), 2));
    chosen.push(...pullN(buckets.get('production'), 2));
    chosen.push(...pullN(buckets.get('listening'), 1));
    chosen.push(...pullN(buckets.get('mixed'), 1));
    if (chosen.length < 8) {
      const rest = [...buckets.get('recognition'), ...buckets.get('controlled'), ...buckets.get('production'), ...buckets.get('listening'), ...buckets.get('mixed')];
      chosen = chosen.concat(rest.slice(0, 8 - chosen.length));
    }
    if (chosen.length > 12) chosen = chosen.slice(0, 12);
    const review = shuffleDeterministic(reviewPool, i + 301).slice(0, reviewPool.length ? 1 : 0);
    const exerciseIds = uniqList([...chosen.map((x) => x.id), ...review.map((x) => x.id)]);
    const lessonId = `${level}__${topic.topicSlug}__L${String(i + 1).padStart(2, '0')}`;
    lessons.push({
      id: lessonId,
      level,
      topicSlug: topic.topicSlug,
      topicId: topic.topicId,
      title: `${topic.topicTitle} - lekcja ${i + 1}`,
      stageFocus: STAGE_ORDER[i % STAGE_ORDER.length],
      difficultyTarget: i < 2 ? 2 : i < 4 ? 3 : 4,
      exerciseIds,
      estimatedMinutes: Math.max(10, Math.min(20, exerciseIds.length * 2)),
    });
    lessonIds.push(lessonId);
  }

  const checkpointId = `${level}__${topic.topicSlug}__CHECKPOINT`;
  const checkpointExercises = uniqList(
    exercises
      .filter((x) => x.type === 'boss_mixed_test' || x.type === 'quick_quiz')
      .slice(0, 10)
      .map((x) => x.id),
  );
  lessons.push({
    id: checkpointId,
    level,
    topicSlug: topic.topicSlug,
    topicId: topic.topicId,
    title: `${topic.topicTitle} - checkpoint`,
    stageFocus: 'mixed',
    difficultyTarget: 5,
    exerciseIds: checkpointExercises.length ? checkpointExercises : exercises.slice(0, 10).map((x) => x.id),
    estimatedMinutes: 20,
    checkpoint: true,
  });
  lessonIds.push(checkpointId);

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
  });

  return {
    lessons,
    module: {
      id: `${level}__${topic.topicSlug}__MODULE`,
      level,
      topicSlug: topic.topicSlug,
      topicId: topic.topicId,
      title: `${topic.topicTitle} - modul`,
      lessonIds,
      checkpointLessonId: checkpointId,
    },
  };
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

function buildLevelReport(level, topicPackages, lessons, modules, course) {
  const allExercises = topicPackages.flatMap((p) => p.exercises);
  const perTopic = {};
  topicPackages.forEach((p) => {
    perTopic[p.topic.topicSlug] = {
      topicId: p.topic.topicId,
      topicTitle: p.topic.topicTitle,
      exercises: p.exercises.length,
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
  writingPrompts.forEach((prompt, idx) => {
    candidates.push(
      makeExerciseBase({
        level,
        topicId: topic.topicId,
        topicSlug: topic.topicSlug,
        variant: 'mini_writing',
        prompt: `${prompt} [${idx + 1}]`,
        answer: '',
      }),
    );
  });
  const target = Math.max(90, Math.min(220, sheet.rows.length * 5));
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
  topicPackages.forEach((pkg) => {
    const built = buildLessonsForTopic(level, pkg.topic, pkg.exercises, reviewPool, pkg.rows.length < 24 ? 3 : 5);
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

  const report = buildLevelReport(level, topicPackages, lessons, modules, course);
  return {
    level,
    grammarSource: { name: GRAMMAR_SOURCE_NAME, url: GRAMMAR_SOURCE_URL, partsOfSpeech: PARTS_OF_SPEECH },
    topicPackages,
    exercises: topicPackages.flatMap((p) => p.exercises),
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
  for (const levelKey of Object.keys(levels)) {
    const lvl = levels[levelKey];
    collections.exercises.push(...lvl.exercises.map((x) => ({ id: x.id, data: x })));
    collections.lessons.push(...lvl.lessons.map((x) => ({ id: x.id, data: x })));
    collections.modules.push(...lvl.modules.map((x) => ({ id: x.id, data: x })));
    collections.courses.push({ id: lvl.course.id, data: lvl.course });
  }

  return {
    generatedAt: new Date().toISOString(),
    grammarSource: { name: GRAMMAR_SOURCE_NAME, url: GRAMMAR_SOURCE_URL, partsOfSpeech: PARTS_OF_SPEECH },
    levels,
    collections,
  };
}
