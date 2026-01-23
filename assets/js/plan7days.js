/* =========================
   7 DAY PLAN v1.1 (localStorage)
   - Improved error handling
   ========================= */

window.Plan7 = {
  key(level){ 
    return `plan7_${String(level||"A1").toUpperCase()}`; 
  },

  get(level){
    try {
      const raw = localStorage.getItem(this.key(level));
      const data = raw ? JSON.parse(raw) : null;
      
      if(Array.isArray(data) && data.length === 7) {
        return data.map(Boolean);
      }
      return Array(7).fill(false);
    } catch(err){
      console.warn(`[Plan7] Error reading data for level ${level}:`, err);
      return Array(7).fill(false);
    }
  },

  set(level, arr){
    try {
      const safe = Array.isArray(arr) ? arr.slice(0,7).map(Boolean) : Array(7).fill(false);
      while(safe.length < 7) safe.push(false);
      localStorage.setItem(this.key(level), JSON.stringify(safe));
      return safe;
    } catch(err){
      console.error(`[Plan7] Error saving data for level ${level}:`, err);
      if(err.name === 'QuotaExceededError') {
        console.warn('[Plan7] localStorage quota exceeded - data not saved');
      }
      return Array(7).fill(false);
    }
  },

  toggle(level, dayIndex){
    try {
      const arr = this.get(level);
      const i = Number(dayIndex);
      if(i >= 0 && i < 7){
        arr[i] = !arr[i];
        this.set(level, arr);
      }
      return arr;
    } catch(err){
      console.error(`[Plan7] Error toggling day ${dayIndex} for level ${level}:`, err);
      return this.get(level);
    }
  }
};
