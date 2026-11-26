import {t, type TextKey} from '../../lib/texts';
import {dayMonthYear} from '../../lib/format';
import {LEGAL} from '../../lib/legal';
import {Screen} from '../../ui/Screen';

/**
 * Lyra's own terms of use and privacy notice (LFPDPPP), open to anyone, signed in or not. Each
 * school's terms (its PDF, accepted in the app) come on top of these: the school is responsible for
 * its students' data, and Lyra processes it on the school's behalf.
 */
const SECTIONS = ['who', 'roles', 'data', 'health', 'purposes', 'sharing', 'keeping', 'rights', 'minors', 'security', 'use', 'changes'] as const;

export function Legal() {
    return (
        <Screen title={t('legal.title')} subtitle={t('legal.updated', {when: dayMonthYear(LEGAL.updated)})} back="/"
                nav={false}>
            <p>{t('legal.intro', {owner: LEGAL.owner})}</p>
            {SECTIONS.map(section => (
                <section key={section} className="stack gap-xs">
                    <h2 className="section-title">{t(`legal.${section}.title` as TextKey)}</h2>
                    {t(`legal.${section}.body` as TextKey, {
                        owner: LEGAL.owner,
                        email: LEGAL.contact
                    }).split('\n\n').map(paragraph => (
                        <p key={paragraph} className="small">{paragraph}</p>
                    ))}
                </section>
            ))}
            <h2 className="section-title">{t('legal.contact.title')}</h2>
            <p className="small">{t('legal.contact.body', {owner: LEGAL.owner})}</p>
            <p className="small"><a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a></p>
            {LEGAL.address && <p className="small">{LEGAL.address}</p>}
        </Screen>
    );
}
