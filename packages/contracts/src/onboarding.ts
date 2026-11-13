export const onboardingSteps = {
  profile: 'Profile and role',
  capability: 'Desired capability',
  assessment: 'Assessment findings',
  schedule: 'Capacity and calendar',
  measures: 'Measures of success',
  resources: 'Learning resources',
} as const;
export type OnboardingStep = keyof typeof onboardingSteps;
export const onboardingFields = {
  profile: {
    current_role: 'Current role',
    responsibilities: 'Responsibilities',
    experience: 'Experience',
    tools: 'Tools available',
    preferences: 'Language and accessibility preferences',
  },
  capability: {
    target_role: 'Target role or skill',
    purpose: 'Business purpose',
    proficiency: 'Expected proficiency',
    success: 'Practical examples of success',
    prerequisites: 'Prerequisite skills',
    competencies: 'Target competencies (one per line)',
  },
  assessment: {
    source: 'Source or assessment reference',
    provider: 'Provider or observer',
    date: 'Assessment date',
    scale: 'Scoring scale (or not scored)',
    findings: 'Findings to confirm',
    kind: 'Evidence type',
  },
  resources: {
    title: 'Approved resource title',
    reference: 'Resource URL or internal reference',
    licence: 'Licence or permission to use',
    cost: 'Cost and budget approval',
    access: 'Member access and required software checked',
    tasks: 'Suitable practical tasks',
  },
} as const;
