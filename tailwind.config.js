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
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          blue: "var(--brand-blue)",
          "blue-deep": "var(--brand-blue-deep)",
          "blue-tint": "var(--brand-blue-tint)",
          orange: "var(--brand-orange-solid)",
          "orange-tint": "var(--brand-orange-tint)",
          "orange-ink": "var(--brand-orange-ink)",
        },
      },
      backgroundImage: {
        "brand-gradient": "var(--brand-gradient)",
        "brand-blue-gradient-h": "var(--brand-blue-gradient-h)",
      },
      ringColor: {
        brand: {
          blue: "var(--brand-blue)",
          "blue-tint": "color-mix(in srgb, var(--brand-blue) 25%, transparent)",
        },
      },
    },
  },
  plugins: [],
};
