/** @type {import('tailwindcss').Config} */
import daisyui from 'daisyui';
import daisyuiThemes from 'daisyui/src/theming/themes.js';

export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse': 'pulse 2s ease-in-out infinite',
        'fadeInPulse': 'fadeInPulse 0.3s ease-in-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        pulse: {
            '0%, 100%': { opacity: '0.8', transform: 'scale(1)' },
            '50%': { opacity: '0.4', transform: 'scale(0.9)' }
        },
        fadeInPulse: {
          '0%': { opacity: '0', transform: 'scale(0.8)' },
          '20%': { opacity: '0.8', transform: 'scale(1)' },
          '80%': { opacity: '0.8', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.8)' }
        },
      },
      fontFamily: {
        'crimson': ['"Crimson Text"', 'serif'],
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: [{
      night: {
        ...daisyuiThemes["night"],
        "base-100": "#14181c", // Main background
        "base-200": "#1c2228", // Slightly lighter background for cards
        "base-300": "#272d34", // Even lighter for hover states
        "base-content": "#ffffff", // Main text color
        
        "primary": "#00ac1c", // Main green
        "primary-focus": "#009919", // Darker green for hover
        "primary-content": "#ffffff", // Text on primary color
  
        "secondary": "#1c2228", // For secondary elements
        "accent": "#ff8000", // Our new amber accent
        "accent-focus": "#e67300", // Slightly darker amber for hover
        
        "success": "#00ac1c", // Success state (same as primary)
        "warning": "#ff8000", // Using our amber for warnings
        "error": "#dc2626", // Error state (red)
        
        "neutral": "#272d34", // Neutral elements
        "neutral-focus": "#323a43", // Hover state for neutral
        
        "--rounded-box": "0.5rem",
        "--rounded-btn": "0.3rem",
      },
    }],
    darkTheme: "night",
  }
}