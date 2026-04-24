/** @type {import('tailwindcss').Config} */
export default {
  /* Tout le code source, y compris i18n/ (sinon classes absentes en prod) */
  content: [
    "./index.html",
    "./**/*.{js,jsx,ts,tsx}",
    "!./node_modules/**",
    "!./dist/**",
  ],
  theme: {
    extend: {
      // Avenir (Linotype) : pas de fichier web inclus — s’appuie sur les polices système + repli.
      fontFamily: {
        /* .font-display : voir index.css (guillemets requis pour « Yeseva One » ; Tailwind ne les émet pas). */
        sans: [
          "Poppins",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
