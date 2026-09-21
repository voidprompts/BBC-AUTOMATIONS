import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "BBC Automations — AI Social Asset Studio",
  description:
    "Generate high-converting Facebook & Pinterest marketing assets from a product image, model image, and affiliate link using NVIDIA NIM.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans min-h-screen">
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
