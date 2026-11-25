import {useState} from 'react';
import {personName} from '../../lib/format';
import {t} from '../../lib/texts';
import {useRouter} from '../../lib/router';
import {GUARDIAN_KIDS, type SchoolId, SCHOOLS, SOFIA_SCHOOLS, STAFF_ME, studentById, TEACHERS, teacherSchools} from '../../mock/data';
import {Sheet, useToast} from '../../ui/Layers';
import {MenuText, PhotoPicker} from '../../ui/Fields';
import {Icon} from '../../ui/Icon';
import type {Role} from '../../ui/Screen';
import {DetailsCard, staffAsStudent, StudentCardView} from './pieces';

/**
 * My card as a popup, from the card button at the top. Tapping the photo changes it; the person's
 * own details (name, phone, email) show under it, and "Editar tarjeta" edits all of it. A guardian
 * picks which child's card (their own details stay in Cuenta); teachers and directors see their
 * staff card.
 */
export function CardSheet({role, open, onClose}: { role: Role; open: boolean; onClose: () => void }) {
    const router = useRouter();
    const toast = useToast();
    const guardian = role === 'g';
    const [kid, setKid] = useState('mateo');
    // A card belongs to one school (it's never copied across): Sofía, in two schools, has one in each.
    const [school, setSchool] = useState<SchoolId>('colibri');
    if (role === 't' || role === 'd') {
        const teacher = TEACHERS.find(item => item.id === STAFF_ME[role]) ?? TEACHERS[0];
        return (
            <Sheet open={open} onClose={onClose} title={t('staff.myCard')} tall
                   footer={<button type="button" className="btn btn-lg"
                                   onClick={() => router.navigate(`/${role}/my-card`)}>
                       <Icon name="edit"/>{t('card.edit')}
                   </button>}>
                <div className="row-start" style={{alignItems: 'center'}}>
                    <PhotoPicker name={teacher.name} label={t('form.photo')}
                                 onPicked={() => toast(t('card.photoSaved'))}/>
                    <div className="grow">
                        <span className="big">{teacher.name}</span>
                        <span className="hint">{t('form.photoHint')}</span>
                    </div>
                </div>
                <StudentCardView compact student={staffAsStudent(teacher)}/>
                <DetailsCard own title={t('account.profile')} name={teacher.name} phone={teacher.phone}
                             email={teacher.email}/>
                <p className="hint">{t('staff.why')}</p>
                {teacherSchools(teacher).length > 1 && <p className="hint">{t('staff.oneCard', {schools: teacherSchools(teacher).map(id => SCHOOLS[id].short).join(', ')})}</p>}
            </Sheet>
        );
    }
    const student = studentById(guardian ? kid : 'sofia');
    return (
        <Sheet open={open} onClose={onClose} title={t(guardian ? 'card.titleGuardian' : 'card.title')} tall
               subtitle={guardian
                   ? <MenuText id="card-kid" label={t('card.whichChild')} value={kid} onChange={setKid}
                               options={GUARDIAN_KIDS.map(item => ({value: item.id, label: personName(item.name)}))}/>
                   : SOFIA_SCHOOLS.length > 1
                       ? <MenuText id="card-school" label={t('card.whichSchool')} value={school} onChange={value => setSchool(value as SchoolId)}
                                   options={SOFIA_SCHOOLS.map(id => ({value: id, label: SCHOOLS[id].name}))}/>
                       : SCHOOLS[school].name}
               footer={<button type="button" className="btn btn-lg"
                               onClick={() => router.navigate(`/${role}/card/${student.id}${guardian ? '' : `?school=${school}`}`)}>
                   <Icon name="edit"/>{t('card.edit')}
               </button>}>
            <StudentCardView key={student.id} student={student} photo onPhoto={() => toast(t('card.photoSaved'))}/>
            {!guardian && (
                <DetailsCard own title={t('account.profile')} name="Sofía Ramírez Castro" phone="55 1029 3847"
                             email="sofia.ramirez@correo.mx"/>
            )}
            <p className="hint">{t('card.whoSees')}</p>
        </Sheet>
    );
}
