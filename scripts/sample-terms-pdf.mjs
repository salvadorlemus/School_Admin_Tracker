// Writes a small sample terms PDF (three pages of placeholder text) to test the terms reader until a
// school uploads its real one. Plain PDF syntax, no dependencies.
//
//   node scripts/sample-terms-pdf.mjs out.pdf "School name"

import {writeFileSync} from 'node:fs';

const [, , out = 'sample-terms.pdf', school = 'La escuela'] = process.argv;
// PDF text uses Latin-1 here: accents are written as their octal codes.
const latin = text => text.replace(/[\\()]/g, char => `\\${char}`).replace(/[^\x20-\x7e]/g, char => `\\${char.charCodeAt(0).toString(8).padStart(3, '0')}`);

const pages = [
    ['Términos y condiciones (muestra)', school, '', 'Este documento es una muestra para probar Lyra.', 'La escuela debe subir sus términos reales desde Términos.'],
    ['1. Clases y seguridad', '', 'Nadie sube a un aparato sin calentar ni sin indicación de su maestra.', 'Avisa de cualquier lesión antes de empezar.'],
    ['2. Datos de salud', '', 'Doy mi consentimiento expreso para que la escuela guarde', 'las condiciones de salud de mi tarjeta (LFPDPPP).', '', 'Fin del documento.'],
];

const objects = [];
const add = body => objects.push(body) && objects.length;
const catalog = add('');
const pagesRef = add('');
const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
const kids = pages.map(lines => {
    const stream = ['BT', '/F1 14 Tf', '60 760 Td', '18 TL', ...lines.map((line, i) => `${i === 0 ? '/F1 18 Tf ' : i === 1 ? '/F1 12 Tf ' : ''}(${latin(line)}) Tj T*`), 'ET'].join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
});
objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`;
objects[pagesRef - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

let pdf = '%PDF-1.4\n';
const offsets = objects.map((body, i) => {
    const at = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
});
const xref = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(out, Buffer.from(pdf, 'latin1'));
console.log(`wrote ${out}`);
