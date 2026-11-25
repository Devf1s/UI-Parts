import { Fredoka } from "next/font/google";

/** Rounded display face of the cartoon index. (The 404 and error pages must not import it: see README.) */
export const fredoka = Fredoka({ variable: "--font-toon", subsets: ["latin"], display: "swap" });
