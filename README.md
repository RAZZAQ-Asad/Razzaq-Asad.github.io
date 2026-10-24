# Asad Razzaq: academic portfolio

Live: https://razzaq-asad.github.io

Pages: `index.html` (Home), `research.html` (Research, Swarm Lab, Thesis), `publications.html`, `gallery.html`, `cv.html`.
Plain HTML, CSS and JavaScript. No build step.

## Sab kuch ek file se badlo: `assets/config.js`

| Kya | Kaise |
|---|---|
| Nayi photo gallery mein | Photo `assets/gallery/` mein upload karo, phir `config.js` mein `gallery:` ke andar ek line: `{ src: "assets/gallery/naam.jpg", caption: "...", category: "japan" }` |
| Gallery categories | `"japan"` = Life in Japan, `"events"` = Events & Conferences, `"moments"` = Life Moments |
| University logo | Logo file `assets/` mein (misal `logo-toyama.png`), phir `logos: { toyama: "assets/logo-toyama.png" }` |
| CV PDF | `assets/Asad_Razzaq_CV.pdf` upload karo, `cvPdf: "assets/Asad_Razzaq_CV.pdf"` (public CV mein date of birth aur referees ke emails na rakho) |
| Thesis / defense slides | `thesisPdf`, `defenseSlides` |
| Paper PDF / slides | `papers: { C4: { slides: "assets/C4-slides.pdf" } }` |
| Instagram ya koi aur link | `links: { instagram: "https://www.instagram.com/..." }` |
| YouTube video | `videos: [{ url: "https://youtu.be/...", title: "..." }]` |

GitHub pe file edit: file kholo → pencil icon → change → **Commit changes**. 1-2 minute mein site update.

## Photo tips
- `.jpg` ya `.webp`, lambi side ~1600px, har photo 500 KB se kam.
- Doosre logon ki photos (lab, conference) unki marzi se lagao.
