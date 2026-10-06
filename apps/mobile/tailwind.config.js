const colors = require('@union/shared/src/colors.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // Nécessaire sur le web : sans cela NativeWind lève une erreur en synchronisant le thème du navigateur.
  // L'app suit toujours le thème du système.
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      // Une famille par graisse : sur React Native, font-weight ne choisit pas le bon fichier de police.
      fontFamily: {
        body: ['Nunito_400Regular'],
        semi: ['Nunito_600SemiBold'],
        strong: ['Nunito_700Bold'],
        display: ['Nunito_800ExtraBold'],
      },
    },
  },
  plugins: [],
};
