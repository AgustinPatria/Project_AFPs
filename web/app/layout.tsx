import type { Metadata } from "next";
import "./globals.css";
import { CommandPalette } from "@/components/command-palette";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "AFP Chile — Alternative Assets",
  description: "Dashboard de activos alternativos AFP Chile",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex bg-background text-foreground">
        <Sidebar />
        <div className="flex-1 min-w-0">{children}</div>
        <CommandPalette />
      </body>
    </html>
  );
}
