/**
 * Babel configuration for the mobile app.
 *
 * `babel-preset-expo` is what turns the TypeScript and the JSX into something
 * Jest and Metro can both run. Metro picks this up automatically; Jest needs
 * it through the `jest-expo` preset.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
