import {currentSchool} from '../../state/school';
import {useRef, useState} from 'react';
import {t} from '../../lib/texts';
import {dayMonth, money, personName} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {PERSONAL, STAFF_ME, TEACHERS, teacherSchools, TODAY} from '../../mock/data';
import {paymentsFor, paymentState, payRule, type PayRule, type PayScheme, periodsOf, recordTeacherPayment, saveRule, teacherPay} from '../../mock/pay';
import {Screen} from '../../ui/Screen';
import {Avatar, DateField, ListRow, MenuText, MoneyField, NumberField, SelectField, TextArea, TextField} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import {Sheet, useConfirm, useToast} from '../../ui/Layers';
import {PayView, schemeLine} from '../shared/PayView';
import {platformBillingPaused} from '../../mock/admin';

const digits = (value: string) => Number(value.replace(/\D/g, '')) || 0;
const copyRule = (rule: PayRule): PayRule => ({
    ...rule,
    perSession: {...rule.perSession},
    tiers: rule.tiers.map(tier => ({...tier})),
});

/**
 * How the school pays its teachers: the pay days and one of three schemes (a fixed amount per
 * session, a share of what the students paid, or an amount by how many students came). Below, what
 * each teacher would get this period with the rule as it's being edited, to compare before saving.
 */
export function PaySettings() {
    const router = useRouter();
    const paused = platformBillingPaused(currentSchool());
    const toast = useToast();
    const confirm = useConfirm();
    const [originalRule] = useState(() => copyRule(payRule(currentSchool())));
    const [rule, setRule] = useState<PayRule>(() => copyRule(payRule(currentSchool())));
    const [tierIds, setTierIds] = useState(() => originalRule.tiers.map((_, index) => `initial-${index}`));
    const [editingTierId, setEditingTierId] = useState<string | null>(null);
    const nextTierId = useRef(0);
    const set = (change: Partial<PayRule>) => setRule(current => ({...current, ...change}));
    const teachers = TEACHERS.filter(teacher => teacher.status === 'active' && teacherSchools(teacher).includes(currentSchool()));
    const period = periodsOf(rule)[0];
    const last = rule.tiers.length - 1;
    const editingTierIndex = tierIds.findIndex(id => id === editingTierId);
    const editingTier = editingTierIndex >= 0 ? rule.tiers[editingTierIndex] : undefined;
    // A range's problem, if any: it must follow the one before (starting at 1), end after it starts, and pay something.
    const tierProblem = (i: number): string | null => {
        const tier = rule.tiers[i];
        const start = i === 0 ? 1 : (rule.tiers[i - 1].to ?? 0) + 1;
        // While the range before has no end yet, that one says so.
        if (tier.from !== start && (i === 0 || rule.tiers[i - 1].to)) return t('tpaySet.tierStart', {n: start});
        if (i !== last && (!tier.to || tier.to < tier.from)) return t('tpaySet.tierEnd', {n: tier.from});
        return null;
    };
    const tiersOk = rule.tiers.every((tier, i) => tier.amount > 0 && !tierProblem(i));
    const tiersChanged = rule.tiers.length !== originalRule.tiers.length || rule.tiers.some((tier, i) => {
        const original = originalRule.tiers[i];
        return !original || tier.from !== original.from || tier.to !== original.to || tier.amount !== original.amount;
    });
    const tierValueChanged = (i: number, field: 'from' | 'to' | 'amount') => {
        const id = tierIds[i];
        const tier = rule.tiers[i];
        if (!id || !tier) return true;
        if (!id.startsWith('initial-')) return (tier[field] ?? 0) > 0;
        const original = originalRule.tiers[Number(id.slice('initial-'.length))];
        return !original || tier[field] !== original[field];
    };
    const comparePay = rule.scheme === 'tiers' && (
        originalRule.scheme !== 'tiers' || tiersChanged || rule.emptyPay !== originalRule.emptyPay
    );
    const ready = rule.scheme === 'perSession' ? rule.defaultPerSession > 0
        : rule.scheme === 'percent' ? rule.percent > 0 && rule.percent <= 100 && rule.totalpassValue > 0 : tiersOk;
    // Each number is the director's to type; the next range's start follows a range's end only while it still followed it.
    const setTier = (i: number, change: { from?: number; to?: number; amount?: number }) => set({
        tiers: rule.tiers.map((tier, j) => j === i ? {...tier, ...change}
            : j === i + 1 && change.to !== undefined && (!tier.from || tier.from === (rule.tiers[i].to ?? 0) + 1) ? {...tier, from: change.to + 1} : tier),
    });
    // A new range goes before the last ("or more") one, starting where the one before ends, the rest to fill in.
    const addTier = () => {
        const start = last === 0 ? 1 : (rule.tiers[last - 1].to ?? 0) + 1;
        const id = `new-${nextTierId.current++}`;
        setTierIds([...tierIds.slice(0, last), id, tierIds[last]]);
        set({tiers: [...rule.tiers.slice(0, last), {from: start, to: 0, amount: 0}, {...rule.tiers[last], from: 0}]});
        setEditingTierId(id);
    };
    const removeTier = (i: number) => {
        const tiers = rule.tiers.filter((_, j) => j !== i);
        setTierIds(tierIds.filter((_, j) => j !== i));
        setEditingTierId(null);
        set({
            tiers: tiers.map((tier, j) => j === 0 ? {...tier, from: 1} : {
                ...tier,
                from: (tiers[j - 1].to ?? 0) + 1
            })
        });
    };

    return (
        <Screen title={t('tpaySet.title')} back="/d/more" nav={false}
                note={paused ? t('billing.growthPaused') : ready ? t('tpaySet.note', {
                    from: dayMonth(period.from),
                    to: dayMonth(period.to)
                }) : t('tpaySet.missing')}
                footer={<button type="button" className="btn btn-lg" disabled={paused || !ready} onClick={async () => {
                    if (await confirm({
                        title: t('tpaySet.confirmTitle'),
                        body: t('tpaySet.confirmBody', {from: dayMonth(period.from), to: dayMonth(period.to)}),
                        confirm: t('form.saveChanges'),
                    })) {
                        saveRule(currentSchool(), rule);
                        PERSONAL.t.unshift({
                            id: `pay-rule-${Date.now()}`,
                            school: currentSchool(),
                            date: TODAY,
                            unread: true,
                            text: 'personal.payRule',
                            vars: {line: schemeLine(rule)}
                        });
                        toast(t('tpaySet.saved'));
                        router.back('/d/more');
                    }
                }}>{t('form.saveChanges')}</button>}>
            {paused && <div className="banner banner-error">{t('billing.growthPaused')}</div>}
            <SelectField id="tp-days" label={t('tpaySet.days')} value={rule.days} disabled={paused}
                         onChange={value => set({days: value === 'month' ? 'month' : 'half'})}
                         options={[{
                             value: 'half',
                             label: t('tpaySet.half'),
                             hint: t('tpaySet.halfHint')
                         }, {value: 'month', label: t('tpaySet.month'), hint: t('tpaySet.monthHint')}]}/>
            <SelectField id="tp-scheme" label={t('tpaySet.scheme')} value={rule.scheme} disabled={paused}
                         onChange={value => set({scheme: value as PayScheme})}
                         options={[
                             {value: 'perSession', label: t('tpaySet.perSession'), hint: t('tpaySet.perSessionHint')},
                             {value: 'percent', label: t('tpaySet.percent'), hint: t('tpaySet.percentHint')},
                             {value: 'tiers', label: t('tpaySet.tiers'), hint: t('tpaySet.tiersHint')},
                         ]}/>
            {rule.scheme === 'perSession' && (
                <>
                    <MoneyField id="tp-default" label={t('tpaySet.default')}
                                value={rule.defaultPerSession ? String(rule.defaultPerSession) : ''}
                                disabled={paused}
                                onChange={event => set({defaultPerSession: digits(event.target.value)})}
                                hint={t('tpaySet.defaultHint')}/>
                    <h2 className="section-title">{t('tpaySet.perTeacher')}</h2>
                    {teachers.map(teacher => (
                        <MoneyField key={teacher.id} id={`tp-${teacher.id}`} label={teacher.name}
                                    value={rule.perSession[teacher.id] ? String(rule.perSession[teacher.id]) : ''}
                                    disabled={paused}
                                    placeholder={t('tpaySet.usesDefault', {amount: money(rule.defaultPerSession)})}
                                    onChange={event => {
                                        const amount = digits(event.target.value);
                                        const perSession = {...rule.perSession};
                                        if (amount) perSession[teacher.id] = amount;
                                        else delete perSession[teacher.id];
                                        set({perSession});
                                    }}/>
                    ))}
                </>
            )}
            {rule.scheme === 'percent' && (
                <>
                    <NumberField id="tp-percent" label={t('tpaySet.share')}
                                 value={rule.percent ? String(rule.percent) : ''}
                                 disabled={paused}
                                 onChange={event => set({percent: Math.min(100, digits(event.target.value))})}
                                 hint={t('tpaySet.shareHint', {school: 100 - rule.percent})}/>
                    <MoneyField id="tp-totalpass" label={t('tpaySet.totalpass')}
                                value={rule.totalpassValue ? String(rule.totalpassValue) : ''}
                                disabled={paused}
                                onChange={event => set({totalpassValue: digits(event.target.value)})}
                                hint={t('tpaySet.totalpassHint')}/>
                    <p className="hint">{t('tpaySet.percentHow')}</p>
                </>
            )}
            {rule.scheme === 'tiers' && (
                <>
                    <p className="small muted">{t('tpaySet.changedHint')}</p>
                    <ul className="list">
                        {rule.tiers.map((tier, i) => (
                            <ListRow key={tierIds[i]} title={
                                <span className="tier-summary">
                                    <span>{i === last ? t('pay.orMore', {n: tier.from || '…'}) : t('tpaySet.tierRange', {
                                        from: tier.from || '…',
                                        to: tier.to || '…'
                                    })}</span>
                                    {(tierValueChanged(i, 'from') || (i !== last && tierValueChanged(i, 'to'))) &&
                                        <span className="tier-change-mark" title={t('tpaySet.changed')} role="img" aria-label={t('tpaySet.changed')}/>}
                                </span>
                            } right={
                                <span className="tier-summary-pay">
                                    {tierValueChanged(i, 'amount') && <span className="tier-change-mark" title={t('tpaySet.changed')} role="img" aria-label={t('tpaySet.changed')}/>}
                                    <span>{money(tier.amount)}{t('tpaySet.perSessionSuffix')}</span>
                                </span>
                            }
                                     onClick={() => setEditingTierId(tierIds[i])}/>
                        ))}
                    </ul>
                    <button type="button" className="btn btn-secondary" disabled={paused} onClick={addTier}><Icon
                        name="plus"/>{t('tpaySet.addTier')}</button>
                    <Sheet open={Boolean(editingTier)} onClose={() => setEditingTierId(null)}
                           title={editingTier ? (editingTierIndex === last
                               ? t('pay.orMore', {n: editingTier.from || '…'})
                               : t('tpaySet.tierRange', {from: editingTier.from || '…', to: editingTier.to || '…'})) : ''}
                           footer={<button type="button" className="btn btn-lg" onClick={() => setEditingTierId(null)}>{t('common.done')}</button>}
                           actions={rule.tiers.length > 2 && <button type="button" className="icon-btn" aria-label={t('form.remove')}
                               disabled={paused}
                               onClick={() => editingTierIndex >= 0 && removeTier(editingTierIndex)}><Icon name="trash" size={18}/></button>}>
                        {editingTier && (
                            <>
                                <div className="tier-editor-range">
                                    <div className="tier-field" data-changed={tierValueChanged(editingTierIndex, 'from') || undefined}>
                                        <NumberField id="tp-edit-from" label={t('tpaySet.from')} value={editingTier.from ? String(editingTier.from) : ''}
                                                     disabled={paused}
                                                     onChange={event => setTier(editingTierIndex, {from: digits(event.target.value)})}/>
                                        {tierValueChanged(editingTierIndex, 'from') && <span className="tier-change-mark" title={t('tpaySet.changed')} role="img" aria-label={t('tpaySet.changed')}/>}
                                    </div>
                                    <div className="tier-field" data-changed={editingTierIndex !== last && tierValueChanged(editingTierIndex, 'to') || undefined}>
                                        {editingTierIndex === last ? <TextField id="tp-edit-to" label={t('tpaySet.upTo')} value={t('tpaySet.orMoreShort')} disabled/> : (
                                            <NumberField id="tp-edit-to" label={t('tpaySet.upTo')}
                                                         value={editingTier.to ? String(editingTier.to) : ''}
                                                         disabled={paused}
                                                         onChange={event => setTier(editingTierIndex, {to: digits(event.target.value)})}/>
                                        )}
                                        {editingTierIndex !== last && tierValueChanged(editingTierIndex, 'to') && <span className="tier-change-mark" title={t('tpaySet.changed')} role="img" aria-label={t('tpaySet.changed')}/>}
                                    </div>
                                </div>
                                <div className="tier-field" data-changed={tierValueChanged(editingTierIndex, 'amount') || undefined}>
                                    <MoneyField id="tp-edit-amount" label={t('tpaySet.perSessionPay')}
                                                value={editingTier.amount ? String(editingTier.amount) : ''}
                                                disabled={paused}
                                                onChange={event => setTier(editingTierIndex, {amount: digits(event.target.value)})}/>
                                    {tierValueChanged(editingTierIndex, 'amount') && <span className="tier-change-mark" title={t('tpaySet.changed')} role="img" aria-label={t('tpaySet.changed')}/>}
                                </div>
                                {tierProblem(editingTierIndex) && <div className="banner banner-error small">{tierProblem(editingTierIndex)}</div>}
                            </>
                        )}
                    </Sheet>
                    <MoneyField id="tp-empty" label={t('tpaySet.empty')} value={rule.emptyPay ? String(rule.emptyPay) : ''}
                                disabled={paused}
                                placeholder={t('tpaySet.emptyNone')} onChange={event => set({emptyPay: digits(event.target.value)})} hint={t('tpaySet.emptyHint')}/>
                </>
            )}
            <p className="hint">{t('pay.rules')}</p>
            <h2 className="section-title">{t('tpaySet.preview', {
                from: Number(period.from.slice(8)),
                to: dayMonth(period.to)
            })}</h2>
            <ul className="list">
                {teachers.map(teacher => {
                    const pay = teacherPay(teacher.id, currentSchool(), period, rule);
                    const originalPay = comparePay ? teacherPay(teacher.id, currentSchool(), period, originalRule) : null;
                    return (
                        <ListRow key={teacher.id} left={<Avatar name={teacher.name}/>} title={personName(teacher.name)}
                                 sub={t('tpaySet.previewSub', {n: pay.counted, sessions: pay.sessions})}
                                 right={originalPay
                                     ? <span className="row">
                                         <span className="small num muted" aria-label={t('tpaySet.previousAmount', {amount: money(originalPay.amount)})}>{money(originalPay.amount)}</span>
                                         <span className="small muted" aria-hidden="true">→</span>
                                         <span className="big num" aria-label={t('tpaySet.newAmount', {amount: money(pay.amount)})}>{money(pay.amount)}</span>
                                     </span>
                                     : <span className="big num">{money(pay.amount)}</span>}/>
                    );
                })}
            </ul>
            <p className="hint">{t('tpaySet.previewHint')}</p>
        </Screen>
    );
}

/** A teacher's pay, from their file (the same view the teacher has). */
export function TeacherPayScreen({id}: { id: string }) {
    const teacher = TEACHERS.find(item => item.id === id) ?? TEACHERS[0];
    return (
        <Screen title={t('tpaySet.theirPay')} subtitle={personName(teacher.name)} back={`/d/teachers/${id}`} nav={false}>
            <PayView teacher={teacher.id} school={currentSchool()} viewer="director"/>
        </Screen>
    );
}

const stateChip = (state: ReturnType<typeof paymentState>) => ({
    unpaid: <span className="chip chip-warning">{t('tpayRec.stateUnpaid')}</span>,
    paid: <span className="chip chip-uploaded">{t('tpayRec.statePaid')}</span>,
    confirmed: <span className="chip chip-confirmed">{t('tpayRec.stateConfirmed')}</span>,
    flagged: <span className="chip chip-rejected">{t('tpayRec.stateFlagged')}</span>,
}[state]);

/** Más › Pagar a maestros: a closed period's pay for each teacher and where its payment stands. */
export function TeacherPayouts() {
    const router = useRouter();
    const closed = periodsOf(payRule(currentSchool())).filter(period => !period.current);
    const picked = closed.find(period => period.from === router.query.get('period')) ?? closed[0];
    const teachers = TEACHERS.filter(teacher => teacher.status === 'active' && teacherSchools(teacher).includes(currentSchool()))
        .map(teacher => ({teacher, due: teacherPay(teacher.id, currentSchool(), picked).amount, state: paymentState(teacher.id, currentSchool(), picked.from)}))
        .filter(row => row.due > 0)
        .sort((a, b) => ['flagged', 'unpaid', 'paid', 'confirmed'].indexOf(a.state) - ['flagged', 'unpaid', 'paid', 'confirmed'].indexOf(b.state));
    return (
        <Screen title={t('tpayRec.title')} back="/d/more">
            <div className="heading-pick">{t('pay.periodPick')}
                <MenuText id="tpr-period" label={t('pay.period')} value={picked.from}
                          onChange={value => router.replace(router.withQuery('period', value === closed[0].from ? null : value))}
                          options={closed.map(period => ({value: period.from, label: t('pay.periodPaid', {from: Number(period.from.slice(8)), to: dayMonth(period.to), payday: dayMonth(period.payday)})}))}/>
            </div>
            <ul className="list">
                {teachers.map(({teacher, due, state}) => (
                    <ListRow key={teacher.id} left={<Avatar name={teacher.name}/>} title={personName(teacher.name)} sub={t('tpayRec.calculated', {amount: money(due)})}
                             right={stateChip(state)} onClick={() => router.navigate(`/d/teachers/${teacher.id}/pay?period=${picked.from}`)}/>
                ))}
            </ul>
            <p className="hint">{t('tpayRec.listHint')}</p>
        </Screen>
    );
}

/** Recording a payment to a teacher for a closed period: never edited afterwards (a correction is another entry). */
export function TeacherPaymentForm({id}: { id: string }) {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const teacher = TEACHERS.find(item => item.id === id) ?? TEACHERS[0];
    const periods = periodsOf(payRule(currentSchool()));
    const period = periods.find(item => item.from === router.query.get('period')) ?? periods[1];
    const due = teacherPay(id, currentSchool(), period).amount;
    const already = paymentsFor(id, currentSchool(), period.from).reduce((sum, item) => sum + item.amount, 0);
    const left = due - already;
    const [amount, setAmount] = useState(String(Math.max(left, 0)));
    const [date, setDate] = useState(TODAY);
    const [method, setMethod] = useState('transfer');
    const [note, setNote] = useState('');
    const [receipt, setReceipt] = useState<string | null>(null);
    const photo = useRef<HTMLInputElement>(null);
    const differs = Number(amount) !== left;
    const ready = Number(amount) > 0 && Boolean(date) && (!differs || note.trim().length >= 3);
    const back = `/d/teachers/${id}/pay?period=${period.from}`;
    return (
        <Screen title={t('tpayRec.record')} subtitle={personName(teacher.name)} back={back} nav={false}
                note={ready ? t('tpayRec.formNote') : differs && Number(amount) > 0 ? t('tpayRec.needNote') : t('tpayRec.needAmount')}
                footer={<button type="button" className="btn btn-lg" disabled={!ready} onClick={async () => {
                    if (await confirm({title: t('tpayRec.confirmTitle', {amount: money(Number(amount)), name: teacher.name}), body: t('tpayRec.confirmBody'), confirm: t('tpayRec.record')})) {
                        recordTeacherPayment({teacher: id, school: currentSchool(), period: period.from, amount: Number(amount), method: method === 'cash' ? 'cash' : 'transfer', date, note: note.trim() || undefined, receipt: Boolean(receipt), receiptUrl: receipt ?? undefined});
                        if (id === STAFF_ME.t) PERSONAL.t.unshift({id: `paid-${Date.now()}`, school: currentSchool(), date: TODAY, unread: true, text: 'personal.teacherPaid', vars: {amount: money(Number(amount))}});
                        toast(t('tpayRec.recordedToast'));
                        router.back(back);
                    }
                }}>{t('tpayRec.record')}</button>}>
            <div className="card">
                <span className="small muted">{t('pay.periodPaid', {from: Number(period.from.slice(8)), to: dayMonth(period.to), payday: dayMonth(period.payday)})}</span>
                <span className="big num">{money(due)}</span>
                <span className="small">{already ? t('tpayRec.alreadyPaid', {amount: money(already), left: money(left)}) : schemeLine(payRule(currentSchool()), id)}</span>
            </div>
            <MoneyField id="tpr-amount" label={t('tpayRec.amount')} value={amount} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))}/>
            <DateField id="tpr-date" label={t('tpayRec.date')} value={date} onChange={setDate} max={TODAY}/>
            <SelectField id="tpr-method" label={t('tpayRec.method')} value={method} onChange={setMethod}
                         options={[{value: 'transfer', label: t('method.transfer')}, {value: 'cash', label: t('method.cash')}]}/>
            <TextArea id="tpr-note" label={t(differs ? 'tpayRec.noteNeeded' : 'tpayRec.noteOptional')} value={note} onChange={setNote}/>
            <input ref={photo} type="file" accept="image/*" hidden onChange={event => {
                const file = event.target.files?.[0];
                if (file) setReceipt(URL.createObjectURL(file));
            }}/>
            {receipt && <img className="receipt-thumb" src={receipt} alt={t('tpayRec.receiptAlt')}/>}
            <button type="button" className="btn btn-secondary" onClick={() => photo.current?.click()}>
                <Icon name="camera" size={18}/>{t(receipt ? 'tpayRec.changeReceipt' : 'tpayRec.addReceipt')}
            </button>
        </Screen>
    );
}
