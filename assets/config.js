/* ================================================================
   EDIT HERE. This one file controls photos, links, logos and files
   on every page. Put files in the assets/ folder (photos in
   assets/gallery/) and write the path. Empty "" = hidden on the site.
   ================================================================ */
window.SITE = {
  email: "asad.razzaq@kuas.ac.jp",
  photo: "assets/asad-portrait.jpg",     // home page portrait
  photoFormal: "assets/asad-formal.jpg", // CV page photo
  cvPdf: "",          // "assets/Asad_Razzaq_CV.pdf"  (public version: no date of birth, no referee emails)
  thesisPdf: "",      // "assets/thesis.pdf"
  defenseSlides: "",  // "assets/defense-slides.pdf"  (PowerPoint -> Save as PDF)

  links: {
    scholar: "https://scholar.google.com/citations?user=ZE91v18AAAAJ",
    researchgate: "https://www.researchgate.net/profile/Asad-Razzaq",
    orcid: "https://orcid.org/0009-0004-9389-3481",
    linkedin: "https://www.linkedin.com/in/asadrazzaqphd/",
    semanticscholar: "https://www.semanticscholar.org/author/2238456971",
    github: "https://github.com/RAZZAQ-Asad",
    facebook: "https://www.facebook.com/asu605",
    instagram: ""     // "https://www.instagram.com/your-username/"
  },

  /* Institution logos (optional). Save the official logo file in assets/
     and write its path, e.g. toyama: "assets/logo-toyama.png".
     Until then a clean text card is shown. */
  logos: { kuas: "", toyama: "", iridia: "", jst: "", gcuf: "" },

  papers: {           // pdf = your own manuscript, slides = talk PDF
    J1: { pdf: "", slides: "" }, J2: { slides: "" }, J3: { pdf: "" },
    C1: { pdf: "assets/ANTS2026-Razzaq-Yasuda.pdf", slides: "" },
    C2: { pdf: "", slides: "" }, C3: { pdf: "", slides: "" }, C4: { pdf: "", slides: "" },
    C5: { pdf: "", slides: "" }, C6: { pdf: "", slides: "" }, C7: { pdf: "", slides: "" },
    C8: { pdf: "" }, P1: { pdf: "" }
  },

  /* Gallery. category: "japan" = Life in Japan, "events" = Events & Conferences,
     "moments" = Life Moments. Add as many as you like; newest first looks best. */
  gallery: [
    { src: "assets/gallery/sakura-japan.jpg", caption: "Cherry blossom season in Japan", category: "japan" }
    // { src: "assets/gallery/toyama-mountains.jpg", caption: "Tateyama mountains from Toyama", category: "japan" },
    // { src: "assets/gallery/iridia-dorigo.jpg", caption: "With Prof. Marco Dorigo at IRIDIA, Brussels, 2025", category: "events" },
    // { src: "assets/gallery/phd-graduation.jpg", caption: "PhD graduation, University of Toyama, 2025", category: "moments" },
  ],
  videos: [           // { url: "https://youtu.be/...", title: "Cooperative transport, evolved controller" }
  ]
};
