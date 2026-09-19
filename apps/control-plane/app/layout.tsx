import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOG_ON Control Plane",
  description: "Operator console for durable, policy-controlled AI execution."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
