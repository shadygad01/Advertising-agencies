import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "مخطط مصروف الدعاية والإعلانات", description: "نظام تنظيم العقود والأقساط والمدفوعات لشركات الدعاية والإعلان" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ar" dir="rtl"><body>{children}</body></html>; }
