/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Module Federation remote type declarations
declare module 'engagement/PatientPortal' {
  import { FC } from 'react';
  const PatientPortal: FC<{ patientId: string }>;
  export default PatientPortal;
}

declare module 'engagement/NotificationInbox' {
  import { FC } from 'react';
  const NotificationInbox: FC<{ patientId: string }>;
  export default NotificationInbox;
}
