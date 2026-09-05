import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Danhei Admin",
  description: "Panel administrativo Danhei Express",
  applicationName: "Danhei Admin",
  icons: {
    icon: [
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/favicon-login.png", sizes: "256x256", type: "image/png" },
    ],
    shortcut: "/favicon-64.png",
    apple: "/favicon-64.png",
  },
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
      className={`h-full antialiased ${inter.variable} ${spaceGrotesk.variable}`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
