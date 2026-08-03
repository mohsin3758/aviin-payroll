import OnboardingForm from "@/components/onboarding/onboarding-form";

export default async function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OnboardingForm token={token} />;
}
