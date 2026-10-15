import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shared To-Do",
  description:
    "A simple shared to-do list — add, edit, and complete tasks together, synced with Upstash Redis.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
