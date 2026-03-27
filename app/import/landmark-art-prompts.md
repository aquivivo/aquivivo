# Ilustracje zabytków (Paszport) — spójny styl jak w referencji (bez postaci)

## Jak to podpiąć w aplikacji

- Pliki: wrzuć ilustracje jako `webp` do `assets/img/landmarks/`.
- Nazewnictwo: **dokładnie** `assets/img/landmarks/<ID>.webp` (ID poniżej).
- Fallback: jeśli obrazka nie ma, aplikacja pokaże `assets/img/landmarks/placeholder.svg`.

## Styl (art direction)

Cel: spójny „travel poster / cinematic illustration” w klimacie jak w referencji:

- ciepłe światło zachodu / złota godzina
- mocno nasycone kolory (pomarańcz + granat/teal)
- wyraźny kontur (ink outline), miękkie malarskie cieniowanie
- delikatne ziarno / tekstura pędzla
- dynamiczna perspektywa, „pocztówkowa” kompozycja
- **bez ludzi / bez postaci / bez twarzy**
- bez napisów, bez logotypów, bez znaków wodnych

## Prompt (szablon — EN)

Użyj tego szablonu i podmień tylko część w nawiasach:

**PROMPT**
> Stylized cinematic travel illustration of **[LANDMARK]** in Poland, golden hour sunset lighting, vibrant saturated colors, teal-blue shadows and warm orange highlights, thick clean ink outlines, painterly brush texture, subtle film grain, high detail, modern poster composition, dramatic sky, environment details, **no people**, **no characters**, **no faces**, **no text**, **no watermark**, **no logos**.

**NEGATIVE (jeśli generator wspiera)**
> people, person, human, face, crowd, text, typography, logo, watermark, brand, lowres, blurry

**Parametry (zalecane)**
- format: `1:1` (np. `1024×1024`)
- kadr: zostaw „safe area” (żeby przycięcie do kwadratu w miniaturze nie ucinało zabytku)

## Lista ID + temat ilustracji

1. `poznan_stary_rynek` — Poznań, Ratusz i Stary Rynek (fasada, wieża, detale)
2. `poznan_ostrow_tumski` — Poznań, Ostrów Tumski (katedra, wyspa, klimat nad Wartą)
3. `wawel` — Kraków, Zamek Królewski na Wawelu (wzgórze, mury)
4. `rynek_glowny` — Kraków, Rynek Główny (plac + Sukiennice w tle)
5. `sukiennice` — Kraków, Sukiennice (arkady, dach, detale)
6. `bazylika_mariacka_krakow` — Kraków, Bazylika Mariacka (dwie wieże, gotyk)
7. `wieliczka` — Kopalnia Soli Wieliczka (podziemia, sól, światło)
8. `malbork` — Zamek w Malborku (cegła, monumentalna bryła)
9. `stare_miasto_warszawa` — Warszawa, Stare Miasto (kamienice, kolory)
10. `lazienki` — Warszawa, Łazienki Królewskie (Pałac na Wyspie, park)
11. `wilanow` — Warszawa, Pałac w Wilanowie (barok, ogród)
12. `palac_kultury` — Warszawa, Pałac Kultury i Nauki (wieżowiec, nocne światło)
13. `dlugi_targ` — Gdańsk, Długi Targ (kamienice, reprezentacyjna ulica)
14. `zuraw_gdanski` — Gdańsk, Żuraw nad Motławą (port, woda)
15. `molo_sopot` — Sopot, molo (morze, linia horyzontu)
16. `hala_stulecia` — Wrocław, Hala Stulecia (kopuła, modernizm)
17. `ostrow_tumski` — Wrocław, Ostrów Tumski (katedra, latarnie)
18. `rynek_wroclaw` — Wrocław, Rynek (kolorowe kamienice)
19. `torun` — Toruń, Stare Miasto (gotyk, cegła)
20. `kopernik_torun` — Toruń, pomnik Kopernika / klimat starówki (bez ludzi)
21. `zamosc` — Zamość, renesansowy rynek (arkady)
22. `jasna_gora` — Częstochowa, Jasna Góra (klasztor, monumentalność)
23. `ksiaz` — Zamek Książ (tarasy, zieleń)
24. `lancut` — Zamek w Łańcucie (pałac, dziedziniec)
25. `moszna` — Zamek w Mosznej (wieże, bajkowa bryła)
26. `ogrodzieniec` — Ruiny zamku Ogrodzieniec (skały, ruiny)
27. `niedzica` — Zamek w Niedzicy (nad Jeziorem Czorsztyńskim)
28. `bialowieza` — Puszcza Białowieska (las, mgła, klimat)
29. `morskie_oko` — Morskie Oko (jezioro + góry, bez ludzi)
30. `giewont` — Giewont (szczyt, chmury, dramatyczne światło)
31. `park_muzakowski` — Park Mużakowski (mosty, zieleń, woda)
32. `tarnowskie_gory` — Zabytkowa Kopalnia / podziemia Tarnowskich Gór
33. `kosciol_pokoju_swidnica` — Kościół Pokoju w Świdnicy (drewniana architektura)
34. `kosciol_pokoju_jawor` — Kościół Pokoju w Jaworze (drewniana architektura)
35. `kalwaria_zebrzydowska` — Kalwaria Zebrzydowska (klasztor, wzgórza)
36. `krzemionki` — Krzemionki (kopalnie krzemienia, kamień, podziemia)
37. `biskupin` — Biskupin (osada, drewniane umocnienia; bez ludzi)
38. `zamek_krolewski_warszawa` — Warszawa, Zamek Królewski (plac Zamkowy)
39. `barbakan_warszawa` — Warszawa, Barbakan (mury, cegła)
40. `kopernik_warszawa` — Warszawa, Centrum Nauki Kopernik (nowoczesna bryła, Wisła)

