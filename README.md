# Asad Razzaq: portfolio website

Single-page academic site with a live swarm robotics demo (Swarm Lab). Plain HTML, no build step.

## 1. GitHub Pages pe free host (10 minute)

1. github.com pe account banao (agar nahi hai). Username yaad rakho, misal `asadrazzaq`.
2. **New repository** banao. Naam bilkul yeh rakho: `asadrazzaq.github.io` (apna username lagao).
   Public rakho.
3. **Add file → Upload files**. Is folder ki saari cheezain drag karo (`index.html`, `assets/` folder, `README.md`). **Commit changes**.
4. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
5. 1-2 minute baad site live: `https://asadrazzaq.github.io`

HTTPS khud mil jata hai. Kuch bhi update karna ho: file dobara upload karo, 1 minute mein live.

## 2. Apni files kaise add karein

Sab files `assets/` folder mein daalo, phir `index.html` kholo, upar `const SITE = {` dhoondo, aur path likh do.
Jo khaali `""` rahe ga woh site pe nahi dikhe ga.

| Cheez | File | SITE mein |
|---|---|---|
| Photo (square, ~600px) | `assets/photo.jpg` | `photo: "assets/photo.jpg"` |
| CV | `assets/Asad_Razzaq_CV.pdf` | `cvPdf: "assets/Asad_Razzaq_CV.pdf"` |
| PhD thesis | `assets/thesis.pdf` | `thesisPdf: "assets/thesis.pdf"` |
| Defense PPT | PowerPoint → File → Save As → **PDF** → `assets/defense-slides.pdf` | `defenseSlides: "assets/defense-slides.pdf"` |
| Conference PPT | e.g. `assets/C4-slides.pdf` | `papers: { C4: { slides: "assets/C4-slides.pdf" } }` |
| Paper PDF | e.g. `assets/J1.pdf` | `papers: { J1: { pdf: "assets/J1.pdf" } }` |
| Pictures | `assets/gallery/arena.webp` | `gallery: [{ src: "assets/gallery/arena.webp", caption: "..." }]` |
| Videos | YouTube (unlisted) pe upload | `videos: [{ url: "https://youtu.be/...", title: "..." }]` |
| Scholar / ORCID / GitHub | link | `links: { scholar: "...", orcid: "..." }` |

PDF aur slides site ke andar viewer mein khulte hain. Gallery/Videos section tab hi dikhta hai jab koi item ho.

## 3. Copyright: dhyan rakho

- **J1 (Springer, Artificial Life and Robotics):** apna *accepted manuscript* (apna final Word/LaTeX version) PDF dal sakte ho. Springer ka published PDF mat dalo.
- **J2 (JRM):** open access hai, DOI link already laga hai. PDF upload ki zaroorat nahi.
- Conference papers: har publisher ki policy alag; shak ho to sirf slides dalo.
- Thesis: University of Toyama repository mein ho to wahan ka link bhi theek hai.

## 4. Size tips

- Pictures `.webp` ya compressed `.jpg`, har ek 300 KB se kam.
- Badi videos repo mein na rakho; YouTube use karo.
- GitHub Pages site ki limit 1 GB hai.

## 5. Baad mein custom domain (optional)

`asadrazzaq.com` jaisa domain lo (~¥1,500/saal), Cloudflare (free) pe DNS, phir Settings → Pages → Custom domain.
