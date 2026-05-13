import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Danhei Admin",
  description: "Panel administrativo Danhei Express",
  applicationName: "Danhei Admin",
};

export const viewport: Viewport = {
  themeColor: "#D1007F",
};

/*
  Keep root layout neutral so each route can define its own surface.
*/
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
