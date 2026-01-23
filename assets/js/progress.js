/* =========================
   PROGRESS ENGINE v2.1
   - zapis: % + ostatni temat + lista ukończonych
   - Improved error handling and validation
   ========================= */

window.Progress = {
  key(level){ 
    return `course_progress_${String(level||"").toUpperCase()}`; 
  },

  get(level){
    try {
      const raw = localStorage.getItem(this.key(level));
      const fallback = { done: [], lastId: null, lastTitle: "", percent: 0, total: 0 };
      
      const data = raw ? JSON.parse(raw) : fallback;
      
      // Validate and sanitize data
      if(!Array.isArray(data.done)) data.done = [];
      if(typeof data.lastTitle !== "string") data.lastTitle = "";
      if(typeof data.lastId !== "string") data.lastId = null;
      if(typeof data.percent !== "number" || data.percent < 0 || data.percent > 100) data.percent = 0;
      if(typeof data.total !== "number" || data.total < 0) data.total = 0;
      
      return data;
    } catch(err){
      console.warn(`[Progress] Error reading data for level ${level}:`, err);
      return { done: [], lastId: null, lastTitle: "", percent: 0, total: 0 };
    }
  },

  save(level, data){
    try {
      localStorage.setItem(this.key(level), JSON.stringify(data));
    } catch(err){
      console.error(`[Progress] Error saving data for level ${level}:`, err);
      if(err.name === 'QuotaExceededError') {
        console.warn('[Progress] localStorage quota exceeded - data not saved');
      }
    }
  },

  setTotal(level, total){
    try {
      const data = this.get(level);
      data.total = Math.max(0, Number(total||0));
      data.percent = data.total
        ? Math.min(100, Math.round((data.done.length / data.total) * 100))
        : 0;
      this.save(level, data);
      return data;
    } catch(err){
      console.error(`[Progress] Error setting total for level ${level}:`, err);
      return this.get(level);
    }
  },

  markDone(level, topicId, topicTitle=""){
    try {
      const data = this.get(level);
      const id = String(topicId || "").trim();
      
      if(!id) {
        console.warn('[Progress] markDone called with empty topicId');
        return data;
      }

      if(!data.done.includes(id)) {
        data.done.push(id);
      }

      data.lastId = id;
      data.lastTitle = String(topicTitle || "").trim();

      data.percent = data.total
        ? Math.min(100, Math.round((data.done.length / data.total) * 100))
        : data.percent;

      this.save(level, data);
      return data;
    } catch(err){
      console.error(`[Progress] Error marking done for level ${level}:`, err);
      return this.get(level);
    }
  },

  isDone(level, topicId){
    try {
      const data = this.get(level);
      return data.done.includes(String(topicId || "").trim());
    } catch(err){
      console.error(`[Progress] Error checking isDone for level ${level}:`, err);
      return false;
    }
  }
};
