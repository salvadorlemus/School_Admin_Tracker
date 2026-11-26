import {classWhen} from '../shared/pieces';
import {currentSchool} from '../../state/school';
import type {ReactNode} from 'react';
import {t, type TextKey} from '../../lib/texts';
import {dayMonth, decimal, money, monthInSentence, monthName, personName, weekdayShort} from '../../lib/format';
import {useRouter} from '../../lib/router';
import {classById, studentById, TODAY, teacherName} from '../../mock/data';
import {
    AT_RISK,
    COHORTS,
    fillTone,
    fillTotal,
    FILL,
    LATE,
    LATE_MONTHS,
    lateTone,
    lateTotal,
    loadInsights,
    marginTone,
    marginTotal,
    MARGINS,
    retentionTone,
    retentionTotal,
    riskTone,
    riskTotal,
    SLOTS,
    toneDown,
    toneUp,
    trialsByTeacher,
    trialTone,
    trialTotal,
    TRIALS,
    type Tone,
} from '../../mock/insights';
import {Screen} from '../../ui/Screen';
import {Avatar, ListRow, Skeleton, useBriefLoading} from '../../ui/Fields';

const pct = (value: number) => `${Math.round(value * 100)}%`;
const inSentence = monthInSentence;

/** Up or down against last month, in the colour of whether that's good for the school. */
function Trend({now, last, higherIsBetter, kind}: {
    now: number;
    last: number;
    higherIsBetter: boolean;
    kind: 'points' | 'money' | 'count'
}) {
    // Points are compared as shown (whole points), so a difference too small to show reads as level.
    const diff = kind === 'points' ? Math.round(now * 100) - Math.round(last * 100) : now - last;
    const better = higherIsBetter ? diff > 0 : diff < 0;
    const tone: Tone = diff === 0 ? 'watch' : better ? 'good' : 'bad';
    const amount = kind === 'points' ? t('ins.points', {n: Math.abs(diff)}) : kind === 'money' ? money(Math.abs(diff)) : String(Math.abs(diff));
    return (
        <span className="trend" data-tone={tone}>
            {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {t('ins.vs', {amount, month: inSentence('2026-10-01')})}
        </span>
    );
}

/** A number in its colour, with its tone said in words too (colour alone never carries it). */
function ToneChip({tone, children}: { tone: Tone; children: ReactNode }) {
    return <span className="chip tone-chip" data-tone={tone}>{children}</span>;
}

interface Metric {
    id: string;
    label: TextKey;
    value: string;
    tone: Tone;
    trend: ReactNode;
}

function metrics(): Metric[] {
    // The school picked at the top: its own numbers.
    loadInsights(currentSchool());
    const margin = marginTotal();
    const trials = trialTotal();
    const fill = fillTotal();
    const risk = riskTotal();
    const late = lateTotal();
    const retention = retentionTotal();
    const trialRate = trials.enrolled / trials.trials;
    return [
        {
            id: 'margin',
            label: 'ins.margin',
            value: money(margin.margin),
            tone: marginTone(margin),
            trend: <Trend now={margin.margin} last={margin.last} higherIsBetter kind="money"/>
        },
        {
            id: 'trials',
            label: 'ins.trials',
            value: pct(trialRate),
            tone: trialTone(trialRate),
            trend: <Trend now={trialRate} last={trials.lastRate} higherIsBetter kind="points"/>
        },
        {
            id: 'fill',
            label: 'ins.fill',
            value: pct(fill.rate),
            tone: fillTone(fill.rate),
            trend: <Trend now={fill.rate} last={fill.last} higherIsBetter kind="points"/>
        },
        {
            id: 'risk',
            label: 'ins.risk',
            value: String(risk.count),
            tone: riskTone(risk.count, risk.students),
            trend: <Trend now={risk.count} last={risk.last} higherIsBetter={false} kind="count"/>
        },
        {
            id: 'late',
            label: 'ins.late',
            value: pct(late.rate),
            tone: lateTone(late.rate),
            trend: <Trend now={late.rate} last={late.last} higherIsBetter={false} kind="points"/>
        },
        {
            id: 'retention',
            label: 'ins.retention',
            value: pct(retention.rate),
            tone: retentionTone(retention.rate),
            trend: <Trend now={retention.rate} last={retention.last} higherIsBetter kind="points"/>
        },
    ];
}

/** A class's teacher, days and hours: classes can share a name (Helios's "Danza aérea"). */
const whoWhen = (classId: string) => `${teacherName(classById(classId).teacher)} · ${classWhen(classById(classId))}`;

/** Panel › Resumen: six numbers about the school, each opening its breakdown. */
export function SummaryView() {
    const router = useRouter();
    const loading = useBriefLoading('summary', 'summary', true);
    if (loading) return <div className="metric-grid">{Array.from({length: 6}, (_, index) => <Skeleton key={index} rows={3} card/>)}</div>;
    return (
        <>
            <div className="metric-grid">
                {metrics().map(metric => (
                    <button key={metric.id} type="button" className="metric" data-tone={metric.tone}
                            onClick={() => router.navigate(`/d/insights/${metric.id}`)}>
                        <span className="small">{t(metric.label)}</span>
                        <span className="metric-value num">{metric.value}</span>
                        <span className="metric-tone">{t(`ins.tone.${metric.tone}` as const)}</span>
                        {metric.trend}
                    </button>
                ))}
            </div>
            <p className="hint">{t('ins.legend')}</p>
        </>
    );
}

/** The top of a breakdown: the number, its tone and trend, and what the colours mean here. */
function Headline({metric, rule}: { metric: Metric; rule: string }) {
    return (
        <div className="metric metric-wide" data-tone={metric.tone}>
            <span className="metric-value num">{metric.value}</span>
            <span className="metric-tone">{t(`ins.tone.${metric.tone}` as const)}</span>
            {metric.trend}
            <span className="small muted">{rule}</span>
        </div>
    );
}

export function InsightScreen({id}: { id: string }) {
    const router = useRouter();
    const metric = metrics().find(item => item.id === id) ?? metrics()[0];
    const back = '/d/home?view=summary';
    let body: ReactNode = null;
    if (metric.id === 'margin') {
        const total = marginTotal();
        body = (
            <>
                <div className="card">
                    <div className="two">
                        <div className="stack-sm"><span className="small muted">{t('ins.income')}</span><span
                            className="big num">{money(total.income)}</span></div>
                        <div className="stack-sm"><span className="small muted">{t('ins.teacherPay')}</span><span
                            className="big num">{money(total.income - total.margin)}</span></div>
                    </div>
                </div>
                <h2 className="section-title">{t('ins.byClass')}</h2>
                <ul className="list">
                    {MARGINS.map(row => (
                        <ListRow key={row.classId} title={classById(row.classId).name}
                                 sub={<>{whoWhen(row.classId)}<br/>{t('ins.marginRow', {income: money(row.income), pay: money(row.pay)})}</>}
                                 chips={<ToneChip
                                     tone={marginTone(row)}>{money(row.margin)} · {pct(row.margin / row.income)}</ToneChip>}
                                 onClick={() => router.navigate(`/d/activity/${row.classId}`)}/>
                    ))}
                </ul>
                <p className="hint">{t('ins.marginHow')}</p>
            </>
        );
    } else if (metric.id === 'trials') {
        body = (
            <>
                <h2 className="section-title">{t('ins.byClass')}</h2>
                <ul className="list">
                    {TRIALS.map(row => (
                        <ListRow key={row.classId} title={classById(row.classId).name}
                                 sub={<>{whoWhen(row.classId)}<br/>{t('ins.trialRow', {trials: row.trials, enrolled: row.enrolled})}</>}
                                 chips={<ToneChip
                                     tone={trialTone(row.enrolled / row.trials)}>{pct(row.enrolled / row.trials)}</ToneChip>}/>
                    ))}
                </ul>
                <h2 className="section-title">{t('ins.byTeacher')}</h2>
                <ul className="list">
                    {trialsByTeacher().map(row => (
                        <ListRow key={row.teacher} left={<Avatar name={row.name}/>} title={row.name}
                                 sub={t('ins.trialRow', {trials: row.trials, enrolled: row.enrolled})}
                                 chips={<ToneChip
                                     tone={trialTone(row.enrolled / row.trials)}>{pct(row.enrolled / row.trials)}</ToneChip>}/>
                    ))}
                </ul>
                <p className="hint">{t('ins.trialsHow')}</p>
            </>
        );
    } else if (metric.id === 'fill') {
        body = (
            <>
                <h2 className="section-title">{t('ins.byClass')}</h2>
                <ul className="list">
                    {FILL.map(row => (
                        <ListRow key={row.classId} title={classById(row.classId).name}
                                 sub={<>
                                     {whoWhen(row.classId)}
                                     <span className="progress" style={{display: 'block', margin: '4px 0'}}><span
                                         style={{width: `${Math.round(row.enrolled / row.max * 100)}%`}}/></span>
                                     {t('ins.fillRow', {
                                         enrolled: row.enrolled,
                                         max: row.max,
                                         attendance: pct(row.attendance)
                                     })}
                                 </>}
                                 chips={<ToneChip
                                     tone={fillTone(row.enrolled / row.max)}>{pct(row.enrolled / row.max)}</ToneChip>}/>
                    ))}
                </ul>
                <h2 className="section-title">{t('ins.slots')}</h2>
                <div className="slot-grid" role="table" aria-label={t('ins.slots')}>
                    <span role="columnheader"/>
                    {(['morning', 'afternoon', 'evening'] as const).map(part => <span key={part} role="columnheader"
                                                                                      className="small muted">{t(`ins.part.${part}` as const)}</span>)}
                    {[...new Set(SLOTS.map(slot => slot.weekday))].map(weekday => (
                        <div key={weekday} role="row" className="slot-row">
                            <span role="rowheader" className="small strong">{weekdayShort(weekday)}</span>
                            {SLOTS.filter(slot => slot.weekday === weekday).map(slot => (
                                <span key={slot.part} role="cell" className="slot-cell"
                                      data-tone={slot.rate < 0 ? undefined : toneUp(slot.rate, 0.75, 0.5)}>{slot.rate < 0 ? '—' : pct(slot.rate)}</span>
                            ))}
                        </div>
                    ))}
                </div>
                <p className="hint">{t('ins.fillHow')}</p>
            </>
        );
    } else if (metric.id === 'risk') {
        body = (
            <>
                <ul className="list">
                    {AT_RISK.map(row => (
                        <ListRow key={row.student} left={<Avatar name={studentById(row.student).name}/>}
                                 title={personName(studentById(row.student).name)}
                                 sub={t('ins.lastSeen', {when: dayMonth(row.lastSeen)})}
                                 chips={<>{row.reasons.map(reason => <span key={reason}
                                                                           className="chip chip-warning">{t(`ins.reason.${reason}` as const)}</span>)}</>}
                                 onClick={() => router.navigate(`/d/students/${row.student}`)}/>
                    ))}
                </ul>
                <p className="hint">{t('ins.riskHow')}</p>
            </>
        );
    } else if (metric.id === 'late') {
        const late = lateTotal();
        body = (
            <>
                <div className="card">
                    <div className="two">
                        <div className="stack-sm"><span className="small muted">{t('ins.onTime')}</span><span
                            className="big num">{pct(late.onTime)}</span></div>
                        <div className="stack-sm"><span className="small muted">{t('ins.averageLate')}</span><span
                            className="big num">{t('ins.days', {n: decimal(late.averageDays)})}</span></div>
                    </div>
                </div>
                <h2 className="section-title">{t('ins.byMonth')}</h2>
                <div className="bars" role="list">
                    {LATE_MONTHS.map(row => (
                        <div key={row.month} role="listitem" className="bar-col">
                            <span className="small num">{pct(row.rate)}</span>
                            <span className="bar" data-tone={lateTone(row.rate)}
                                  style={{height: `${Math.round(row.rate * 300)}px`}}/>
                            <span className="small muted">{monthName(`${row.month}-01`).slice(0, 3)}</span>
                        </div>
                    ))}
                </div>
                <h2 className="section-title">{t('ins.whoLate')}</h2>
                <ul className="list">
                    {LATE.map(row => (
                        <ListRow key={row.student} left={<Avatar name={studentById(row.student).name}/>}
                                 title={personName(studentById(row.student).name)}
                                 sub={t('ins.lateRow', {days: row.days, times: row.times})}
                                 chips={<ToneChip
                                     tone={toneDown(row.times, 1, 2)}>{t('ins.times', {n: row.times})}</ToneChip>}
                                 onClick={() => router.navigate(`/d/students/${row.student}`)}/>
                    ))}
                </ul>
                <p className="hint">{t('ins.lateHow')}</p>
            </>
        );
    } else {
        body = (
            <>
                <h2 className="section-title">{t('ins.cohorts')}</h2>
                <ul className="list">
                    {COHORTS.map(row => (
                        <ListRow key={row.month} title={t('ins.joinedIn', {month: inSentence(`${row.month}-01`)})}
                                 sub={t('ins.cohortRow', {
                                     joined: row.joined,
                                     after1: row.after1,
                                     after3: row.after3 ?? '—'
                                 })}
                                 right={row.after3 === null ? <span className="chip">{t('ins.tooSoon')}</span>
                                     : <ToneChip
                                         tone={retentionTone(row.after3 / row.joined)}>{pct(row.after3 / row.joined)}</ToneChip>}/>
                    ))}
                </ul>
                <p className="hint">{t('ins.retentionHow')}</p>
            </>
        );
    }
    return (
        <Screen title={t(metric.label)} subtitle={t('ins.month', {month: inSentence(TODAY)})} back={back} nav={false}>
            <Headline metric={metric} rule={t(`ins.rule.${metric.id}` as TextKey)}/>
            {body}
        </Screen>
    );
}
