/** @type {import('tailwindcss').Config} */
export default {
  content: ["./popup.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tesco: "#005EB8",
        patels: "#E87722",
        global: "#2E7D32",
      },
    },
  },
  plugins: [],
};
