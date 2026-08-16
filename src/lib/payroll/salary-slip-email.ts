import type { SalarySlipData } from '@/lib/payroll/salary-slip';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');

const row = (label: string, value: string, bold = false) => `
  <tr>
    <td style="padding:4px 0;color:#555;font-size:13px;">${label}</td>
    <td style="padding:4px 0;text-align:right;font-size:13px;${bold ? 'font-weight:600;' : ''}">${value}</td>
  </tr>`;

export function buildSalarySlipEmailHtml(slip: SalarySlipData): string {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <div style="text-align:center;border-bottom:2px solid #059669;padding-bottom:12px;margin-bottom:16px;">
    <h2 style="margin:0;font-size:18px;">${slip.company.name}</h2>
    ${slip.company.address ? `<p style="margin:4px 0 0;font-size:12px;color:#666;">${slip.company.address}</p>` : ''}
    <p style="margin:8px 0 0;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#059669;font-weight:700;">
      Salary Slip — ${slip.monthName} ${slip.year}
    </p>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;background:#f9fafb;border-radius:8px;padding:12px;">
    ${row('Employee Name', slip.employee.name, true)}
    ${row('Employee Code', slip.employee.code)}
    ${row('Designation', slip.employee.designation || '—')}
    ${row('Department', slip.employee.department || '—')}
    ${row('Paid Days', `${slip.attendance.paidDays} / ${slip.attendance.daysInMonth}`)}
  </table>

  <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
    <tr>
      <td style="width:50%;vertical-align:top;padding-right:8px;">
        <p style="font-size:12px;font-weight:700;color:#059669;text-transform:uppercase;margin:0 0 6px;">Earnings</p>
        <table style="width:100%;border-collapse:collapse;">
          ${row('Basic', fmt(slip.earnings.basic))}
          ${row('DA', fmt(slip.earnings.dearnessAllowance))}
          ${row('HRA', fmt(slip.earnings.houseRentAllowance))}
          ${row('Conveyance', fmt(slip.earnings.conveyanceAllowance))}
          ${row('Medical', fmt(slip.earnings.medicalAllowance))}
          ${row('Special Allowance', fmt(slip.earnings.specialAllowance))}
          ${row('Overtime', fmt(slip.earnings.overtimeAllowance))}
          ${row('Bonus', fmt(slip.earnings.bonus))}
          ${row('Other Earnings', fmt(slip.earnings.otherEarnings))}
          ${slip.earnings.hiringIncentive > 0 ? row('Hiring Incentive', fmt(slip.earnings.hiringIncentive)) : ''}
          ${row('Total Earnings', fmt(slip.earnings.totalEarnings), true)}
        </table>
      </td>
      <td style="width:50%;vertical-align:top;padding-left:8px;">
        <p style="font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;margin:0 0 6px;">Deductions</p>
        <table style="width:100%;border-collapse:collapse;">
          ${row('Employee PF', fmt(slip.deductions.employeePF))}
          ${row('Employer PF share', fmt(slip.employerContributions.employerPF))}
          ${row('Employee ESI', fmt(slip.deductions.employeeESI))}
          ${row('Employer ESI share', fmt(slip.employerContributions.employerESI))}
          ${row('TDS', fmt(slip.deductions.tds))}
          ${row('Professional Tax', fmt(slip.deductions.professionalTax))}
          ${row('LWF (Employee)', fmt(slip.deductions.lwf))}
          ${row('LWF (Employer share)', fmt(slip.employerContributions.employerLWF))}
          ${row('Other Deductions', fmt(slip.deductions.otherDeductions))}
          ${row('Total Deductions', fmt(slip.deductions.totalDeductions), true)}
        </table>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;background:#ecfdf5;border-radius:8px;">
    <tr>
      <td style="padding:12px;font-size:15px;font-weight:700;color:#065f46;">Net Salary</td>
      <td style="padding:12px;text-align:right;font-size:18px;font-weight:700;color:#065f46;">${fmt(slip.totals.netSalary)}</td>
    </tr>
  </table>

  <p style="text-align:center;font-size:11px;color:#999;margin-top:20px;font-style:italic;">
    This is a system generated salary slip and does not require a signature.
  </p>
</div>`;
}
