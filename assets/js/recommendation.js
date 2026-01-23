/* =========================
   DAILY RECOMMENDATION v1.1
   - Improved error handling and null safety
   ========================= */

window.getDailyRecommendation = function(level){
  try {
    const L = String(level||"A1").toUpperCase();
    
    // Safe access to Progress
    const p = (typeof window.Progress !== 'undefined' && window.Progress?.get) 
      ? window.Progress.get(L) 
      : { done: [] };

    const today = new Date();
    const seed = Number(
      String(today.getFullYear()) +
      String(today.getMonth()+1).padStart(2,"0") +
      String(today.getDate()).padStart(2,"0")
    );
    
    const doneCount = (p?.done?.length || 0);

    const pool = [
      "fiszki (2 min) + 1 mini-dialog (3 min)",
      "powtórka 10 słów + 3 zdania na głos",
      "1 temat gramatyczny: 2 przykłady + 2 pytania",
      "słownictwo: 8 słów + 1 zdanie do każdego",
      "mini-quiz: 5 pytań + 2 min powtórki"
    ];

    if(!Array.isArray(pool) || pool.length === 0) {
      console.warn('[Recommendation] Pool is empty');
      return "Dziś 5 minut: powtórka słownictwa ✅";
    }

    const idx = (seed + doneCount) % pool.length;
    return `Dziś 5 minut: ${pool[idx]} ✅`;
  } catch(err){
    console.error('[Recommendation] Error generating recommendation:', err);
    return "Dziś 5 minut: powtórka słownictwa ✅";
  }
};
