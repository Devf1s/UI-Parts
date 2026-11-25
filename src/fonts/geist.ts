import { Geist } from "next/font/google";

/** UI sans for the portfolio and the lab. Cyrillic is preloaded too: project descriptions use it. */
export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"], display: "swap" });
