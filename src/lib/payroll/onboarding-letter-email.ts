import type { OnboardingLetterData, LetterType } from "./onboarding-letter";

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

const TITLES: Record<LetterType, string> = {
  offer: "Offer Letter",
  appointment: "Appointment Letter",
  experience: "Experience Letter",
  relieving: "Relieving Letter",
};

function buildBody(data: OnboardingLetterData, letterType: LetterType, joinDate: string, exitDate: string): string {
  switch (letterType) {
    case "offer":
      return `<p>We are pleased to offer you the position of <strong>${data.employee.designation}</strong> in the <strong>${data.employee.department}</strong> department at ${data.company.name}.</p>
        <p>Your date of joining is <strong>${joinDate}</strong> and your Employee Code is <strong>${data.employee.code}</strong>.</p>
        <p>Your annual Cost to Company (CTC) will be <strong>${fmt(data.annualCTC)}</strong>, subject to statutory deductions and company policy.</p>`;
    case "appointment":
      return `<p>Further to your acceptance of our offer, we are pleased to confirm your appointment as <strong>${data.employee.designation}</strong> in the <strong>${data.employee.department}</strong> department at ${data.company.name}, effective ${joinDate}.</p>
        <p>Your Employee Code is <strong>${data.employee.code}</strong> and your annual Cost to Company (CTC) is <strong>${fmt(data.annualCTC)}</strong>, subject to statutory deductions and company policy.</p>`;
    case "experience":
      return `<p>This is to certify that <strong>${data.employee.name}</strong> (Employee Code ${data.employee.code}) was employed with ${data.company.name} as <strong>${data.employee.designation}</strong> in the ${data.employee.department} department from <strong>${joinDate}</strong> to <strong>${exitDate}</strong>.</p>
        <p>During this period, we found their conduct and performance to be satisfactory.</p>
        <p>We wish them the very best in their future endeavors.</p>`;
    case "relieving":
      return `<p>This is to confirm that <strong>${data.employee.name}</strong> (Employee Code ${data.employee.code}), who was working as <strong>${data.employee.designation}</strong> in the ${data.employee.department} department, has been relieved from their duties at ${data.company.name} effective <strong>${exitDate}</strong>.</p>
        <p>All dues have been settled as per the full-and-final settlement process.</p>
        <p>We wish them success in their future endeavors.</p>`;
  }
}

export function buildOnboardingLetterHtml(data: OnboardingLetterData, letterType: LetterType): string {
  const title = TITLES[letterType];
  const joinDate = new Date(data.employee.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const exitDate = data.employee.dateOfExit
    ? new Date(data.employee.dateOfExit).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  return `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:680px;margin:0 auto;color:#222;line-height:1.6;">
  <div style="text-align:center;border-bottom:2px solid #059669;padding-bottom:12px;margin-bottom:20px;">
    <h2 style="margin:0;">${data.company.name}</h2>
    ${data.company.address ? `<p style="margin:4px 0 0;font-size:12px;color:#666;">${data.company.address}</p>` : ""}
  </div>
  <p style="text-align:right;">${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
  <h3 style="text-align:center;text-transform:uppercase;letter-spacing:1px;color:#059669;">${title}</h3>
  <p>${letterType === "experience" || letterType === "relieving" ? "To Whom It May Concern," : `Dear ${data.employee.name},`}</p>
  ${buildBody(data, letterType, joinDate, exitDate)}
  <p style="margin-top:32px;">Warm regards,<br/>Human Resources<br/>${data.company.name}</p>
  <p style="text-align:center;font-size:11px;color:#999;margin-top:32px;font-style:italic;">
    This is a system-generated ${title.toLowerCase()}. A physical/digital signature is not applied here — treat it as a draft
    for HR to countersign through your organization's usual process.
  </p>
</div>`;
}
