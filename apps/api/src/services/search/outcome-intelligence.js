const clean = value => String(value ?? '').normalize('NFKC').replace(/<[^>]*>/g, ' ').replace(/[\\u0000-\\u001f\\u007f]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 500);

const KNOWN_INSTITUTIONS = [
  { pattern: /\\b(?:abuad|afe\\s+babalola\\s+university)\\b/i, name: 'Afe Babalola University', shortName: 'ABUAD', domain: 'abuad.edu.ng', country: 'Nigeria' }
];

export function enrichOutcomeIntent(originalQuery, intent) {
  const query = clean(originalQuery);
  const entities = [...(intent.entities || [])];
  const addEntity = entity => {
    if (!entities.some(item => item.text.toLowerCase() === entity.text.toLowerCase() && item.role === entity.role)) entities.push(entity);
  };
  const institution = KNOWN_INSTITUTIONS.find(item => item.pattern.test(query));
  if (institution) {
    addEntity({ text: institution.name, kind: 'university', role: 'institution' });
    addEntity({ text: institution.shortName, kind: 'university-alias', role: 'institution-alias' });
  }
  const programme = /\\bmechatronics(?:\\s+engineering)?\\b/i.test(query)
    ? 'Mechatronics Engineering'
    : '';
  if (programme) addEntity({ text: programme, kind: 'academic-programme', role: 'programme' });

  const geography = institution?.country || '';
  const constraints = [...(intent.constraints || [])];
  if (geography && !constraints.some(value => /country|geography/i.test(value))) constraints.push('Country: ' + geography);

  const subjectParts = [institution?.shortName, programme].filter(Boolean);
  const searchQuery = subjectParts.length ? subjectParts.join(' ') : intent.searchQuery || intent.subject || query;
  const tasksByType = {
    'fees-costs': [
      { id: 'confirm-target', label: 'Confirm the institution and exact programme', required: true },
      { id: 'official-fees', label: 'Find the current official tuition or fee schedule', required: true },
      { id: 'additional-costs', label: 'Identify compulsory additional charges and one-time fees', required: true },
      { id: 'session-validity', label: 'Verify the academic session and effective date of each fee', required: true },
      { id: 'total-cost', label: 'Calculate a transparent total and separate unconfirmed costs', required: true }
    ],
    application: [
      { id: 'official-route', label: 'Find the official application route', required: true },
      { id: 'programme', label: 'Confirm the programme is offered', required: true },
      { id: 'eligibility', label: 'Find published entry requirements', required: true },
      { id: 'dates', label: 'Check application dates and deadlines', required: true },
      { id: 'next-steps', label: 'Explain the application steps and required documents', required: true }
    ]
  };
  const researchTasks = tasksByType[intent.type] || (intent.subgoals || []).map((label, index) => ({
    id: 'task-' + (index + 1), label, required: true
  }));
  const goalLabels = {
    'fees-costs': 'Find the current cost of studying ' + (programme || 'the requested programme') + ' at ' + (institution?.name || intent.subject || 'the requested institution'),
    application: 'Help the user complete the application objective for ' + (institution?.name || intent.subject || 'the requested institution')
  };
  return {
    ...intent,
    subject: searchQuery,
    searchQuery,
    entities: entities.slice(0, 10),
    constraints,
    researchTasks,
    expectedOutcome: intent.type === 'fees-costs'
      ? 'An itemized, source-backed cost breakdown with academic-session validity and clearly stated unknowns.'
      : intent.type === 'application'
        ? 'A verified official route and a practical sequence of next steps.'
        : 'A direct answer to the requested outcome, supported by relevant evidence.',
    goal: goalLabels[intent.type] || intent.goal,
    institution: institution ? { name: institution.name, shortName: institution.shortName, domain: institution.domain } : null,
    programme: programme || null,
    geography: geography || null,
    completionCriteria: researchTasks.map(task => task.id)
  };
}

export function buildOutcomeSearchQueries(intent) {
  if (!intent?.institution || !intent?.programme) return [];
  const { shortName, name, domain } = intent.institution;
  const programme = intent.programme;
  if (intent.type === 'fees-costs') return [
    { query: 'site:' + domain + ' ' + programme + ' fees', reason: 'official institution source: programme fees' },
    { query: 'site:' + domain + ' undergraduate school fees fee schedule', reason: 'official institution source: fee schedule' },
    { query: '"' + name + '" "' + programme + '" tuition fees', reason: 'institution and programme exact-match fee search' },
    { query: shortName + ' ' + programme + ' acceptance fee accommodation compulsory charges', reason: 'additional costs associated with the programme' },
    { query: shortName + ' current academic session undergraduate fee schedule', reason: 'check fee schedule session and currency' }
  ];
  if (intent.type === 'application') return [
    { query: 'site:' + domain + ' ' + programme + ' admissions application', reason: 'official institution source: programme application' },
    { query: 'site:' + domain + ' undergraduate admission requirements', reason: 'official institution source: entry requirements' }
  ];
  return [];
}
