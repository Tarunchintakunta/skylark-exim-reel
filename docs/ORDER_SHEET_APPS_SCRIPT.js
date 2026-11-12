// Skylark Exim /order → Google Sheet row + Gmail alert. Paste into Extensions → Apps Script on the order sheet,
// Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone), then set the /exec URL as
// VITE_ORDER_WEBHOOK_URL on Vercel (Production + Preview) and redeploy.
const ALERT_TO = 'info@skylarkexim.com'

function doPost(e) {
  const o = JSON.parse(e.postData.contents)
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
  if (sheet.getLastRow() === 0)
    sheet.appendRow(['Received', 'Reference', 'Company', 'Contact', 'Email', 'Phone', 'Country', 'Items', 'Incoterm', 'Port', 'Ship window', 'Certificates', 'Notes'])
  const items = o.items.map((it, i) => `${i + 1}. ${it.species}, ${it.form}, ${it.grade || '-'}, glaze ${it.glaze}, ${it.packing}, ${it.quantity}`).join('\n')
  sheet.appendRow([new Date(), o.ref, o.company, o.name, o.email, o.phone, o.country, items, o.incoterm, o.port, o.window, o.certs.join(', '), o.notes])
  GmailApp.sendEmail(ALERT_TO, `New order ${o.ref}: ${o.company} (${o.country})`, o.summary, { replyTo: o.email })
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON)
}
