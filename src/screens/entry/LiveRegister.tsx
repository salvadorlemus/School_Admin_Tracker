import {Check} from '../../ui/Fields';
import {compressPhoto, familyPhotoPath, saveCardPhoto, uploadFile} from '../../live/files';
import {useEffect, useRef, useState} from 'react';
import {t} from '../../lib/texts';
import {useRouter} from '../../lib/router';
import {supabase} from '../../lib/supabase';
import {GUARDIAN_KIDS, ME, SCHOOLS} from '../../mock/data';
import {LIVE} from '../../live/state';
import {homePath, PENDING, refreshSession} from '../../live/session';
import {BareScreen} from '../../ui/Screen';
import {Icon} from '../../ui/Icon';
import {useToast} from '../../ui/Layers';
import {PeopleEditor, useCardForm, type CardValues, type Person} from '../shared/CardForm';

/**
 * Registration on the real data (rule 14): an invited adult student fills in their card, then reads
 * and accepts the school's terms; a guardian enters their family's people once, each child's card,
 * then accepts once for all of them. The database turns the memberships active when it's done.
 */

interface Pending {
    school: string;
    /** The students this registration is for: the person themselves, or the guardian's children there. */
    students: { id: string; name: string }[];
    guardian: boolean;
    /** Already saved, when they come back to finish: the family list (guardians), and whose cards. */
    familyDone: boolean;
    cardsDone: string[];
    /** Only the school's new terms, for someone registered already. */
    renewal?: boolean;
}

/** What's still to register: the first invited membership (a student's or a guardian's). */
async function pending(): Promise<Pending | null> {
    const {data} = await supabase.from('membership').select('school_id, role, status, person_id').eq('person_id', LIVE.person).eq('status', 'invited');
    const rows = (data ?? []) as { school_id: string; role: string }[];
    const own = rows.find(m => m.role === 'student');
    if (own) return withProgress({school: own.school_id, students: [{id: LIVE.person, name: ME.name}], guardian: false, familyDone: true, cardsDone: []});
    const guardian = rows.find(m => m.role === 'guardian');
    // Registered already, with a school's new terms to accept: straight to the reader.
    if (!guardian) return PENDING.terms ? {...PENDING.terms, guardian: false, familyDone: true, cardsDone: PENDING.terms.students.map(s => s.id), renewal: true} : null;
    const {data: links} = await supabase.from('guardian_link').select('student_id').eq('school_id', guardian.school_id).eq('guardian_id', LIVE.person);
    const ids = ((links ?? []) as { student_id: string }[]).map(l => l.student_id);
    const {data: people} = ids.length ? await supabase.from('person').select('id, full_name').in('id', ids) : {data: []};
    return withProgress({school: guardian.school_id, guardian: true, familyDone: false, cardsDone: [],
        students: ((people ?? []) as { id: string; full_name: string }[]).map(p => ({id: p.id, name: p.full_name}))});
}

/** What's already saved from an earlier visit. */
async function withProgress(todo: Pending): Promise<Pending> {
    const ids = todo.students.map(s => s.id);
    const [{data: cards}, {data: family}] = await Promise.all([
        supabase.from('student_card').select('student_id').eq('school_id', todo.school).in('student_id', ids),
        todo.guardian ? supabase.from('family_person').select('id').eq('school_id', todo.school).eq('guardian_id', LIVE.person).limit(1) : Promise.resolve({data: []}),
    ]);
    return {...todo, cardsDone: ((cards ?? []) as { student_id: string }[]).map(c => c.student_id), familyDone: !todo.guardian || (family ?? []).length > 0};
}

/** The first step still to do. */
function firstStep(todo: Pending): Step {
    if (!todo.familyDone) return {kind: 'family'};
    const index = todo.students.findIndex(s => !todo.cardsDone.includes(s.id));
    return index >= 0 ? {kind: 'card', index} : {kind: 'terms'};
}

type Step = { kind: 'family' } | { kind: 'card'; index: number } | { kind: 'terms' };

export function LiveRegister() {
    const router = useRouter();
    const toast = useToast();
    const [todo, setTodo] = useState<Pending | null | undefined>(undefined);
    const [step, setStep] = useState<Step>({kind: 'card', index: 0});
    const [people, setPeople] = useState<Person[]>([]);
    const [busy, setBusy] = useState(false);
    const [consent, setConsent] = useState(false);

    useEffect(() => {
        void pending().then(found => {
            setTodo(found);
            if (found) setStep(firstStep(found));
        });
    }, []);

    const fail = (message: string) => {
        setBusy(false);
        toast(t('register.failed'));
        console.error('registration:', message);
    };

    /** A card: the student's own, with their emergency contacts (adults); the phone is the person's own. */
    const saveCard = async (student: string, values: CardValues): Promise<boolean> => {
        if (!todo) return false;
        setBusy(true);
        const {data, error} = await supabase.from('student_card').insert({
            school_id: todo.school,
            student_id: student,
            full_name: values.name.trim(),
            birth_date: values.birth || null,
            health_notes: values.health.trim() || null,
            declared_at: new Date().toISOString(),
        }).select('id').single();
        if (error) {
            fail(error.message);
            return false;
        }
        if (!todo.guardian) {
            const contacts = people.filter(p => p.emergency && p.phone).map(p => ({
                card_id: (data as { id: string }).id,
                name: p.name,
                relation: p.relation,
                phone: p.phone
            }));
            if (contacts.length) {
                const {error: contactError} = await supabase.from('emergency_contact').insert(contacts);
                if (contactError) {
                    fail(contactError.message);
                    return false;
                }
            }
            if (values.phone.trim()) await supabase.from('person').update({phone: values.phone.trim()}).eq('id', LIVE.person);
        }
        // The photo is optional: a card saved without it can get one later from the card.
        if (values.photo) await saveCardPhoto(todo.school, student, values.photo);
        setBusy(false);
        return true;
    };

    /** The guardian's people, once for all their children there. Someone who picks up needs a photo: added later from the card. */
    const saveFamily = async (): Promise<boolean> => {
        if (!todo) return false;
        setBusy(true);
        for (const person of people) {
            // A pickup person needs their photo and the guardian's consent to share it (asked on the form).
            const photo = person.file ? familyPhotoPath(todo.school) : null;
            const {data, error} = await supabase.from('family_person').insert({
                school_id: todo.school,
                guardian_id: LIVE.person,
                name: person.name,
                relation: person.relation,
                phone: person.phone || null,
                photo_path: photo,
                is_emergency: person.emergency,
                can_pick_up: Boolean(photo) && person.pickup,
                consent_at: photo && person.pickup ? new Date().toISOString() : null,
            }).select('id').single();
            if (photo && person.file && !error) await uploadFile(photo, await compressPhoto(person.file));
            if (error) {
                fail(error.message);
                return false;
            }
            const kids = person.kids.length ? person.kids : todo.students.map(s => s.id);
            await supabase.from('family_person_child').insert(kids.map(kid => ({
                family_person_id: (data as {
                    id: string
                }).id, student_id: kid
            })));
        }
        setBusy(false);
        return true;
    };

    if (todo === undefined) return <BareScreen><p className="muted">{t('join.loading')}</p></BareScreen>;
    if (todo === null) {
        router.replace(homePath());
        return null;
    }
    const school = SCHOOLS[todo.school]?.name ?? '';
    const total = todo.guardian ? todo.students.length + 2 : 2;
    const at = step.kind === 'family' ? 1 : step.kind === 'card' ? (todo.guardian ? step.index + 2 : 1) : total;

    if (step.kind === 'family') {
        // Pickup people need a photo, and the guardian's consent to share it (rule 18).
        const pickup = people.some(p => p.pickup);
        const ready = people.some(p => p.emergency && p.phone) && people.every(p => !p.pickup || p.file) && (!pickup || consent);
        return (
            <BareScreen footer={<>
                {!ready && <p className="hint center">{t(people.some(p => p.pickup && !p.file) ? 'register.needPhoto' : pickup && !consent ? 'register.needConsent' : 'register.needContact')}</p>}
                <button type="button" className="btn btn-lg" disabled={!ready || busy} onClick={async () => {
                    if (await saveFamily()) setStep({kind: 'card', index: 0});
                }}>{t('common.continue')}</button>
            </>}>
                <p className="small muted">{t('invite.step', {at, of: total})} · {school}</p>
                <h1 className="huge">{t('register.familyTitle')}</h1>
                <p className="muted">{t('register.familyBody')}</p>
                <PeopleEditor people={people} setPeople={setPeople} minor kids={todo.students} mode="register"/>
                {pickup && <Check id="family-consent" label={t('form.pickupConsent')} checked={consent} onChange={setConsent}/>}
            </BareScreen>
        );
    }

    if (step.kind === 'card') {
        const student = todo.students[step.index];
        return <CardStep key={student.id}
                         title={todo.guardian ? t('register.childCard', {name: student.name.split(' ')[0]}) : t('invite.cardTitle')}
                         step={t('invite.step', {at, of: total})} school={school} defaultName={student.name}
                         minor={todo.guardian}
                         people={people} setPeople={setPeople} busy={busy}
                         onSave={async values => {
                             if (!(await saveCard(student.id, values))) return;
                             const next = todo.students.findIndex((other, i) => i > step.index && !todo.cardsDone.includes(other.id));
                             setStep(next >= 0 ? {kind: 'card', index: next} : {kind: 'terms'});
                         }}/>;
    }

    return <TermsStep school={todo.school} schoolName={school} step={todo.renewal ? undefined : t('invite.step', {at, of: total})}
                      names={todo.guardian || todo.students.some(s => s.id !== LIVE.person) ? todo.students.map(s => s.name) : []}
                      onAccept={async termsId => {
                          setBusy(true);
                          const {error} = await supabase.from('terms_acceptance').insert(todo.students.map(s => ({
                              school_id: todo.school,
                              terms_id: termsId,
                              student_id: s.id
                          })));
                          if (error) return fail(error.message);
                          await refreshSession();
                          setBusy(false);
                          // New terms accepted: on to the app (or the next school's new terms).
                          router.replace(todo.renewal ? homePath() : '/register/done');
                      }}/>;
}

function CardStep({title, step, school, defaultName, minor, people, setPeople, onSave, busy}: {
    title: string;
    step: string;
    school: string;
    defaultName: string;
    minor: boolean;
    people: Person[];
    setPeople: (update: (list: Person[]) => Person[]) => void;
    onSave: (values: CardValues) => void;
    busy: boolean;
}) {
    const form = useCardForm({
        minor, mode: 'register', ownPhone: minor ? undefined : '', onSave, defaultName, people, setPeople, kids: [],
        showPeople: !minor,
    });
    return (
        <BareScreen footer={busy ?
            <button type="button" className="btn btn-lg" disabled>{t('upload.sending')}</button> : form.footer}>
            <p className="small muted">{step} · {school}</p>
            <h1 className="huge">{title}</h1>
            <p className="muted">{t('invite.cardBody')}</p>
            {form.body}
        </BareScreen>
    );
}

/**
 * The terms reader: the school's PDF, page by page; "Accept" turns on once the last page is reached.
 * A school whose PDF isn't uploaded yet shows that instead (nobody can accept terms they can't read).
 */
export function TermsStep({school, schoolName, step, names, onAccept}: {
    school: string;
    schoolName: string;
    step?: string;
    names: string[];
    onAccept: (termsId: string) => void;
}) {
    const [terms, setTerms] = useState<{
        id: string;
        version: number;
        file_path: string
    } | null | undefined>(undefined);
    const [pages, setPages] = useState(0);
    const [missing, setMissing] = useState(false);
    const [reached, setReached] = useState(false);
    const [progress, setProgress] = useState(0);
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Drawn once: a second run (React's strict mode, or another school) stops the first.
        let stopped = false;
        void (async () => {
            const {data} = await supabase.from('terms').select('id, version, file_path').eq('school_id', school).order('version', {ascending: false}).limit(1).maybeSingle();
            const row = data as { id: string; version: number; file_path: string } | null;
            setTerms(row);
            if (!row) return;
            const {data: file} = await supabase.storage.from('lyra').download(row.file_path);
            if (!file) {
                setMissing(true);
                return;
            }
            // The PDF reader is large: it loads only when the terms open.
            const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
            pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
            const pdf = await pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
            const holder = box.current;
            if (stopped || !holder) return;
            setPages(pdf.numPages);
            holder.replaceChildren();
            for (let n = 1; n <= pdf.numPages; n++) {
                if (stopped) return;
                const page = await pdf.getPage(n);
                const width = holder.clientWidth - 24;
                const viewport = page.getViewport({scale: 1});
                const scaled = page.getViewport({scale: (width / viewport.width) * window.devicePixelRatio});
                const canvas = document.createElement('canvas');
                canvas.className = 'pdf-canvas';
                canvas.width = scaled.width;
                canvas.height = scaled.height;
                canvas.style.width = `${width}px`;
                holder.appendChild(canvas);
                const context = canvas.getContext('2d');
                if (context) await page.render({canvasContext: context, viewport: scaled}).promise;
            }
        })();
        return () => {
            stopped = true;
        };
    }, [school]);

    return (
        <div className="screen screen-no-bottom">
            <header className="topbar">
                <div className="topbar-title">
                    <h1>{t('terms.title')}</h1>
                    <span>{step ? `${step} · ` : ''}{schoolName}{terms ? ` · ${t('terms.version', {n: terms.version})}` : ''}</span>
                </div>
            </header>
            <div className="stack-sm reader-head">
                <p className="small muted">{t('legal.alsoRead')} <a href="#/legal">{t('legal.link')}</a></p>
                {names.length > 1 &&
                    <p className="small">{t('terms.forKids', {names: names.map(n => n.split(' ')[0]).join(', ')})}</p>}
                <div className="progress" role="progressbar" aria-label={t('terms.progress')} aria-valuemin={0}
                     aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                    <span style={{width: `${Math.round(progress * 100)}%`}}/>
                </div>
                <p className={reached ? 'small strong text-confirmed' : 'small muted'} aria-live="polite">
                    {reached ? <><Icon name="check" size={14}/> {t('terms.reached')}</> : pages ? t('terms.page', {
                        at: Math.min(pages, Math.floor(progress * pages) + 1),
                        of: pages
                    }) : ''}
                </p>
            </div>
            {missing || terms === null ? <div className="pdf"><p className="empty">{t('register.noPdf')}</p></div> : (
                <div ref={box} className="pdf" tabIndex={0} aria-label={t('terms.document')} onScroll={event => {
                    const element = event.currentTarget;
                    const max = element.scrollHeight - element.clientHeight;
                    const value = max <= 0 ? 1 : element.scrollTop / max;
                    setProgress(value);
                    if (pages && value > 0.98) setReached(true);
                }}/>
            )}
            <div className="footer">
                {!reached && <p className="hint center">{t('terms.readFirst')}</p>}
                <button type="button" className="btn btn-lg" disabled={!reached || !terms}
                        onClick={() => terms && onAccept(terms.id)}>{t('terms.accept')}</button>
            </div>
        </div>
    );
}

export function LiveRegisterDone() {
    const router = useRouter();
    const guardian = GUARDIAN_KIDS.length > 0;
    return (
        <BareScreen footer={<button type="button" className="btn btn-lg"
                                    onClick={() => router.replace(homePath())}>{t('register.open')}</button>}>
            <div className="done">
                <span className="avatar avatar-lg avatar-ok"><Icon name="check" size={40}/></span>
                <p className="huge">{t('register.doneTitle')}</p>
                <p className="muted">{t(guardian ? 'register.doneBodyGuardian' : 'register.doneBody')}</p>
            </div>
        </BareScreen>
    );
}
