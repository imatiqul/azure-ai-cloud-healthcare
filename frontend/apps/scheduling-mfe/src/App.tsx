import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import { SlotCalendar } from './components/SlotCalendar';
import { BookingForm } from './components/BookingForm';

export default function App() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Appointment Scheduling
      </Typography>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <SlotCalendar />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <BookingForm />
        </Grid>
      </Grid>
    </Box>
  );
}
