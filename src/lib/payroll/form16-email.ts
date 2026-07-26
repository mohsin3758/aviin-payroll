import type { Form16Data } from '@/lib/payroll/form16';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN');

const row = (label: string, value: string, bold = false) => `
  <tr>
    <td style="padding:4px 0;color:#555;font-size:13px;">${label}</td>
    <td style="padding:4px 0;text-align:right;font-size:13px;${bold ? 'font-weight:600;' : ''}">${value}</td>
  </tr>`;

export function buildForm16EmailHtml(form16: Form16Data): string {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <div style="text-align:center;border-bottom:2px solid #059669;padding-bottom:12px;margin-bottom:16px;">
    <h2 style="margin:0;font-size:18px;">${form16.company.name}</h2>
    ${form16.company.address ? `<p style="margin:4px 0 0;font-size:12px;color:#666;">${form16.company.address}</p>` : ''}
    <div style="margin-top:6px;font-size:11px;color:#999;">
      ${form16.company.pan ? `PAN: ${form16.company.pan} &nbsp;&nbsp;` : ''}${form16.company.tan ? `TAN: ${form16.company.tan}` : ''}
    </div>
    <p style="margin:8px 0 0;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#059669;font-weight:700;">
      Form 16 — Part B — FY ${form16.financialYear}
    </p>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;background:#f9fafb;border-radius:8px;padding:12px;">
    ${row('Employee Name', form16.employee.name, true)}
    ${row('Employee Code', form16.employee.code)}
    ${row('PAN', form16.employee.pan || '—')}
    ${row('Designation', form16.employee.designation || '—')}
  </table>

  <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
    ${row('Gross Salary (Sec 17(1))', fmt(form16.grossSalary.total), true)}
    ${row('Standard Deduction', fmt(form16.deductionsUnderSection16.standardDeduction))}
    ${row('Professional Tax (16(iii))', fmt(form16.deductionsUnderSection16.professionalTax))}
    ${row("Income Chargeable Under 'Salaries'", fmt(form16.incomeChargeableUnderSalaries), true)}
    ${form16.regime === 'old' ? row('Section 80C', fmt(form16.chapterVIA.section80C)) : ''}
    ${form16.regime === 'old' ? row('Section 80D', fmt(form16.chapterVIA.section80D)) : ''}
    ${row('Total Taxable Income', fmt(form16.totalTaxableIncome), true)}
    ${row('Tax on Total Income', fmt(form16.taxComputation.taxOnTotalIncome))}
    ${row('Rebate u/s 87A', '– ' + fmt(form16.taxComputation.rebate87A))}
    ${row('Health & Education Cess (4%)', fmt(form16.taxComputation.cess))}
    ${row('Total Tax Payable', fmt(form16.taxComputation.totalTaxPayable), true)}
  </table>

  <table style="width:100%;border-collapse:collapse;background:#ecfdf5;border-radius:8px;">
    <tr>
      <td style="padding:12px;font-size:14px;font-weight:700;color:#065f46;">Total TDS Deducted</td>
      <td style="padding:12px;text-align:right;font-size:16px;font-weight:700;color:#065f46;">${fmt(form16.tdsDeducted.totalDeducted)}</td>
    </tr>
  </table>

  <p style="text-align:center;font-size:11px;color:#999;margin-top:20px;font-style:italic;">
    This is a system-generated Form 16 Part B and does not require a signature. It does not include
    Part A (TRACES certificate number and challan details), which only the Income Tax Department can issue.
  </p>
</div>`;
}
