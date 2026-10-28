import ClientLinkPage from "@/components/workforce/client-link-page";

export const metadata = { title: "Workforce summary", robots: { index: false, follow: false } };

export default async function ClientPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClientLinkPage token={token} />;
}
