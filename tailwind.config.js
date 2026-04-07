/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./*.{js,jsx,ts,tsx}"],
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
