import { Anuphan, Charmonman, Mitr } from "next/font/google";

// Body: Anuphan — a clean loopless Thai/Latin sans that stays readable at small sizes.
export const anuphan = Anuphan({ subsets: ["thai", "latin"], variable: "--font-anuphan", display: "swap" });

// Headings: Mitr — soft geometric Thai/Latin display face, used for titles and prices only.
export const mitr = Mitr({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mitr",
  display: "swap",
});

// Script accent — used sparingly (home hero) for a hand-written feeling line. Has real Thai
// coverage (verified: next/font's Charmonman font-data lists "thai" in its subsets), so it can
// carry Thai copy, not just a decorative Latin aside. One weight only.
export const charmonman = Charmonman({
  subsets: ["thai", "latin"],
  weight: "400",
  variable: "--font-charmonman",
  display: "swap",
});

export const fontVariables = `${anuphan.variable} ${mitr.variable} ${charmonman.variable}`;
