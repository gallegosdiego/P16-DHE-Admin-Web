import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Danhei Admin",
    short_name: "Danhei",
    description: "Panel administrativo de Danhei Express",
    start_url: "/login",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#D1007F",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
