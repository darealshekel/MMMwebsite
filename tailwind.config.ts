import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['"Press Start 2P"', "cursive"],
        mono: ['"Press Start 2P"', "cursive"],
        pixel: ['"Press Start 2P"', "monospace"],
        display: ['"VT323"', "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        glow: {
          primary: "hsl(var(--glow-primary))",
          accent: "hsl(var(--glow-accent))",
          emerald: "hsl(var(--glow-emerald))",
        },
        glass: {
          DEFAULT: "hsl(var(--surface-glass))",
          border: "hsl(var(--surface-glass-border))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          deep: "hsl(var(--gold-deep))",
        },
        silver: {
          DEFAULT: "hsl(var(--silver))",
          deep: "hsl(var(--silver-deep))",
        },
        bronze: {
          DEFAULT: "hsl(var(--bronze))",
          deep: "hsl(var(--bronze-deep))",
        },
        stat: {
          green: "hsl(var(--stat-green))",
          purple: "hsl(var(--stat-purple))",
          cyan: "hsl(var(--stat-cyan))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(40px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 50%": { opacity: "1" },
          "51%, 100%": { opacity: "0" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "podium-rise": {
          "0%": { opacity: "0", transform: "translateY(80px) scaleY(0.85)", transformOrigin: "bottom" },
          "60%": { opacity: "1", transform: "translateY(-6px) scaleY(1.02)" },
          "100%": { opacity: "1", transform: "translateY(0) scaleY(1)" },
        },
        "spotlight-sweep": {
          "0%": { opacity: "0", transform: "translateX(-120%) skewX(-20deg)" },
          "12%": { opacity: "1" },
          "38%": { opacity: "0", transform: "translateX(120%) skewX(-20deg)" },
          "100%": { opacity: "0", transform: "translateX(120%) skewX(-20deg)" },
        },
        "champion-glow": {
          "0%": { boxShadow: "0 0 0 hsl(var(--gold) / 0)", filter: "brightness(1)" },
          "60%": { boxShadow: "0 0 80px hsl(var(--gold) / 0.7)", filter: "brightness(1.15)" },
          "100%": { boxShadow: "0 0 60px -10px hsl(var(--gold) / 0.55)", filter: "brightness(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.6s ease-out forwards",
        "slide-up": "slide-up 0.8s ease-out forwards",
        blink: "blink 1s steps(1) infinite",
        "float-slow": "float-slow 4s ease-in-out infinite",
        "podium-rise": "podium-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both",
        "spotlight-sweep": "spotlight-sweep 4s cubic-bezier(0.22, 1, 0.36, 1) 0.6s infinite both",
        "champion-glow": "champion-glow 2s ease-out 0.4s both",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
