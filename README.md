# Asad Razzaq: academic portfolio

Live site: https://razzaq-asad.github.io

A static, multi-page academic website with an interactive swarm robotics simulator. Plain HTML, CSS and JavaScript: no build step, no frameworks, hosted free on GitHub Pages.

## Pages

| File | Page |
|---|---|
| `index.html` | Home: portrait, floating logo ribbon (each logo links to the institution), news, research overview, awards, gallery preview, contact |
| `research.html` | Research themes, figures from the published studies, the Swarm Lab simulator, research vision (next five years), PhD thesis |
| `publications.html` | Journal articles, conference papers, poster and theses, with filters and "copy citation" |
| `blog.html` | Blog index: six articles, each with an interactive simulation |
| `blog-*.html` | Blog posts (ants and swarm intelligence, robot team composition, genetic algorithms, robot olfaction, knowledge distillation, PhD in Japan from Pakistan) |
| `gallery.html` | Photo albums: Life in Japan, Events & Conferences, Life Moments |
| `cv.html` | CV: bio, education, experience, awards, skills, teaching and mentoring, sports, profiles, CV download |
| `404.html` | Not-found page |

## Editing content: `assets/config.js`

Most changes only need this one file. An empty string `""` hides the item on the site.

| What | How |
|---|---|
| Add a gallery photo | Upload the photo to `assets/gallery/`, then add a line inside `gallery: [...]`:<br>`{ src: "assets/gallery/name.jpg", caption: "...", category: "japan" }` |
| Gallery albums | `"japan"` = Life in Japan, `"events"` = Events & Conferences, `"moments"` = Life Moments |
| Institution logo | Upload the logo to `assets/` and set it in `logos`, e.g. `jst: "assets/logo-jst.png"`.<br>For a white logo use `{ src: "assets/logo.webp", dark: true }`. |
| CV PDF | Replace `assets/Asad_Razzaq_CV.pdf` (same name) or change `cvPdf`. The current file is the website version: no date of birth, references on request. |
| Thesis or defense slides | Set `thesisPdf` or `defenseSlides` (save PowerPoint as PDF first) |
| Paper PDF or talk slides | e.g. `papers: { C4: { slides: "assets/C4-slides.pdf" } }` |
| Profile links | `links: { instagram: "https://www.instagram.com/..." }` |
| Videos | `videos: [{ url: "https://youtu.be/...", title: "..." }]` |

Text on the pages (news, awards, publications, CV entries) is in the `.html` files.

To edit a file on GitHub: open it, click the pencil icon, make the change, then **Commit changes**. The site updates in 1-2 minutes.

## Files in `assets/`

| File | Purpose |
|---|---|
| `config.js` | Photos, links, logos and PDFs used across the site (edit this one) |
| `site.css` | All styles, light and dark theme |
| `site.js` | Shared behaviour: theme toggle, links, logos, PDF viewer, gallery, filters |
| `engine.js` | The Swarm Lab simulator, path planner and genetic algorithm (also runs as a Web Worker) |
| `swarm.js` | Drawing, the live swarms on the home page, the Swarm Lab controls and the robot inspector |
| `blog.js` | The blog demos: ant trails, scouts and carriers, genetic algorithm, odour search, knowledge distillation, checklist |
| `blog/` | Social-media images (1200×630) and card thumbnails for each post |
| `asad-studio.jpg`, `asad-avatar.jpg` | Portraits: home and CV page, small menu icon |
| `logo-*.svg/png/webp` | Institution logos |
| `fig-*.jpg` | Figures from the published studies |
| `gallery/` | Gallery photos |

## The Swarm Lab simulator

A practical version of the question behind my PhD: how should a team of different robots be composed?

- **Mission:** a team enters a building it has never seen, finds three 52 cm packages and pushes them to the dock. A package starts sliding only when at least 3 robots push together (static and sliding friction); off-centre pushes turn it.
- **Scenarios:** warehouse with shelving aisles, disaster site with rubble, open hall.
- **Robots:** 16 cm differential-drive robots, 10 Hz control loop.
  - *Scouts* (12 credits): 360° LiDAR (24 beams, 2.5 m) and a camera (±60°, line of sight); cannot push; 26 cm/s.
  - *Workers* (5 credits): 8-beam IR ring (25 cm); push; 18 cm/s on mapped floor, 9 cm/s in unmapped space.
- **Team budget:** 120 credits.
- **Mapping:** nobody starts with a map. LiDAR and IR returns build a shared 10 cm occupancy grid; unmapped cells are drawn as haze.
- **Communication:** a multi-hop radio mesh connects robots to the base station; walls halve the range. Robots out of range keep their map data and package sightings and upload them when they reconnect; a scout that sees a package while out of range drives back to report it.
- **Planning:** Dijkstra routes on the shared map (re-planned as the map grows), frontier-based exploration, nearest-first task allocation of workers to packages, and a yield rule in narrow aisles.
- **Energy:** driving, sensing, radio transmit power and pushing drain each battery. A robot heads to the charging bay when its charge only just covers the route back (+70 % margin).
- **Score (0-100):** half for packages delivered (partial credit for distance covered), half for finishing early.
- **Evolution:** a genetic algorithm (population 8, 2 layouts per design, 10 generations) searches over the number of scouts, radio range, crew size per package and exploration style. It runs in a Web Worker so the page stays responsive.
- **Robot inspector:** click any robot to see its LiDAR or IR readings, task, radio hops, battery, behaviour state and wheel speeds, live.

The model is simplified (2-D, rule-based controllers). The published studies use evolved neural-network controllers and full physics simulation.

## Status (last updated 27 Oct 2026)

Still to add:
- Gallery photos (Toyama mountains, IRIDIA with Prof. Dorigo, conferences): put them in `assets/gallery/` and list them in `config.js`.
- An Instagram link, if wanted (`links.instagram` in `config.js`).
- Website links for Approsoft, Souya and Iqra College (their logos are shown without a link). In `index.html`, change `<span class="mq-item">` for that entry to `<a class="mq-item" href="URL" target="_blank" rel="noopener">` (and `</span>` to `</a>`) in both copies of the ribbon list.

## Blog

- Each post is one HTML file (`blog-<topic>.html`) with BlogPosting structured data, its own social image in `assets/blog/`, and a demo built by `assets/blog.js` from `<figure class="demo" data-demo="...">`.
- `feed.xml` is the RSS feed; `sitemap.xml` lists every post.
- The demos are small toy models written for the blog. The numbers quoted in the posts come from running them.
- After publishing a new post: add it to `sitemap.xml` and `feed.xml`, then use "Request indexing" in Google Search Console.

## Search engines (SEO)

- Every page has a title, description, canonical URL, Open Graph and Twitter tags, and schema.org JSON-LD (Person, WebSite, ProfilePage, and a ScholarlyArticle list on the publications page). These are generated by the build script, not edited by hand.
- `sitemap.xml` and `robots.txt` are in the root. After a big update, change the `lastmod` dates.
- Google Search Console: add the property `https://razzaq-asad.github.io/`, verify it, submit `sitemap.xml`, and use "Request indexing" for the home page.
- Ranking for your name depends mostly on links from other sites: put the website address in Google Scholar (Homepage), ORCID (Websites), LinkedIn (Contact info), ResearchGate, GitHub (profile website) and the NISAR Lab people page.

## Photo tips

- Use `.jpg` or `.webp`, about 1600 px on the long side and under 500 KB each.
- Ask for permission before posting photos of other people.
