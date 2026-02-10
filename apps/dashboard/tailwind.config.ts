import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    borderRadius: {
      none: "0px",
      sm: "0px",
      DEFAULT: "0px",
      md: "0px",
      lg: "0px",
      xl: "0px",
      "2xl": "0px",
      "3xl": "0px",
      full: "0px",
    },
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'SF Mono', 'monospace'],
      },
      colors: {
        cyber: {
          cyan: 'rgb(0, 255, 255)',
          magenta: 'rgb(255, 0, 128)',
          green: 'rgb(0, 255, 136)',
          yellow: 'rgb(255, 255, 0)',
          purple: 'rgb(138, 43, 226)',
          bg: {
            primary: 'rgb(5, 5, 15)',
            secondary: 'rgb(10, 10, 25)',
            tertiary: 'rgb(15, 15, 35)',
          },
        },
      },
      animation: {
        'shimmer': 'shimmer 2s linear infinite',
        'loading-slide': 'loading-slide 1s ease-in-out infinite',
        'neon-pulse': 'neon-pulse 2s ease-in-out infinite',
        'glitch': 'glitch 0.3s ease-in-out infinite',
        'flicker': 'flicker 4s linear infinite',
        'text-flicker': 'text-flicker 8s linear infinite',
        'border-flow': 'border-flow 3s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        'loading-slide': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        'neon-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 5px rgba(0, 255, 255, 0.5), 0 0 10px rgba(0, 255, 255, 0.3)',
          },
          '50%': {
            boxShadow: '0 0 10px rgba(0, 255, 255, 0.8), 0 0 20px rgba(0, 255, 255, 0.5), 0 0 30px rgba(0, 255, 255, 0.3)',
          },
        },
        glitch: {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 2px)' },
          '40%': { transform: 'translate(-2px, -2px)' },
          '60%': { transform: 'translate(2px, 2px)' },
          '80%': { transform: 'translate(2px, -2px)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
          '52%': { opacity: '1' },
          '54%': { opacity: '0.9' },
          '56%': { opacity: '1' },
        },
        'text-flicker': {
          '0%, 100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '93%': { opacity: '0.3' },
          '94%': { opacity: '1' },
          '96%': { opacity: '0.5' },
          '97%': { opacity: '1' },
        },
        'border-flow': {
          '0%, 100%': { borderColor: 'rgba(0, 255, 255, 0.5)' },
          '50%': { borderColor: 'rgba(255, 0, 128, 0.5)' },
        },
      },
      boxShadow: {
        'neon-cyan': '0 0 10px rgba(0, 255, 255, 0.3), 0 0 20px rgba(0, 255, 255, 0.2), 0 0 30px rgba(0, 255, 255, 0.1)',
        'neon-magenta': '0 0 10px rgba(255, 0, 128, 0.3), 0 0 20px rgba(255, 0, 128, 0.2), 0 0 30px rgba(255, 0, 128, 0.1)',
        'neon-green': '0 0 10px rgba(0, 255, 136, 0.3), 0 0 20px rgba(0, 255, 136, 0.2), 0 0 30px rgba(0, 255, 136, 0.1)',
      },
    },
  },
  plugins: [],
};

export default config;
