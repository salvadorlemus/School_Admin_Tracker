// What each queued email says. The database queues the kind and its data (dates as ISO, amounts as
// numbers); this writes them in Spanish, the schools' language for now. Emails never carry card or
// health content: they say what happened and link to the app.

export interface Outgoing {
    subject: string;
    html: string;
}

type Vars = Record<string, unknown>;

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const money = (value: unknown) => `$${Number(value ?? 0).toLocaleString('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
})}`;
const day = (value: unknown) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long'
}) : '';
const month = (value: unknown) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', {
    month: 'long',
    year: 'numeric'
}) : '';

const ROLES: Record<string, string> = {
    director: 'dirección',
    teacher: 'maestra o maestro',
    student: 'alumna o alumno',
    guardian: 'tutora o tutor'
};

function page(title: string, body: string, button?: { label: string; url: string }): string {
    return `<!doctype html><html lang="es"><body style="margin:0;background:#F6F4EF;font-family:Inter,Arial,sans-serif;color:#1F1D1A">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="font-size:22px;font-weight:700;color:#2F8F8B;margin:0 0 24px">Lyra</p>
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
<div style="font-size:15px;line-height:1.55">${body}</div>
${button ? `<p style="margin:28px 0"><a href="${esc(button.url)}" style="background:#2F8F8B;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${esc(button.label)}</a></p>` : ''}
<p style="font-size:12px;color:#7A756C;margin-top:32px">Este correo lo envía Lyra (lyra.kokoasoft.com) por tu escuela. Si no esperabas recibirlo, puedes ignorarlo.</p>
</div></body></html>`;
}

/** The email for a queued kind, or null when there's nothing to send for it. */
export function render(kind: string, vars: Vars, appUrl: string): Outgoing | null {
    const school = esc(vars.school_name);
    const open = {label: 'Abrir Lyra', url: appUrl};
    switch (kind) {
        case 'invite': {
            const url = `${appUrl}/#/invite/${encodeURIComponent(String(vars.token))}`;
            return {
                subject: `${vars.inviter ?? 'Tu escuela'} te invita a ${vars.school_name ?? 'Lyra'}`,
                html: page(`Te invitan a ${vars.school_name}`, `<p>${esc(vars.inviter)} te registró en <strong>${school}</strong> como ${esc(ROLES[String(vars.role)] ?? '')}.</p>
<p>Abre el enlace para crear tu contraseña y terminar tu registro. Funciona una sola vez y vence en 24 horas; si vence, pide a tu escuela que te lo reenvíe.</p>
${vars.terms_path ? '<p>Adjuntamos los términos y condiciones de la escuela; los leerás y aceptarás en la app.</p>' : ''}`, {
                    label: 'Crear mi contraseña',
                    url
                }),
            };
        }
        case 'added_to_school': {
            const url = `${appUrl}/#/invite/${encodeURIComponent(String(vars.token))}`;
            return {
                subject: `Te agregaron a ${vars.school_name}`,
                html: page(`Te agregaron a ${vars.school_name}`, `<p>${esc(vars.inviter)} te agregó a <strong>${school}</strong>. Entra con tu cuenta de siempre: llenarás tu tarjeta para esta escuela y aceptarás sus términos (adjuntos).</p>`,
                    {label: 'Continuar', url}),
            };
        }
        case 'proof_rejected':
            return {
                subject: `Tu comprobante fue rechazado · ${vars.school_name}`,
                html: page('Tu comprobante fue rechazado', `<p>${school} revisó tu comprobante y lo rechazó: <em>${esc(vars.reason)}</em></p><p>Sube uno nuevo desde Pagos.</p>`, open),
            };
        case 'proof_confirmed':
            return {
                subject: `Tu pago en efectivo quedó registrado · ${vars.school_name}`,
                html: page('Tu pago quedó registrado', `<p>${school} confirmó tu pago en efectivo${vars.month ? ` de ${esc(month(vars.month))}` : ''}.</p>`, open),
            };
        case 'fee_owed':
            return {
                subject: `Cuota de inscripción pendiente · ${vars.school_name}`,
                html: page('Tienes una cuota de inscripción pendiente', `<p>Pasaron los meses sin pago que marca ${school}, así que se debe otra vez la cuota de inscripción (${esc(money(vars.amount))}). Puedes seguir asistiendo; súbela desde Pagos cuando la pagues.</p>`, open),
            };
        case 'payment_due': {
            const left = Number(vars.days_left);
            const when = left === 0 ? 'hoy' : left === 1 ? 'mañana' : `en ${left} días`;
            return {
                subject: `Tu pago de ${month(vars.month)} vence ${when} · ${vars.school_name}`,
                html: page(`Tu pago vence ${when}`, `<p>Tu mensualidad de ${esc(month(vars.month))} en ${school} vence ${esc(when)}. Cuando pagues, sube tu comprobante desde Pagos.</p>`, open),
            };
        }
        case 'over_plan':
            return {
                subject: `Pasaste las clases de tu plan · ${vars.school_name}`,
                html: page('Pasaste las clases de tu plan', `<p>Llevas ${esc(vars.used)} de ${esc(vars.allowed)} clases de tu plan en ${school}. Puedes seguir viniendo; tu escuela te dirá si hay algo que ajustar.</p>`, open),
            };
        case 'new_terms':
            return {
                subject: `Nuevos términos y condiciones · ${vars.school_name}`,
                html: page('Hay términos nuevos', `<p>${school} subió una versión nueva de sus términos y condiciones. Léelos y acéptalos en la app para seguir usándola en esta escuela.</p>`, open),
            };
        case 'data_countdown':
            return {
                subject: `Tus datos en ${vars.school_name}`,
                html: page('Ya no estás activo en tu escuela', `<p>Dejaste de estar activo en ${school}, así que pierdes el acceso a la escuela y sus beneficios. Guardamos tu tarjeta y tus archivos hasta el ${esc(day(vars.deletes_on))}; ese día se borran.</p>
<p>Si quieres que se borren antes, pídelo desde la app en Cuenta › Quiero que borren mis datos.</p>`, open),
            };
        case 'data_deleted':
            return {
                subject: `Borramos tus datos en ${vars.school_name}`,
                html: page('Tus datos fueron borrados', `<p>Pasaron 3 meses desde que dejaste de estar activo en ${school}: borramos tu tarjeta, tus fotos y tus comprobantes. Para volver, la escuela tendría que inscribirte de nuevo.</p>`),
            };
        case 'deletion_link': {
            const url = `${appUrl}/#/delete-data/${encodeURIComponent(String(vars.token))}`;
            return {
                subject: `Confirma el borrado de tus datos · ${vars.school_name}`,
                html: page('Confirma el borrado de tus datos', `<p>Pediste borrar tus datos de ${school}. Abre el enlace para ver qué se borra y confirmarlo. Vence en 24 horas.</p>`, {
                    label: 'Revisar y confirmar',
                    url
                }),
            };
        }
        default:
            return null;
    }
}
