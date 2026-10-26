import type { Lang } from '../i18n';

/**
 * The SkillPass Terms of Service, in plain language. Keep this in step with backend/src/lib/terms.js:
 * when anything here changes, change TERMS_VERSION in both places so everyone is asked to accept the new version.
 */
export const TERMS_VERSION = '2026-10-v1';
export const TERMS_EFFECTIVE = '26 October 2026';

export interface TermsSection {
  id: string;
  title: string;
  points: string[];
}

export interface TermsText {
  title: string;
  intro: string;
  shortTitle: string;
  short: string[];
  sections: TermsSection[];
  contact: string;
}

const en: TermsText = {
  title: 'Terms of Service',
  intro: 'These terms explain how SkillPass works and what everyone using it agrees to: assessors, artisans, employers and the administrator. They are written in plain language on purpose. If anything is unclear, ask the administrator before you agree.',
  shortTitle: 'The terms in short',
  short: [
    'SkillPass is a research pilot. It is free to use. During the pilot, payments run in test mode, so no real money moves.',
    'An assessor can only sign a skill they watched you do live. Nobody may pay or be paid for a credential.',
    'Before any job starts, the employer and the artisan agree the price in the app, with materials and workmanship (labour) shown separately.',
    'The employer pays the full agreed amount into escrow before work starts. SkillPass holds it; neither side can take it back alone.',
    'If the artisan is buying the materials, the materials money is sent to them as soon as the employer pays. The workmanship money stays held.',
    'When the artisan marks the job done (with before and after photos), the employer has 3 days to confirm or raise a dispute. If they do neither, the workmanship money is released to the artisan automatically.',
    'If there is a dispute, the held money is frozen. Both sides give their side, and the administrator decides how it is shared.',
    'Either side can call a job off for free before the employer pays. After that, it can only be ended through a dispute.',
  ],
  sections: [
    {
      id: 'about',
      title: '1. About these terms',
      points: [
        'SkillPass is a final-year research project at the African Leadership University, run as a pilot in Lagos, Nigeria. "We" means the SkillPass pilot team; "you" means anyone with a SkillPass account.',
        'You accept these terms when you create an account. Each job agreement also records the version of these terms that both sides accepted.',
        'If we change these terms, we will show you the new version and ask you to accept it before you continue. Jobs already agreed keep the terms they were agreed under.',
      ],
    },
    {
      id: 'who',
      title: '2. Who can use SkillPass',
      points: [
        'You must be 18 or older and live or work in Nigeria.',
        'One person, one account, one phone number. You must confirm your phone number by SMS code before you can confirm skills, rate or hire.',
        'The details you give must be true: your name, phone, trade, location and, for assessors, your trade association membership.',
        'Assessors and employers are checked and approved by the administrator before they can use the main features.',
      ],
    },
    {
      id: 'roles',
      title: '3. The four roles',
      points: [
        'Assessor: an experienced, approved tradesperson who watches an artisan perform a skill and signs a credential for it. New assessors are on probation and need a second assessor to co-sign; Advanced skills always need a co-signer.',
        'Artisan: a person with a trade skill, whether they learned it as an apprentice or taught themselves. Artisans confirm their credentials, share their Skills Passport and take jobs.',
        'Employer: a business or person who checks credentials, posts jobs and hires artisans through SkillPass.',
        'Administrator: runs the pilot, approves accounts, audits credentials, investigates reports and decides disputes.',
      ],
    },
    {
      id: 'credentials',
      title: '4. Skill credentials',
      points: [
        'An assessor may only sign a credential for a skill they watched the artisan perform live, recorded with the SkillPass camera. Photos and videos from a phone gallery are not accepted.',
        'Every credential is checked against the skill\'s rubric, carries the date, time and location of the evidence, and is digitally signed so it cannot be changed without detection.',
        'A credential only becomes valid after the artisan confirms they really did it. Only confirm skills you actually performed.',
        'Nobody may ask for, offer or accept money, gifts or favours for a credential. Artisans can report this privately from the Confirm & Report page; the assessor is never told who reported.',
        'Credentials can be randomly audited. A credential found to be false is revoked. It stays visible as revoked, with the reason, so employers are not misled.',
        'An assessor\'s trust score is shown next to every credential they sign. It is based on audit results (40%), employer ratings of the artisans they passed (30%) and how few of their credentials are flagged (30%). Proven misconduct caps it at 10.',
      ],
    },
    {
      id: 'jobs',
      title: '5. Jobs, quotes and agreements',
      points: [
        'When posting a job, the employer says who will buy the materials (the employer or the artisan) and gives a budget for materials and for workmanship (labour).',
        'An artisan who is interested sends a quote: their price for the workmanship, the cost of materials if they are buying them, and the date they can start.',
        'The employer then offers a job agreement with the exact amounts, the start date and a short description of the work included (the scope). The artisan reads it and accepts or declines.',
        'Once both sides accept, the agreement is between the employer and the artisan. SkillPass is not the employer and does not do the work. Our part is to hold the money fairly and help if something goes wrong.',
        'If the job changes (for example, an extra room), agree it in the app with a new agreement. Extra work agreed outside the app is not covered by escrow, and SkillPass cannot help with it in a dispute.',
      ],
    },
    {
      id: 'payments',
      title: '6. Payments and escrow',
      points: [
        'Before work starts, the employer pays the full agreed amount into escrow through Paystack: the workmanship fee, plus the materials amount if the artisan is buying the materials.',
        'Materials money is sent to the artisan\'s bank account as soon as the employer pays, so they can buy what the job needs. The artisan must spend it on the materials listed and keep the receipts; the administrator can ask to see them.',
        'Workmanship money is held until the job is finished. It is released to the artisan when the employer confirms the work is done.',
        'After the artisan marks the job done, the employer has 3 days (the review period) to confirm or raise a dispute. If the employer does neither, the workmanship money is released to the artisan automatically.',
        'Payouts go to the bank account the artisan saved in SkillPass, usually within 1 to 2 working days. Refunds go back to the employer\'s card or account, usually within 5 to 10 working days.',
        'SkillPass charges no fee during the pilot. Outside test mode, Paystack\'s card processing fee is shown at checkout and paid by the employer.',
        'Either side can call off an agreement for free before the employer pays. After payment, a job can only be ended through a dispute.',
        'If you pay or are paid outside SkillPass, we cannot hold, release or return that money.',
        'During the pilot, payments run in test mode: the checkout works the same way, but no real money moves.',
      ],
    },
    {
      id: 'photos',
      title: '7. Before and after photos',
      points: [
        'The artisan takes at least one photo of the site before starting and one of the finished work, with the SkillPass camera. Each photo records the time and location.',
        'The job cannot be marked done without them. They are the main evidence if there is a dispute, so make sure they clearly show the work.',
        'Only the two sides of the job and the administrator can see these photos.',
      ],
    },
    {
      id: 'disputes',
      title: '8. Disputes',
      points: [
        'Either side can raise a dispute while money is held: for example poor work, the job not finished, someone not showing up, a problem with materials, the job being changed, or the employer not confirming.',
        'When a dispute is raised, the held money is frozen. Nothing is released until the administrator decides.',
        'The other side is told and should give their account within 3 days.',
        'The administrator looks at the agreement and its scope, the before and after photos, both accounts and any receipts, then decides what share of the held workmanship money goes to the artisan (from 0% to 100%). The rest is refunded to the employer. We aim to decide within 5 working days.',
        'Materials money already sent to the artisan cannot be pulled back by SkillPass. If the materials were not bought, the administrator can take that into account when sharing the workmanship money.',
        'The administrator\'s decision is final within SkillPass. It does not stop either side from seeking help elsewhere, for example from their trade association or the courts.',
        'Raising a dispute in bad faith, or giving false information, can lead to suspension.',
      ],
    },
    {
      id: 'ratings',
      title: '9. Ratings',
      points: [
        'After a job, the employer rates the artisan and the artisan rates the employer. Each side can rate a job once.',
        'Ratings must be honest and about the job. Employer ratings of an artisan also count towards the trust score of the assessors who signed that artisan\'s skills.',
        'Ratings are tied to a real job in SkillPass, so they cannot be made up.',
      ],
    },
    {
      id: 'conduct',
      title: '10. What is not allowed',
      points: [
        'Fake or reused evidence, signing skills that were not seen, or confirming skills you did not perform.',
        'Asking for or offering money or favours for a credential, a rating or a job.',
        'Threats, harassment or pressure on anyone, especially artisans who depend on an assessor.',
        'Creating more than one account, or using someone else\'s.',
        'Breaking these rules can lead to credentials being revoked, an assessor\'s trust score being capped at 10, and the account being suspended.',
      ],
    },
    {
      id: 'privacy',
      title: '11. Your data',
      points: [
        'We handle personal data under the Nigeria Data Protection Act 2023, as explained when you gave consent.',
        'Bank details are used only to send payouts. Only the last four digits are shown in the app.',
        'You can withdraw consent at any time from your profile. Your account is then closed and your personal data, including bank details, is removed or anonymised. Money already held for a job is settled under section 6 first.',
      ],
    },
    {
      id: 'limits',
      title: '12. The limits of SkillPass',
      points: [
        'SkillPass checks that an assessor watched a skill being performed. It does not guarantee the quality of any particular job.',
        'Employers remain responsible for safety on their sites, and artisans for working safely and to the standards of their trade.',
        'SkillPass is a pilot and may sometimes be unavailable. For any job, the most SkillPass is responsible for is the money held in escrow for that job.',
      ],
    },
  ],
  contact: 'Questions about these terms: contact the pilot administrator, Fejiro Obiku, at o.obiku@alustudent.com.',
};

const pcm: TermsText = {
  title: 'Terms of Service (Wetin we agree)',
  intro: 'This terms dey explain how SkillPass dey work and wetin everybody wey dey use am agree to: assessors, artisans, employers and the administrator. We write am for simple language on purpose. If anything no clear, ask the administrator before you agree.',
  shortTitle: 'The terms for short',
  short: [
    'SkillPass na research pilot. E dey free. As pilot dey run, payment dey for test mode, so no real money go move.',
    'Assessor fit sign only skill wey im see you do with im own eye. Nobody suppose pay or collect money for credential.',
    'Before any work start, employer and artisan go agree the price inside the app, with materials and workmanship (labour) separate.',
    'Employer go pay the full amount wey dem agree into escrow before work start. SkillPass go hold am; nobody fit collect am back alone.',
    'If na artisan dey buy materials, dem go send the materials money to am as soon as employer pay. The workmanship money go remain for hold.',
    'When artisan mark say work don finish (with before and after photos), employer get 3 days to confirm or raise dispute. If e no do any, the workmanship money go release to artisan by itself.',
    'If wahala dey (dispute), the money wey dey hold go freeze. Both sides go talk their own side, and the administrator go decide how dem go share am.',
    'Any side fit cancel the job free before employer pay. After payment, na only through dispute e fit end.',
  ],
  sections: [
    {
      id: 'about',
      title: '1. About this terms',
      points: [
        'SkillPass na final-year research project for African Leadership University, wey dey run as pilot for Lagos, Nigeria. "We" mean the SkillPass pilot team; "you" mean anybody wey get SkillPass account.',
        'You don accept this terms when you open account. Every job agreement go also record the version of this terms wey both sides accept.',
        'If we change this terms, we go show you the new one and ask you to accept am before you continue. Jobs wey don already agree go keep the terms dem agree with.',
      ],
    },
    {
      id: 'who',
      title: '2. Who fit use SkillPass',
      points: [
        'You must be 18 years or pass, and you dey live or work for Nigeria.',
        'One person, one account, one phone number. You must confirm your number with SMS code before you fit confirm skills, rate or hire.',
        'Wetin you write must be true: your name, phone, trade, location and, for assessors, your trade association membership.',
        'Administrator go check and approve assessors and employers before dem fit use the main features.',
      ],
    },
    {
      id: 'roles',
      title: '3. The four roles',
      points: [
        'Assessor: experienced tradesperson wey dem don approve, wey dey watch artisan do skill and sign credential for am. New assessors dey for probation and need second assessor to co-sign; Advanced skills always need co-signer.',
        'Artisan: person wey sabi trade, whether na apprenticeship e take learn am or e teach imself. Artisans dey confirm their credentials, share their Skills Passport and take jobs.',
        'Employer: business or person wey dey check credentials, post jobs and hire artisans through SkillPass.',
        'Administrator: na im dey run the pilot, approve accounts, audit credentials, check reports and decide disputes.',
      ],
    },
    {
      id: 'credentials',
      title: '4. Skill credentials',
      points: [
        'Assessor fit sign credential only for skill wey im watch the artisan do live, with the SkillPass camera. Photos or videos from phone gallery no dey allowed.',
        'Every credential dey check against the skill rubric, e get the date, time and place of the evidence, and e get digital signature so nobody fit change am without people know.',
        'Credential go become valid only after the artisan confirm say na true e do am. Confirm only skills wey you really do.',
        'Nobody suppose ask, offer or collect money, gift or favour for credential. Artisans fit report am privately for Confirm & Report page; dem no go ever tell the assessor who report.',
        'Dem fit audit credentials anyhow (random). If credential na lie, dem go revoke am. E go still show as revoked with the reason, so nobody go deceive employers.',
        'Assessor trust score dey show beside every credential wey im sign. E come from audit results (40%), employer ratings of artisans wey im pass (30%) and how few of im credentials dem flag (30%). If misconduct prove, the score go stop for 10.',
      ],
    },
    {
      id: 'jobs',
      title: '5. Jobs, quotes and agreements',
      points: [
        'When employer post job, e go talk who go buy materials (employer or artisan) and give budget for materials and for workmanship (labour).',
        'Artisan wey interest go send quote: im price for the workmanship, how much materials go cost if na im dey buy am, and the date wey e fit start.',
        'Employer go then offer job agreement with the exact amount, start date and small description of the work wey dey inside (the scope). Artisan go read am, then accept or decline.',
        'Once both sides accept, the agreement na between employer and artisan. SkillPass no be the employer and no dey do the work. Our own na to hold the money well and help if something go wrong.',
        'If the job change (like extra room), agree am inside the app with new agreement. Extra work wey you agree outside the app no dey covered by escrow, and SkillPass no fit help for dispute about am.',
      ],
    },
    {
      id: 'payments',
      title: '6. Payment and escrow',
      points: [
        'Before work start, employer go pay the full amount wey dem agree into escrow through Paystack: the workmanship fee, plus materials money if na artisan dey buy the materials.',
        'Dem go send materials money to the artisan bank account as soon as employer pay, so e fit buy wetin the job need. Artisan must use am buy the materials wey dem list and keep the receipts; administrator fit ask to see dem.',
        'Workmanship money go remain for hold until the work finish. E go release to the artisan when employer confirm say work don finish.',
        'After artisan mark say work don finish, employer get 3 days (review period) to confirm or raise dispute. If employer no do any, the workmanship money go release to artisan by itself.',
        'Payouts dey go the bank account wey artisan save for SkillPass, normally within 1 to 2 working days. Refunds dey go back to employer card or account, normally within 5 to 10 working days.',
        'SkillPass no dey collect any fee during the pilot. Outside test mode, Paystack card fee go show for checkout and na employer go pay am.',
        'Any side fit cancel agreement free before employer pay. After payment, na only through dispute job fit end.',
        'If you pay or collect money outside SkillPass, we no fit hold, release or return that money.',
        'During the pilot, payment dey run for test mode: checkout dey work the same way, but no real money dey move.',
      ],
    },
    {
      id: 'photos',
      title: '7. Before and after photos',
      points: [
        'Artisan go snap at least one photo of the place before e start, and one of the finished work, with the SkillPass camera. Every photo dey record the time and place.',
        'You no fit mark job as done without dem. Na dem be the main evidence if wahala come, so make sure dem show the work well.',
        'Na only the two sides of the job and the administrator fit see this photos.',
      ],
    },
    {
      id: 'disputes',
      title: '8. Disputes (wahala)',
      points: [
        'Any side fit raise dispute while money dey hold: like bad work, job no finish, person no show, materials problem, job change, or employer no gree confirm.',
        'When dispute start, the money wey dey hold go freeze. Nothing go release until the administrator decide.',
        'Dem go tell the other side, and e suppose talk im own side within 3 days.',
        'The administrator go look the agreement and the scope, the before and after photos, wetin both sides talk and any receipt, then decide how much of the workmanship money go reach the artisan (from 0% to 100%). The rest go return to the employer. We dey try decide within 5 working days.',
        'SkillPass no fit pull back materials money wey don reach the artisan. If artisan no buy the materials, administrator fit consider am when e dey share the workmanship money.',
        'Wetin the administrator decide na final inside SkillPass. E no stop any side from finding help somewhere else, like their trade association or court.',
        'If you raise dispute wey no get basis, or you talk lie, dem fit suspend your account.',
      ],
    },
    {
      id: 'ratings',
      title: '9. Ratings',
      points: [
        'After job, employer go rate the artisan and artisan go rate the employer. Each side fit rate one job once.',
        'Ratings must be true and about the job. Employer ratings of artisan dey also count for the trust score of the assessors wey sign the artisan skills.',
        'Ratings dey tied to real job inside SkillPass, so nobody fit just make am up.',
      ],
    },
    {
      id: 'conduct',
      title: '10. Wetin no dey allowed',
      points: [
        'Fake evidence or evidence wey dem don use before, signing skills wey you no see, or confirming skills wey you no do.',
        'To ask or offer money or favour for credential, rating or job.',
        'Threat, harassment or pressure for anybody, especially artisans wey depend on assessor.',
        'To open more than one account, or use another person own.',
        'If you break this rules, dem fit revoke credentials, cap assessor trust score for 10, and suspend the account.',
      ],
    },
    {
      id: 'privacy',
      title: '11. Your data',
      points: [
        'We dey handle personal data under the Nigeria Data Protection Act 2023, as we explain when you give consent.',
        'We dey use bank details only to send payouts. Na only the last four numbers dey show for the app.',
        'You fit withdraw consent anytime from your profile. Dem go close your account and remove or hide your personal data, including bank details. Money wey dey hold for any job go settle first under section 6.',
      ],
    },
    {
      id: 'limits',
      title: '12. Wetin SkillPass no fit do',
      points: [
        'SkillPass dey check say assessor watch the skill. E no fit guarantee how good any particular job go be.',
        'Employers still dey responsible for safety for their site, and artisans for working safe and according to the standard of their trade.',
        'SkillPass na pilot and e fit no dey available sometimes. For any job, the most SkillPass dey responsible for na the money wey dey hold for escrow for that job.',
      ],
    },
  ],
  contact: 'If you get question about this terms: contact the pilot administrator, Fejiro Obiku, for o.obiku@alustudent.com.',
};

export const termsText: Record<Lang, TermsText> = { en, pcm };
