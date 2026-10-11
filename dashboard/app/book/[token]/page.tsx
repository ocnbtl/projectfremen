import type { Metadata } from "next";
import BookingPage from "../../../components/planning/BookingPage";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a time · Unigentamos", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <BookingPage token={(await params).token} />;
}
