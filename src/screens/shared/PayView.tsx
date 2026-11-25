import {useState} from 'react';
import {t} from '../../lib/texts';
import {Icon} from '../../ui/Icon';
import {dayMonth, dayShort, money, timeRange} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {classById, PRICES, TODAY, type SchoolId} from '../../mock/data';
import {answerTeacherPayment, nextPayday, paymentsFor, payRule, type PayRule, periodsOf, ruleFor, teacherPay} from '../../mock/pay';
import {ListRow, MenuText, Skeleton, TextArea, useBriefLoading} from '../../ui/Fields';
import {Sheet, useSheetRoute, useToast} from '../../ui/Layers';

/** One line saying how this school pays, so the amounts can be checked by hand. */
export function schemeLine(rule: PayRule, teacher?: string): string {
    if (rule.scheme === 'perSession') return t('pay.lineSession', {amount: money(teacher ? rule.perSession[teacher] ?? rule.defaultPerSession : rule.defaultPerSession)});
    if (rule.scheme === 'percent') {
        return t('pay.linePercent', {
            percent: rule.percent,
            visit: money(PRICES.find(price => price.kind === 'visit')?.amount ?? 0),
            totalpass: money(rule.totalpassValue),
        });
    }
    return t(rule.emptyPay ? 'pay.lineTiersEmpty' : 'pay.lineTiers', {
        empty: money(rule.emptyPay),
        tiers: rule.tiers.map(tier => `${tier.to === undefined ? t('pay.orMore', {n: tier.from}) : `${tier.from}–${tier.to}`}: ${money(tier.amount)}`).join(' · '),
    });
}

/** A closed period's payment: what the school recorded and whether the teacher confirmed it. */
function PaymentStatus({teacher, school, period, payday, due, viewer}: {
    teacher: string;
    school: SchoolId;
    period: string;
    payday: string;
    due: number;
    viewer: 'teacher' | 'director';
}) {
    const router = useRouter();
    const toast = useToast();
    const flag = useSheetRoute('flag');
    const receiptSheet = useSheetRoute('receipt');
    const [note, setNote] = useState('');
    const [, redraw] = useState(0);
    const entries = paymentsFor(teacher, school, period);
    const last = entries[entries.length - 1];
    const shownReceipt = entries.find(item => item.id === receiptSheet.item);
    const paid = entries.reduce((sum, item) => sum + item.amount, 0);
    const record = () => router.navigate(`/d/teachers/${teacher}/pay/record?period=${period}`);
    if (!last) {
        return viewer === 'director' ? (
            <div className="card">
                <div className="row"><span className="strong">{t('tpayRec.toPay', {amount: money(due)})}</span><span className="chip chip-warning">{t('tpayRec.stateUnpaid')}</span></div>
                <span className="small muted">{t('tpayRec.payday', {when: dayMonth(payday)})}</span>
                <button type="button" className="btn" onClick={record}><Icon name="pay" size={18}/>{t('tpayRec.record')}</button>
            </div>
        ) : <p className="small muted">{t('tpayRec.notYetTeacher', {when: dayMonth(payday)})}</p>;
    }
    const chip = {
        paid: <span className="chip chip-uploaded">{t('tpayRec.statePaid')}</span>,
        confirmed: <span className="chip chip-confirmed">{t('tpayRec.stateConfirmed')}</span>,
        flagged: <span className="chip chip-rejected">{t('tpayRec.stateFlagged')}</span>,
    }[last.state];
    return (
        <div className="card">
            <div className="row"><span className="strong">{t('tpayRec.paidTotal', {amount: money(paid)})}</span>{chip}</div>
            {entries.map(item => (
                <span key={item.id} className="small">{t('tpayRec.entry', {amount: money(item.amount), when: dayMonth(item.date), method: t(`method.${item.method}` as const)})}
                    {item.note ? ` · “${item.note}”` : ''}
                    {item.receipt && <> · <button type="button" className="link-btn" onClick={() => receiptSheet.show(item.id)}>{t('tpayRec.seeReceipt')}</button></>}</span>
            ))}
            {paid !== due && <span className="small muted">{t('tpayRec.calculated', {amount: money(due)})}</span>}
            {last.state === 'flagged' && <span className="small text-rejected">“{last.flagNote}”</span>}
            {viewer === 'teacher' && last.state === 'paid' && (
                <div className="btn-row">
                    <button type="button" className="btn btn-secondary" onClick={() => flag.show()}>{t('tpayRec.notMatching')}</button>
                    <button type="button" className="btn" onClick={() => {
                        answerTeacherPayment(last.id, true);
                        redraw(n => n + 1);
                        toast(t('tpayRec.confirmedToast'));
                    }}>{t('tpayRec.received')}</button>
                </div>
            )}
            {viewer === 'director' && last.state === 'flagged' && (
                <button type="button" className="btn btn-secondary" onClick={record}>{t('tpayRec.recordMore')}</button>
            )}
            <Sheet open={receiptSheet.open} onClose={receiptSheet.close} title={t('tpayRec.receiptTitle')}
                   subtitle={shownReceipt ? t('tpayRec.entry', {amount: money(shownReceipt.amount), when: dayMonth(shownReceipt.date), method: t(`method.${shownReceipt.method}` as const)}) : undefined}>
                {shownReceipt?.receiptUrl ? <img className="receipt-full" src={shownReceipt.receiptUrl} alt={t('tpayRec.receiptAlt')}/>
                    : <div className="proof-image">{t('review.imagePlaceholder')}</div>}
            </Sheet>
            <Sheet open={flag.open} onClose={flag.close} title={t('tpayRec.flagTitle')}
                   footer={<>
                       {note.trim().length < 3 && <p className="hint center">{t('tpayRec.flagNeed')}</p>}
                       <button type="button" className="btn btn-lg" disabled={note.trim().length < 3} onClick={() => {
                           answerTeacherPayment(last.id, false, note.trim());
                           setNote('');
                           flag.close();
                           toast(t('tpayRec.flaggedToast'));
                       }}>{t('tpayRec.flagSend')}</button>
                   </>}>
                <p className="small">{t('tpayRec.flagBody', {amount: money(paid), due: money(due)})}</p>
                <TextArea id="flag-note" label={t('tpayRec.flagNote')} value={note} onChange={setNote}/>
            </Sheet>
        </div>
    );
}

/**
 * A teacher's pay by period (the school's pay days): the students that count and the amount side
 * by side, per class, each class opening its sessions. The teacher sees their own; a director, any
 * teacher's from their file.
 */
export function PayView({teacher, school, viewer = 'teacher'}: { teacher: string; school: SchoolId; viewer?: 'teacher' | 'director' }) {
    const router = useRouter();
    const sheet = useSheetRoute('pay');
    const periods = periodsOf(payRule(school));
    const picked = periods.find(period => period.from === router.query.get('period')) ?? periods[0];
    const rule = ruleFor(school, picked);
    const pay = teacherPay(teacher, school, picked);
    const open = pay.classes.find(item => item.classId === sheet.item);
    const loading = useBriefLoading(`pay-${teacher}`, picked.from);
    return (
        <>
            <div className="heading-pick">{t('pay.periodPick')}<MenuText id="pay-period" label={t('pay.period')} value={picked.from}
                         onChange={value => router.replace(router.withQuery('period', value === periods[0].from ? null : value))}
                         options={periods.map(period => ({
                             value: period.from,
                             label: t(period.current ? 'pay.periodNow' : 'pay.periodPaid', {
                                 from: Number(period.from.slice(8)),
                                 to: dayMonth(period.to),
                                 payday: dayMonth(period.payday),
                             }),
                         }))}/></div>
            {loading ? <><Skeleton rows={3} card/><Skeleton rows={4} card/></> : <>
            <div className="card">
                <div className="two">
                    <div className="stack-sm">
                        <span className="small muted">{t('pay.counted')}</span>
                        <span className="huge num">{pay.counted}</span>
                    </div>
                    <div className="stack-sm">
                        <span className="small muted">{t(picked.current ? 'pay.soFar' : 'pay.paid')}</span>
                        <span className="huge num">{money(pay.amount)}</span>
                    </div>
                </div>
                <span
                    className="small">{t('pay.sessionsLine', {n: pay.sessions})}{pay.covered ? ` · ${t('pay.coveredLine', {n: pay.covered})}` : ''}</span>
                {pay.pending > 0 &&
                    <span className="small">{nextPayday(picked, rule) >= TODAY
                        ? t('pay.pendingLine', {amount: money(pay.pending), n: pay.unpaid, payday: dayMonth(nextPayday(picked, rule))})
                        : t('pay.pendingPaid', {amount: money(pay.pending), payday: dayMonth(nextPayday(picked, rule))})}</span>}
                {picked.current &&
                    <span className="small muted">{t('pay.inProgress', {payday: dayMonth(picked.payday)})}</span>}
            </div>
            {!picked.current && <PaymentStatus teacher={teacher} school={school} period={picked.from} payday={picked.payday} due={pay.amount} viewer={viewer}/>}
            {pay.classes.length === 0 ? <p className="muted">{t('pay.none')}</p> : (
                <ul className="list">
                    {pay.classes.map(item => (
                        <ListRow key={item.classId} title={classById(item.classId).name}
                                 sub={[t('pay.classLine', {sessions: item.sessions.length, n: item.counted}),
                                     item.trial ? t('pay.trialLine', {n: item.trial}) : '',
                                     item.guests ? t('pay.guestLine', {n: item.guests}) : '',
                                     item.unpaid ? t('pay.unpaidLine', {n: item.unpaid}) : ''].filter(Boolean).join(' · ')}
                                 right={<span className="big num">{money(item.amount)}</span>}
                                 onClick={() => sheet.show(item.classId)}/>
                    ))}
                </ul>
            )}
            </>}
            <p className="hint">{schemeLine(rule, teacher)}</p>
            <p className="hint">{t('pay.rules')}</p>
            <Sheet open={sheet.open} onClose={sheet.close} title={open ? classById(open.classId).name : ''}
                   subtitle={open ? t('pay.classLine', {sessions: open.sessions.length, n: open.counted}) : undefined}>
                {open && (
                    <ul className="list">
                        {open.sessions.map(({session, turnout, counted, amount}) => (
                            <ListRow key={session.id}
                                     title={`${dayShort(session.date)} · ${timeRange(session.start, session.end)}`}
                                     sub={[t('pay.turnout', {
                                         n: counted,
                                         totalpass: turnout.totalpass,
                                         cash: turnout.cash
                                     }),
                                         turnout.trial ? t('pay.trialLine', {n: turnout.trial}) : '',
                                         turnout.unpaid ? t('pay.unpaidLine', {n: turnout.unpaid}) : '',
                                         session.substitute === teacher ? t('pay.youCovered') : ''].filter(Boolean).join(' · ')}
                                     right={<span className="num strong">{money(amount)}</span>}/>
                        ))}
                    </ul>
                )}
            </Sheet>
        </>
    );
}
