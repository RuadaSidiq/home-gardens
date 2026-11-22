import "@fontsource-variable/red-hat-display";
import "@fontsource-variable/red-hat-text";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { getContent } from "@/server/settings";

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getContent("seo.default", { title: "Home Gardens", description: "Garden services, supplies and workshops." });
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: seo.title, template: "%s · Home Gardens" },
    description: seo.description,
    openGraph: { type: "website", siteName: "Home Gardens", title: seo.title, description: seo.description },
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = { themeColor: "#105530", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
