import {useState} from 'react';
import {t} from '../../lib/texts';
import {EmailField, PhoneField, PhotoPicker, TextArea, TextField} from '../../ui/Fields';
import {PeopleEditor, type Person} from '../shared/CardForm';

let nextId = 500;

/**
 * A teacher's or director's own card: photo, name, phone and (on their own card) email, emergency
 * contacts (saved as cards with edit and delete), and health notes if they want. `missing` lists
 * what the card still needs (the name, a phone, one emergency contact), for
 * the button that saves it.
 */
export function useStaffCard({name: initialName, phone: initialPhone, email: initialEmail, emergency, health, photoPath, register = false}: {
    name: string;
    /** Filling it in from the invite (the photo is optional there; contacts are new). */
    register?: boolean;
    phone: string;
    /** Their sign-in email, on their own card; during the invite it's the invite's and can't change. */
    email?: string;
    emergency: { name: string; relation: string; phone: string }[];
    health?: string;
    /** The saved photo's path, when there's one. */
    photoPath?: string;
}) {
    const [people, setPeople] = useState<Person[]>(() => emergency.map(contact => ({
        id: `s${nextId++}`,
        name: contact.name,
        relation: contact.relation,
        phone: contact.phone,
        emergency: true,
        pickup: false,
        kids: [],
    })));
    const [name, setName] = useState(initialName);
    const [phone, setPhone] = useState(initialPhone);
    const [email, setEmail] = useState(initialEmail ?? '');
    const [healthNotes, setHealth] = useState(health ?? '');
    const [photo, setPhoto] = useState<File>();
    const missing = [
        ...(name.trim().length > 1 ? [] : [t('miss.name')]),
        ...(phone.replace(/\D/g, '').length >= 10 ? [] : [t('miss.phone')]),
        ...(initialEmail === undefined || /\S+@\S+\.\S+/.test(email) ? [] : [t('miss.email')]),
        ...(people.some(person => person.emergency) ? [] : [t('miss.contact')]),
    ];
    const body = (
        <>
            <p className="hint">{t('staff.why')}</p>
            <div className="row-start align-center gap-lg" >
                <PhotoPicker name={name} label={t('form.photo')} photo={photoPath} onPicked={(_, file) => setPhoto(file)}/>
                <p className="hint">{t(register ? 'form.photoOptional' : 'form.photoHint')}</p>
            </div>
            <TextField id="sc-name" label={t('form.name')} value={name} onChange={event => setName(event.target.value)}
                       autoComplete="name"/>
            <PhoneField id="sc-phone" label={t('form.phone')} value={phone}
                        onChange={event => setPhone(event.target.value)}/>
            {initialEmail !== undefined && (
                <EmailField id="sc-email" label={t('signIn.email')} value={email}
                            onChange={event => setEmail(event.target.value)} hint={t('form.emailHint')}/>
            )}
            <PeopleEditor people={people} setPeople={setPeople} minor={false} kids={[]}
                          mode={register ? 'register' : 'edit'}/>
            <TextArea id="sc-health" label={t('staff.health')} hint={t('staff.healthHint')} value={healthNotes} onChange={setHealth}/>
        </>
    );
    return {
        body,
        missing,
        emailChanged: initialEmail !== undefined && email.trim() !== initialEmail,
        email: email.trim(),
        values: {name: name.trim(), phone: phone.trim(), health: healthNotes.trim(), people, photo},
    };
}

export function StaffCardFields(props: Parameters<typeof useStaffCard>[0]) {
    return useStaffCard(props).body;
}
