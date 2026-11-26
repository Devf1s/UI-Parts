import { Geist_Mono } from "next/font/google";

/** Monospace for paths, counters and labels. Every page renders it, so the root layout carries it. */
export const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
