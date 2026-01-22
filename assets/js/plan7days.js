/* =========================
   7 DAY PLAN v1 (localStorage)
   ========================= */

window.Plan7 = {
  key(level){ return `plan7_${String(level||"A1").toUpperCase()}`; },

  get(level){
    const raw = localStorage.getItem(this.key(level));
    try{
      const data = raw ? JSON.parse(raw) : null;
      if(Array.isArray(data) && data.length === 7) return data.map(Boolean);
      return Array(7).fill(false);
    }catch{
      return Array(7).fill(false);
    }
  },

  set(level, arr){
    const safe = Array.isArray(arr) ? arr.slice(0,7).map(Boolean) : Array(7).fill(false);
    while(safe.length < 7) safe.push(false);
    localStorage.setItem(this.key(level), JSON.stringify(safe));
    return safe;
  },

  toggle(level, dayIndex){
    const arr = this.get(level);
    const i = Number(dayIndex);
    if(i >= 0 && i < 7){
      arr[i] = !arr[i];
      this.set(level, arr);
    }
    return arr;
  }
};
