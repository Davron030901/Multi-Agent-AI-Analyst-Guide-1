/** Tailwind CSS v4 is a PostCSS plugin; there is no tailwind.config.ts.
 *  All design tokens live in styles/tokens.css and are bound to utilities
 *  through the `@theme inline` block in app/globals.css. */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
