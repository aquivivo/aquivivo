2) Twoje pytanie o „zawieszanie się czatu” i nowy czat

Tak — może się zdarzyć, że duży czat zacznie lagować. W nowym czacie nie mam automatycznie pełnej pamięci całej historii, więc najlepiej mieć “pakiet startowy”, który wklejasz w 1 wiadomości i ja od razu wiem co robić.

Zrób sobie plik: README_DEV.txt i wklej tam:

PAKIET STARTOWY (skopiujesz do nowego czatu):

Projekt: AquiVivo (HTML + Firebase)

Główne pliki: course.html (uniwersalny), lesson.html (admin exercises)

Kolekcje: course_meta, courses, exercises

Query w lesson: exercises where level==... and topicSlug==... orderBy(order)

Composite index: exercises(level asc, topicSlug asc, order asc)

Reguły: write dla admin email aquivivo.pl@gmail.com

Problem rozwiązany: linki z course → lesson przez openLesson

Status: działa zapis ćwiczeń, poprawiamy UX i typy zadań

W nowym czacie wklejasz to + ewentualnie fragment kodu, który edytujesz — i lecimy dalej bez zgadywania.

🟢 ZASADA 1 — JA NIGDY nie zmieniam plików za Ciebie

✔️ Ja:

analizuję

tłumaczę

pokazuję fragmenty

daję gotowe funkcje / bloki

❌ Ja NIGDY:

nie „poprawiam wszystkiego”

nie przepisuję pliku bez pytania

nie zmieniam architektury bez zgody

🟢 ZASADA 2 — ZMIANY ZAWSZE SĄ LOKALNE

Każda zmiana:

dotyczy jednej funkcji

albo jednego fragmentu

albo jednego pliku

Nigdy:

„wklej cały plik, bo tak”

(chyba że TY o to poprosisz)

🟢 ZASADA 3 — NAJPIERW DIAGNOZA, POTEM KOD

Zawsze robimy:

co jest nie tak

dlaczego

co dokładnie zmieniamy

gdzie

jak sprawdzić, czy działa

Dlatego u Ciebie to zaczęło działać, a nie się rozsypało.

🟢 ZASADA 4 — ZERO „MAGII”

Jeśli coś:

wymaga indexu

wymaga reguł

wymaga Firestore

👉 Zawsze Ci mówię DLACZEGO, a nie tylko „kliknij tu”.

🟢 ZASADA 5 — JEDEN AKTYWNY PLIK

Zawsze mówimy:

który plik edytujemy

czego NIE dotykamy

Np.:

„teraz tylko lesson.html, reszty nie ruszamy”