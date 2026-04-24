import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  { extends: 'apps/shell/vitest.config.ts' },
  { extends: 'apps/triage-mfe/vitest.config.ts' },
  { extends: 'apps/voice-mfe/vitest.config.ts' },
  { extends: 'apps/scheduling-mfe/vitest.config.ts' },
  { extends: 'apps/pophealth-mfe/vitest.config.ts' },
  { extends: 'apps/revenue-mfe/vitest.config.ts' },
  { extends: 'apps/encounters-mfe/vitest.config.ts' },
  { extends: 'apps/engagement-mfe/vitest.config.ts' },
]);
