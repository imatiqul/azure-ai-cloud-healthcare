import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { useState } from 'react';
import { TriageViewer } from './components/TriageViewer';
import { EscalationQueue } from './components/EscalationQueue';

export default function App() {
  const [tab, setTab] = useState(0);
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        AI Triage &amp; Escalations
      </Typography>
      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Triage Workflows" />
        <Tab label="Escalation Queue" />
      </Tabs>
      {tab === 0 && <TriageViewer />}
      {tab === 1 && <EscalationQueue />}
    </Box>
  );
}

