import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: { default: "HOA Committee Portal", template: "%s · HOA Committee Portal" },
  description: "Organized Committees. Better Decisions.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Committees" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#152340", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
