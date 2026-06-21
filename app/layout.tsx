import type { Metadata } from "next";
import "./globals.css";
import DashboardShell from "@/components/DashboardShell";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Enterprise Knowledge Bot",
  description: "Secure, RAG-grounded question answering for internal enterprise documentation.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased font-sans m-0 p-0">
        <DashboardShell>
          {children}
        </DashboardShell>
      </body>
    </html>
  );
}
