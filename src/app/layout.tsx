import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clinic System CRM",
  description: "Next.js frontend for the clinic operations and CRM platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--surface)] text-slate-900">
        {children}
      </body>
    </html>
  );
}
