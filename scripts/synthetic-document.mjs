/** Valid one-page PDF for local QA. No contract terms, personal data, or signatures. */
export function syntheticDocument(label = "SYNTHETIC QA ONLY - NOT A LEASE") {
  if (!/^[A-Za-z0-9 .:_-]{1,100}$/.test(label))
    throw new Error("Use an ASCII QA-only label.");
  const stream = `BT /F1 16 Tf 50 730 Td (${label}) Tj ET\n`,
    objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    ];
  let body = "%PDF-1.4\n",
    offsets = [0];
  for (let n = 0; n < objects.length; n++) {
    offsets.push(Buffer.byteLength(body));
    body += `${n + 1} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body));
}
