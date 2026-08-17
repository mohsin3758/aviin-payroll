export interface LeaveApprovalEmailData {
  employee: { name: string; code: string };
  company: { name: string };
  leaveType: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  approvedAt: Date;
  approvedByName: string | null;
}

const row = (label: string, value: string, bold = false) => `
  <tr>
    <td style="padding:4px 0;color:#555;font-size:13px;">${label}</td>
    <td style="padding:4px 0;text-align:right;font-size:13px;${bold ? 'font-weight:600;' : ''}">${value}</td>
  </tr>`;

const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// A record-keeping confirmation emailed to the employee once their leave is approved — a durable,
// external copy of the decision, distinct from the in-app Notification which only ever lives
// inside the portal.
export function buildLeaveApprovalEmailHtml(data: LeaveApprovalEmailData): string {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
  <div style="text-align:center;border-bottom:2px solid #059669;padding-bottom:12px;margin-bottom:16px;">
    <h2 style="margin:0;font-size:18px;">${data.company.name}</h2>
    <p style="margin:8px 0 0;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#059669;font-weight:700;">
      Leave Approved
    </p>
  </div>

  <p style="font-size:14px;">Hi ${data.employee.name},</p>
  <p style="font-size:14px;">Your leave request has been approved. Details below, for your records.</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px;padding:12px;">
    ${row('Employee', `${data.employee.name} (${data.employee.code})`, true)}
    ${row('Leave Type', data.leaveType)}
    ${row('From', fmtDate(data.startDate))}
    ${row('To', fmtDate(data.endDate))}
    ${row('Total Days', String(data.totalDays))}
    ${row('Approved By', data.approvedByName ?? '—')}
    ${row('Approved On', fmtDate(data.approvedAt))}
  </table>

  <p style="text-align:center;font-size:11px;color:#999;margin-top:20px;font-style:italic;">
    This is a system generated confirmation and does not require a signature.
  </p>
</div>`;
}
