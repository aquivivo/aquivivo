/* =========================
   PROGRESS ENGINE v2
   - zapis: % + ostatni temat + lista ukończonych
   ========================= */

window.Progress = {
  key(level){ return `course_progress_${String(level||"").toUpperCase()}`; },

  get(level){
    const raw = localStorage.getItem(this.key(level));
    const fallback = { done: [], lastId: null, lastTitle: "", percent: 0, total: 0 };
    try{
      const data = raw ? JSON.parse(raw) : fallback;
      if(!Array.isArray(data.done)) data.done = [];
      if(typeof data.lastTitle !== "string") data.lastTitle = "";
      if(typeof data.percent !== "number") data.percent = 0;
      if(typeof data.total !== "number") data.total = 0;
      return data;
    }catch{
      return fallback;
    }
  },

  save(level, data){
    localStorage.setItem(this.key(level), JSON.stringify(data));
  },

  setTotal(level, total){
    const data = this.get(level);
    data.total = Math.max(0, Number(total||0));
    data.percent = data.total
      ? Math.min(100, Math.round((data.done.length / data.total) * 100))
      : 0;
    this.save(level, data);
    return data;
  },

  markDone(level, topicId, topicTitle=""){
    const data = this.get(level);
    const id = String(topicId || "").trim();
    if(!id) return data;

    if(!data.done.includes(id)) data.done.push(id);

    data.lastId = id;
    data.lastTitle = String(topicTitle || "").trim();

    data.percent = data.total
      ? Math.min(100, Math.round((data.done.length / data.total) * 100))
      : data.percent;

    this.save(level, data);
    return data;
  },

  isDone(level, topicId){
    const data = this.get(level);
    return data.done.includes(String(topicId || "").trim());
  }
};
