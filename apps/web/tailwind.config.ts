import type { Config } from "tailwindcss";

// shadcn/ui 호환 Tailwind 설정. CSS 변수 기반 테마 토큰을 사용한다.
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1200px",
      },
    },
    extend: {
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
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "SF Pro Display",
          "Segoe UI",
          "Roboto",
          "Apple SD Gothic Neo",
          "Noto Sans KR",
          "sans-serif",
        ],
      },
      borderRadius: {
        "2xl": "calc(var(--radius) + 4px)",
        xl: "var(--radius)",
        lg: "calc(var(--radius) - 6px)",
        md: "calc(var(--radius) - 10px)",
        sm: "calc(var(--radius) - 14px)",
      },
      fontSize: {
        // 레퍼런스의 히어로 수치 스케일. 큰 숫자 + 작은 라벨 패턴에 쓴다.
        hero: ["3.5rem", { lineHeight: "1", letterSpacing: "-0.03em" }],
        stat: ["2.75rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        label: ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.08em" }],
      },
      boxShadow: {
        glass:
          "inset 0 1px 0 0 hsla(0, 0%, 100%, 0.10), 0 12px 32px -18px hsla(0, 0%, 0%, 0.9)",
        elevated:
          "inset 0 1px 0 0 hsla(0, 0%, 100%, 0.12), 0 24px 60px -24px hsla(0, 0%, 0%, 0.95)",
        glow: "0 0 24px -4px hsla(0, 84%, 55%, 0.5)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { opacity: "0.7", transform: "scale(0.9)" },
          "70%": { opacity: "0", transform: "scale(2.2)" },
          "100%": { opacity: "0", transform: "scale(2.2)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
