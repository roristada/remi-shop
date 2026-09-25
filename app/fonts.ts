import { Anuphan, Mitr } from "next/font/google";

// Body: Anuphan — a clean loopless Thai/Latin sans that stays readable at small sizes.
export const anuphan = Anuphan({ subsets: ["thai", "latin"], variable: "--font-anuphan", display: "swap" });

// Headings: Mitr — soft geometric Thai/Latin display face, used for titles and prices only.
export const mitr = Mitr({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mitr",
  display: "swap",
});

export const fontVariables = `${anuphan.variable} ${mitr.variable}`;
