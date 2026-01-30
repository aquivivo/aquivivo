import { auth, db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const header = document.getElementById("appHeader");
  const userEmail = document.getElementById("userEmail");

  // Nasłuchuj logowania
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // Jeśli nikt nie zalogowany – wracamy do login.html
      window.location.href = "login.html";
      return;
    }

    userEmail.textContent = user.email;

    // 🔹 Pobierz dane użytkownika z Firestore
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      console.log("Dane użytkownika:", userData);

      // przykład: pokaż aktywny poziom
      const levels = Object.keys(userData.access || {});
      document.getElementById("lastActivityTitle").textContent =
        levels.length ? `Nivel activo: ${levels[0]}` : "Sin niveles asignados.";
    } else {
      document.getElementById("lastActivityTitle").textContent =
        "Brak danych użytkownika w Firestore.";
    }
  });

  // Dodaj przycisk wylogowania
  if (header) {
    const btn = document.createElement("button");
    btn.textContent = "Cerrar sesión";
    btn.className = "btn-secondary";
    btn.onclick = async () => {
      await signOut(auth);
      window.location.href = "login.html";
    };
    header.appendChild(btn);
  }
});
