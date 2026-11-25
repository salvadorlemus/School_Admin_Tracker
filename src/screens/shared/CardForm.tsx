import {useState} from 'react';
import {t} from '../../lib/texts';
import {initials, listOf, personName} from '../../lib/format';
import {RELATIONS, type FamilyPerson, type Student} from '../../mock/data';
import {Check, DateField, EmailField, PhoneField, PhotoPicker, SelectField, TextArea, TextField} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import {relationText} from './labels';
import {Sheet, useConfirm, useSheetRoute, useToast} from '../../ui/Layers';

let nextId = 100;
const newId = () => `p${nextId++}`;

export type Person = FamilyPerson;

export interface Kid {
    id: string;
    name: string;
}

const relationChoices = () => RELATIONS.map(relation => ({value: relation, label: relationText(relation)}));

/**
 * Emergency contacts and pickup people, saved as small cards with edit and delete buttons; the
 * form opens in a popup. For a minor, an emergency contact can also pick them up (on by default).
 * With siblings, each person says which children they're for: the list is the family's, shared.
 */
export function PeopleEditor({people, setPeople, minor, kids, mode}: {
    people: Person[];
    setPeople: (update: (list: Person[]) => Person[]) => void;
    minor: boolean;
    kids: Kid[];
    mode: 'register' | 'edit';
}) {
    const confirm = useConfirm();
    const sheet = useSheetRoute('person');
    const editing = people.find(person => person.id === sheet.item);
    const kind = sheet.item?.startsWith('new-') ? sheet.item.slice(4) as 'emergency' | 'pickup' : editing?.emergency ? 'emergency' : 'pickup';
    const kidNames = (ids: string[]) => kids.length > 1
        ? (ids.length === kids.length ? t('people.allKids') : listOf(kids.filter(kid => ids.includes(kid.id)).map(kid => kid.name.split(' ')[0])))
        : null;

    const remove = async (person: Person) => {
        if (await confirm({
            title: t('form.removeContactTitle', {name: person.name}),
            body: t(person.pickup && minor ? 'form.removePickupBody' : 'form.removeContactBody'),
            confirm: t('form.remove'),
            danger: true,
        })) setPeople(list => list.filter(item => item.id !== person.id));
    };

    const card = (person: Person, asPickup: boolean) => (
        <div key={`${person.id}-${asPickup}`} className="person-card">
            <span className="avatar" aria-hidden="true">{initials(person.name)}</span>
            <span className="grow">
                <span className="strong">{person.name}</span>
                <span
                    className="small muted">{relationText(person.relation)}{person.phone && !asPickup ? ` · ${person.phone}` : ''}</span>
                <span className="wrap">
                    {!asPickup && minor && person.pickup && <span className="chip">{t('people.alsoPickup')}</span>}
                    {asPickup && person.emergency && <span className="chip">{t('people.isEmergency')}</span>}
                    {kidNames(person.kids) && <span className="chip chip-outline">{kidNames(person.kids)}</span>}
                </span>
            </span>
            <button type="button" className="icon-btn" aria-label={t('people.edit', {name: person.name})}
                    onClick={() => sheet.show(person.id)}>
                <Icon name="edit" size={18}/>
            </button>
            <button type="button" className="icon-btn" aria-label={t('people.delete', {name: person.name})}
                    onClick={() => remove(person)}>
                <Icon name="trash" size={18}/>
            </button>
        </div>
    );

    return (
        <>
            <h3 className="section-title">{t('card.emergency')}</h3>
            {kids.length > 1 &&
                <p className="hint">{t('people.shared', {names: listOf(kids.map(kid => kid.name.split(' ')[0]))})}</p>}
            {people.filter(person => person.emergency).map(person => card(person, false))}
            {!people.some(person => person.emergency) && <p className="empty">{t('card.noEmergency')}</p>}
            <button type="button" className="btn btn-secondary" onClick={() => sheet.show('new-emergency')}>
                <Icon name="plus"/>{t('form.addContact')}
            </button>
            {minor && (
                <>
                    <h3 className="section-title">{t('card.pickup')}</h3>
                    <p className="hint">{t('form.pickupHint')}</p>
                    {people.filter(person => person.pickup).map(person => card(person, true))}
                    <button type="button" className="btn btn-secondary" onClick={() => sheet.show('new-pickup')}>
                        <Icon name="plus"/>{t('form.addPickup')}
                    </button>
                </>
            )}
            {sheet.open && (
                <PersonSheet key={sheet.item} person={editing} kind={kind} minor={minor} kids={kids} mode={mode}
                             onClose={sheet.close}
                             onSave={person => {
                                 setPeople(list => editing ? list.map(item => item.id === person.id ? person : item) : [...list, person]);
                                 sheet.close();
                             }}/>
            )}
        </>
    );
}

function PersonSheet({person, kind, minor, kids, mode, onClose, onSave}: {
    person?: Person;
    kind: 'emergency' | 'pickup';
    minor: boolean;
    kids: Kid[];
    mode: 'register' | 'edit';
    onClose: () => void;
    onSave: (person: Person) => void;
}) {
    const confirm = useConfirm();
    const [draft, setDraft] = useState<Person>(() => person ?? {
        id: newId(),
        name: '',
        relation: '',
        phone: '',
        emergency: kind === 'emergency',
        pickup: minor,
        kids: kids.map(kid => kid.id),
    });
    const set = (change: Partial<Person>) => setDraft(current => ({...current, ...change}));
    const picksUp = minor && draft.pickup;
    // A pickup person needs a photo, so the school can recognise them at the door.
    const missing = [
        ...(picksUp && !draft.photo ? [t('miss.photo')] : []),
        ...(draft.name.trim().length > 1 ? [] : [t('miss.name')]),
        ...(draft.relation.trim() ? [] : [t('miss.relation')]),
        ...(!draft.emergency || (draft.phone ?? '').replace(/\D/g, '').length >= 10 ? [] : [t('miss.phone')]),
        ...(kids.length < 2 || draft.kids.length > 0 ? [] : [t('miss.kid')]),
    ];
    const changed = person && JSON.stringify(person) !== JSON.stringify(draft);

    return (
        <Sheet open onClose={onClose}
               title={person ? person.name : t(kind === 'emergency' ? 'form.addContact' : 'form.addPickup')}
               footer={<>
                   {missing.length > 0 &&
                       <p className="hint center">{t('activity.missing', {list: missing.join(', ')})}</p>}
                   <button type="button" className="btn btn-lg" disabled={missing.length > 0} onClick={async () => {
                       if (changed && mode === 'edit' && !(await confirm({
                           title: t('people.saveTitle', {name: draft.name}),
                           body: t('people.saveBody'),
                           confirm: t('form.saveChanges'),
                       }))) return;
                       onSave(draft);
                   }}>{person ? t('form.saveChanges') : t('people.save')}</button>
               </>}>
            {picksUp && (
                <div className="row-start" style={{alignItems: 'center'}}>
                    <PhotoPicker size="sm" name={draft.name} onPicked={() => set({photo: true})}
                                 label={t('form.pickupPhoto', {name: draft.name || t('form.pickupPerson')})}/>
                    <span className="hint">{draft.photo ? t('people.photoDone') : t('people.photoHint')}</span>
                </div>
            )}
            <TextField id="pp-name" label={t('form.contactName')} value={draft.name}
                       onChange={event => set({name: event.target.value})} autoComplete="off"/>
            <SelectField id="pp-rel" label={t('form.relation')} options={relationChoices()} other
                         placeholder={t('common.pick')}
                         value={draft.relation} onChange={relation => set({relation})}/>
            {draft.emergency && (
                <PhoneField id="pp-phone" label={t('form.phone')} value={draft.phone ?? ''}
                            onChange={event => set({phone: event.target.value})}
                            hint={t('people.phoneHint')}/>
            )}
            {minor && kind === 'emergency' && (
                <Check id="pp-pickup" label={t('people.canPickup')} checked={draft.pickup}
                       onChange={pickup => set({pickup})}/>
            )}
            {kids.length > 1 && (
                <div className="field">
                    <span className="label">{t('people.forWhich')}</span>
                    {kids.map(kid => (
                        <Check key={kid.id} id={`pp-kid-${kid.id}`} label={personName(kid.name)}
                               checked={draft.kids.includes(kid.id)}
                               onChange={on => set({kids: on ? [...draft.kids, kid.id] : draft.kids.filter(id => id !== kid.id)})}/>
                    ))}
                </div>
            )}
        </Sheet>
    );
}

/** People for a student's form: a minor's family list, or an adult's own contacts. */
export function initialPeople(student: Student | undefined, family: Person[]): Person[] {
    if (student?.minor && family.length) return family;
    return (student?.emergency ?? []).map(contact => ({
        id: newId(),
        name: contact.name,
        relation: contact.relation,
        phone: contact.phone,
        emergency: true,
        pickup: false,
        kids: [],
    }));
}

/**
 * The card form's own part: photo, name, birth date, health, then the people (PeopleEditor) and
 * the declaration. The button and its "what's missing" line go in the screen's footer, always in
 * view; the button turns on once everything the card needs is there: a photo (on registering), the
 * name and birth date, an emergency contact (adults; a minor's come from the family list), the
 * photo consent when there are pickup people, and the declaration.
 */
export function useCardForm({
                                student,
                                minor,
                                mode,
                                onSave,
                                people,
                                setPeople,
                                kids,
                                showPeople = true,
                                button,
                                defaultName,
                                ownPhone,
                                ownEmail
                            }: {
    student?: Student;
    minor: boolean;
    mode: 'register' | 'edit';
    onSave: () => void;
    people: Person[];
    setPeople: (update: (list: Person[]) => Person[]) => void;
    kids: Kid[];
    showPeople?: boolean;
    button?: string;
    /** The name the school registered them with, to start the form (registration). */
    defaultName?: string;
    /** An adult student's own phone (theirs, for all their schools); not for a minor's card. */
    ownPhone?: string;
    /** An adult student's own email, the one they sign in with. */
    ownEmail?: string;
}) {
    const confirm = useConfirm();
    const [health, setHealth] = useState(student?.health ?? '');
    const [name, setName] = useState(student?.name ?? defaultName ?? '');
    const [birth, setBirth] = useState(student ? `${2026 - student.age}-03-14` : '');
    const [phone, setPhone] = useState(ownPhone ?? '');
    const [email, setEmail] = useState(ownEmail ?? '');
    const toast = useToast();
    const [declared, setDeclared] = useState(false);
    // The consent covers the pickup people's photos. Those saved before were consented when they
    // were added (and recorded); only a new pickup person needs the box ticked again.
    const [consented] = useState(() => new Set(mode === 'edit' ? people.filter(person => person.pickup && person.photo).map(person => person.id) : []));
    const newPickup = people.some(person => person.pickup && !consented.has(person.id));
    const [consent, setConsent] = useState(false);
    const hasPickup = minor && showPeople && people.some(person => person.pickup);
    const missing = [
        ...(name.trim().length > 1 ? [] : [t('miss.name')]),
        ...(birth ? [] : [t('miss.birth')]),
        ...(ownPhone === undefined || phone.replace(/\D/g, '').length >= 10 ? [] : [t('miss.phone')]),
        ...(ownEmail === undefined || /\S+@\S+\.\S+/.test(email) ? [] : [t('miss.email')]),
        ...(!showPeople || minor || people.some(person => person.emergency) ? [] : [t('miss.contact')]),
        ...(hasPickup && newPickup && !consent ? [t('miss.consent')] : []),
        ...(declared ? [] : [t('miss.declare')]),
    ];

    const save = async () => {
        if (mode === 'edit' && health !== (student?.health ?? '') && !(await confirm({
            title: t('form.healthChangedTitle'),
            body: t('form.healthChangedBody'),
            confirm: t('form.saveChanges'),
        }))) return;
        onSave();
        // The new email works only once the person opens the link sent to it.
        if (ownEmail !== undefined && email.trim() !== ownEmail) toast(t('form.emailSent', {email: email.trim()}));
    };

    const body = (
        <>
            <div className="row-start" style={{alignItems: 'center', gap: 16}}>
                <PhotoPicker name={name} label={t('form.photo')}/>
                <p className="hint">{t(mode === 'edit' ? 'form.photoHint' : 'form.photoOptional')}</p>
            </div>
            <TextField id="card-name" label={t('form.name')} value={name}
                       onChange={event => setName(event.target.value)}
                       autoComplete={minor ? 'off' : 'name'}/>
            {ownPhone !== undefined && (
                <PhoneField id="card-phone" label={t('form.phone')} value={phone}
                            onChange={event => setPhone(event.target.value)}
                            hint={t('account.profileHint')}/>
            )}
            {ownEmail !== undefined && (
                <EmailField id="card-email" label={t('signIn.email')} value={email}
                            onChange={event => setEmail(event.target.value)}
                            hint={t('form.emailHint')}/>
            )}
            <DateField id="card-birth" label={t('form.birth')} value={birth}
                       onChange={setBirth}
                       hint={t('form.birthHint')}/>
            <h3 className="section-title">{t('card.health')}</h3>
            <TextArea id="card-health" label={t('form.health')} value={health} hint={t('form.healthHint')} rows={4}
                      onChange={setHealth}/>
            {showPeople && <PeopleEditor people={people} setPeople={setPeople} minor={minor} kids={kids} mode={mode}/>}
            {hasPickup && <Check id="card-consent" label={t('form.pickupConsent')} checked={!newPickup || consent}
                                 onChange={setConsent} disabled={!newPickup}
                                 hint={newPickup ? undefined : t('form.pickupConsentKept')}/>}
            <div className="card">
                <Check id="card-declare" label={<strong>{t('form.declare')}</strong>} hint={t('form.declareHint')}
                       checked={declared} onChange={setDeclared}/>
            </div>
        </>
    );
    const footer = (
        <>
            {missing.length > 0 && <p className="hint center">{t('activity.missing', {list: missing.join(', ')})}</p>}
            <button type="button" className="btn btn-lg btn-block" disabled={missing.length > 0} onClick={save}>
                {button ?? (mode === 'register' ? t('common.continue') : t('form.saveChanges'))}
            </button>
        </>
    );
    return {body, footer};
}
