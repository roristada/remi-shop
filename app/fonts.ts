import { Noto_Sans_Thai, Nunito } from "next/font/google";

export const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });

export const notoThai = Noto_Sans_Thai({
  subsets: ["thai"],
  variable: "--font-noto-thai",
  display: "swap",
});

export const fontVariables = `${nunito.variable} ${notoThai.variable}`;
