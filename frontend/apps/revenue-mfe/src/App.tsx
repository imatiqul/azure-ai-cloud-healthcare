import Grid from '@mui/material/Grid';
import { CodingQueue } from './components/CodingQueue';
import { PriorAuthTracker } from './components/PriorAuthTracker';

export default function App() {
  return (
    <Grid container spacing={3} sx={{ p: 3 }}>
      <Grid size={{ xs: 12, md: 6 }}>
        <CodingQueue />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <PriorAuthTracker />
      </Grid>
    </Grid>
  );
}
