/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // Avenir (Linotype) : pas de fichier web inclus — s’appuie sur les polices système + repli.
      fontFamily: {
        sans: [
          "Avenir",
          '"Avenir Next"',
          '"Avenir Next Condensed"',
          '"Avenir LT Std"',
          '"Avenir LT Pro"',
          '"Helvetica Neue"',
          "Helvetica",
          "Arial",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
