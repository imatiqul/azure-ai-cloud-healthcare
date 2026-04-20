import { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@healthcare/design-system';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface SendResult {
  otpId: string;
  expiresAt: string;
}

interface VerifyResult {
  verified: boolean;
  phoneNumber: string;
}

type Step = 'send' | 'verify' | 'done';

export function OtpVerificationPanel() {
  const [step, setStep] = useState<Step>('send');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userId, setUserId] = useState('');
  const [otpId, setOtpId] = useState('');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sendOtp = useCallback(async () => {
    if (!phoneNumber.trim()) return;
    setLoading(true);
    setError('');
    try {
      const body: { phoneNumber: string; userId?: string } = { phoneNumber };
      if (userId.trim()) body.userId = userId.trim();
      const res = await fetch(`${API_BASE}/api/v1/identity/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      const data = (await res.json()) as SendResult;
      setOtpId(data.otpId);
      setExpiresAt(data.expiresAt);
      setStep('verify');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, userId]);

  const verifyOtp = useCallback(async () => {
    if (code.trim().length < 4 || !otpId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpId, code }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      const data = (await res.json()) as VerifyResult;
      setResult(data);
      setStep('done');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, [code, otpId]);

  const reset = () => {
    setStep('send');
    setPhoneNumber('');
    setUserId('');
    setOtpId('');
    setCode('');
    setExpiresAt('');
    setResult(null);
    setError('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>OTP Phone Verification</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {step === 'send' && (
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Phone Number"
              placeholder="+12125551234"
              helperText="E.164 format required, e.g. +12125551234"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              fullWidth
            />
            <TextField
              label="User ID (optional)"
              helperText="Associate this verification with an existing user account"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              fullWidth
            />
            <Button
              onClick={sendOtp}
              disabled={!phoneNumber.trim() || loading}
            >
              {loading ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
              Send Verification Code
            </Button>
          </Box>
        )}

        {step === 'verify' && (
          <Box display="flex" flexDirection="column" gap={2}>
            <Alert severity="info">
              A 6-digit code was sent to <strong>{phoneNumber}</strong>.
              {expiresAt && ` Valid until ${new Date(expiresAt).toLocaleTimeString()}.`}
            </Alert>
            <TextField
              label="Verification Code"
              placeholder="123456"
              inputProps={{ maxLength: 6 }}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              fullWidth
            />
            <Box display="flex" gap={1}>
              <Button
                onClick={verifyOtp}
                disabled={code.trim().length < 4 || loading}
              >
                {loading ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
                Verify Code
              </Button>
              <Button onClick={reset}>
                Start Over
              </Button>
            </Box>
          </Box>
        )}

        {step === 'done' && result && (
          <Box display="flex" flexDirection="column" gap={2}>
            <Alert severity="success">Phone number verified successfully.</Alert>
            <Box display="flex" gap={1} flexWrap="wrap">
              <Chip label={`Phone: ${result.phoneNumber}`} color="success" />
              <Chip label="Verified" color="success" variant="filled" />
            </Box>
            <Button onClick={reset}>
              Verify Another Number
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
