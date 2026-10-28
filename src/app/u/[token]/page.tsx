import ContractorLinkPage from "@/components/workforce/contractor-link-page";

export const metadata = { title: "Daily check-in", robots: { index: false, follow: false } };

export default async function ContractorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ContractorLinkPage token={token} />;
}
