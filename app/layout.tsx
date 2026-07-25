import "@radix-ui/themes/styles.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "co-prompt", description: "Build software together with AI" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
