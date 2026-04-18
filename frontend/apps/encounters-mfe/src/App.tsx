import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { EncounterList } from './components/EncounterList';

export default function App() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Clinical Encounters
      </Typography>
      <EncounterList />
    </Box>
  );
}
