document.addEventListener("DOMContentLoaded", () => {
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");

  // Symulacja progressu (np. z localStorage)
  const topicsVisited = 3;
  const totalTopics = 10;
  const percent = Math.round((topicsVisited / totalTopics) * 100);
  progressFill.style.width = percent + "%";
  progressText.textContent = `${percent}% · ${topicsVisited}/${totalTopics} temas visitados`;

  // Demo kart tematów
  const grammarList = document.getElementById("grammarList");
  const vocabList = document.getElementById("vocabList");

  const demoGrammar = ["Saludos", "Presentaciones", "Verbos básicos"];
  const demoVocab = ["Números", "Animales", "Comida"];

  demoGrammar.forEach(title => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h4>${title}</h4><p>Lección básica</p>`;
    grammarList.appendChild(card);
  });

  demoVocab.forEach(title => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h4>${title}</h4><p>Vocabulario</p>`;
    vocabList.appendChild(card);
  });
});
