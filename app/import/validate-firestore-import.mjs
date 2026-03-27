// import/validate-firestore-import.mjs
// Usage:
//   node import/validate-firestore-import.mjs import/generated/a1-a2-firestore-final-firestore-import.json
// Exit code 1 if invalid.

import fs from "fs";

const file = process.argv[2];
if (!file) {
  console.error("Provide path to firestore-import.json");
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(file, "utf8"));

const COLLECTIONS = ["exercises", "lessons", "modules", "courses"];

function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function hasNestedArray(v) {
  if (Array.isArray(v)) return v.some((x) => Array.isArray(x) || hasNestedArray(x));
  if (isObj(v)) return Object.values(v).some(hasNestedArray);
  return false;
}

function findFirstNestedArrayPath(v, path = "") {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const x = v[i];
      if (Array.isArray(x)) return `${path}[${i}]`;
      const p = findFirstNestedArrayPath(x, `${path}[${i}]`);
      if (p) return p;
    }
  } else if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      const p = findFirstNestedArrayPath(x, path ? `${path}.${k}` : k);
      if (p) return p;
    }
  }
  return "";
}

function str(v) {
  return String(v ?? "").trim();
}

function norm(v) {
  return str(v).toLowerCase();
}

function ensure(cond, msg, ctx) {
  if (!cond) throw new Error(`${msg}${ctx ? ` | ${ctx}` : ""}`);
}

// Optional guardrail (won't fail, only warns)
const WARN_LONG_STRING = 12_000;

function validateExerciseDoc(doc) {
  const d = doc?.data ?? {};
  const type = norm(d.type);
  const base = norm(d.baseType || type);

  // Minimal required metadata (adjust if your schema differs)
  ensure(!!str(d.level), "Missing level", doc.id);
  ensure(!!str(d.type), "Missing type", doc.id);
  // topicSlug or topicId should exist
  ensure(!!str(d.topicSlug) || !!str(d.topicId), "Missing topicSlug/topicId", doc.id);

  // Firestore constraint: no nested arrays anywhere
  ensure(!hasNestedArray(d), "Nested array detected", `${doc.id} @ ${findFirstNestedArrayPath(d)}`);

  // Type-specific constraints (based on your runtime notes)
  if (base.includes("matching")) {
    // legacy expects options as text lines
    ensure(Array.isArray(d.options) && d.options.length > 0, "Matching requires options[]", doc.id);
    ensure(d.options.every((x) => typeof x === "string"), "Matching options must be string[] (legacy)", doc.id);
    // answer can be string map like "A-1,B-2" (recommended)
    ensure(typeof d.answer === "string" || isObj(d.answer), "Matching answer must be string or object", doc.id);
  }

  if (base.includes("fill") || base.includes("listen_arrange") || type.includes("listen_arrange")) {
    // parseExpectedByBlank expects string answer
    ensure(typeof d.answer === "string", "Fill/drag requires legacy string answer", doc.id);
    ensure(str(d.prompt).includes("___"), "Fill/drag prompt must contain ___", doc.id);
  }

  if (base.includes("choice") || base.includes("multiple_choice") || type.includes("multiple_choice") || base.includes("scene") || base.includes("find_error")) {
    ensure(Array.isArray(d.options) && d.options.length > 0, "MCQ-like requires options[]", doc.id);
    // canonical options items allowed OR legacy strings; runtime prefers items
    const opt0 = d.options[0];
    const ok =
      typeof opt0 === "string" ||
      (isObj(opt0) && typeof opt0.id === "string" && typeof opt0.text === "string");
    ensure(ok, "MCQ options must be string[] or {id,text}[]", doc.id);

    // answer: correctOptionId or compatible
    if (isObj(d.answer)) {
      ensure(!!str(d.answer.correctOptionId) || Array.isArray(d.answer.accepted), "MCQ answer missing correctOptionId/accepted", doc.id);
    } else {
      // allow legacy string answers for some cases
      ensure(typeof d.answer === "string" || typeof d.answer === "boolean", "MCQ answer must be object/string/bool", doc.id);
    }
  }

  if (base.includes("dictation") || base.includes("translate")) {
    // accepted array is fine; must not be nested array
    if (isObj(d.answer)) {
      if (Array.isArray(d.answer.accepted)) {
        ensure(d.answer.accepted.every((x) => typeof x === "string"), "accepted must be string[]", doc.id);
      }
    } else {
      ensure(typeof d.answer === "string", "Dictation/translate answer should be string or {accepted:[]}", doc.id);
    }
  }

  // Soft warnings
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string" && v.length > WARN_LONG_STRING) {
      console.warn(`WARN: very long string (${v.length}) in ${doc.id} field ${k}`);
    }
  }

  return { baseType: base || "unknown", type: type || "unknown" };
}

function validateNonExerciseDoc(doc, collection) {
  const d = doc?.data ?? {};
  ensure(!hasNestedArray(d), "Nested array detected", `${collection}/${doc.id} @ ${findFirstNestedArrayPath(d)}`);
  // Light schema checks
  ensure(!!str(d.level), `Missing level in ${collection}`, doc.id);
  if (collection === "lessons") ensure(Array.isArray(d.exerciseIds), "Lesson missing exerciseIds[]", doc.id);
  if (collection === "modules") ensure(Array.isArray(d.lessonIds), "Module missing lessonIds[]", doc.id);
  if (collection === "courses") ensure(Array.isArray(d.moduleIds), "Course missing moduleIds[]", doc.id);
}

function main() {
  const stats = {
    totalDocs: 0,
    perCollection: {},
    perBaseType: {},
  };

  const errors = [];

  for (const col of COLLECTIONS) {
    const arr = raw[col] || [];
    stats.perCollection[col] = arr.length;
    for (const doc of arr) {
      stats.totalDocs++;
      try {
        if (col === "exercises") {
          const { baseType } = validateExerciseDoc(doc);
          stats.perBaseType[baseType] = (stats.perBaseType[baseType] || 0) + 1;
        } else {
          validateNonExerciseDoc(doc, col);
        }
      } catch (e) {
        errors.push(String(e.message || e));
      }
    }
  }

  console.log("VALIDATION SUMMARY:", JSON.stringify(stats, null, 2));

  if (errors.length) {
    console.error(`\n❌ VALIDATION FAILED (${errors.length} errors). Showing first 30:\n`);
    errors.slice(0, 30).forEach((e, i) => console.error(`${i + 1}. ${e}`));
    process.exit(1);
  }

  console.log("\n✅ VALIDATION PASSED (no nested arrays + schema OK).");
}

main();
