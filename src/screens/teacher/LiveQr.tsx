import {useEffect, useState} from 'react';
import QRCode from 'qrcode';
import {t} from '../../lib/texts';
import {time} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {supabase} from '../../lib/supabase';
import {appOrigin} from '../../lib/hosts';
import {classById, sessionById, sessionWindow} from '../../mock/data';
import {Icon} from '../../ui/Icon';

/**
 * The session's check-in QR on the real data (rule 6): the database makes the code from the
 * session's secret and the time, every 30 seconds, and only gives it to the session's teacher,
 * substitute and the school's directors. The QR is a link to check-in with the code: a student's
 * own camera app opens it straight in Lyra. The code also shows in letters, to type it.
 */
export function LiveQr({id, back}: { id: string; back: string }) {
    const router = useRouter();
    const session = sessionById(id);
    const [code, setCode] = useState('');
    const [problem, setProblem] = useState('');
    const [left, setLeft] = useState(30 - Math.floor(Date.now() / 1000) % 30);

    useEffect(() => {
        let alive = true;
        const fetchCode = async () => {
            const {data, error} = await supabase.rpc('session_code', {session_id: id});
            if (!alive) return;
            if (error) setProblem(error.message);
            else setCode(String(data));
        };
        void fetchCode();
        // Each tick shows the seconds left; a new 30-second step brings a new code.
        const timer = window.setInterval(() => {
            const remaining = 30 - Math.floor(Date.now() / 1000) % 30;
            setLeft(remaining);
            if (remaining === 30) void fetchCode();
        }, 1000);
        return () => {
            alive = false;
            window.clearInterval(timer);
        };
    }, [id]);

    const link = `${appOrigin()}/#/checkin?code=${code}`;
    const modules = code ? QRCode.create(link, {errorCorrectionLevel: 'M'}).modules : null;
    const size = modules?.size ?? 21;
    const ring = 2 * Math.PI * 22;
    const open = sessionWindow(session);
    return (
        <div className="screen">
            <div className="qr-full">
                <button type="button" className="icon-btn qr-close" aria-label={t('common.close')}
                        onClick={() => router.back(back)}>
                    <Icon name="close"/>
                </button>
                <p className="qr-title">{classById(session.classId).name}</p>
                {problem ? <p className="qr-muted">{t('qr.unavailable')}</p> : (
                    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} width="300" height="300" role="img"
                         aria-label={t('qr.label')}
                         shapeRendering="crispEdges" className="qr-code">
                        {modules && Array.from({length: size * size}, (_, i) => modules.data[i] ?
                            <rect key={i} x={i % size} y={Math.floor(i / size)} width="1" height="1"/> : null)}
                    </svg>
                )}
                <p className="qr-code-text num" aria-label={t('qr.codeLabel')}>{code}</p>
                <div className="row qr-timer">
                    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
                        <circle className="qr-track" cx="26" cy="26" r="22" fill="none" strokeWidth="5"/>
                        <circle className="qr-ring" cx="26" cy="26" r="22" fill="none" strokeWidth="5"
                                strokeLinecap="round"
                                strokeDasharray={ring} strokeDashoffset={ring * (1 - left / 30)}
                                transform="rotate(-90 26 26)"/>
                        <text x="26" y="31" textAnchor="middle" fontSize="15" fontWeight="700">{left}</text>
                    </svg>
                    <span className="qr-muted">{t('qr.renews')}</span>
                </div>
                <p className="qr-muted small">{t('qr.window', {from: time(open.opensAt), to: time(open.qrUntil)})}</p>
            </div>
        </div>
    );
}
