import { useState, useEffect, useCallback } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@healthcare/design-system';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface UserAccount {
  id: string;
  externalId: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

interface UsersResponse {
  total: number;
  page: number;
  pageSize: number;
  users: UserAccount[];
}

interface CreateForm {
  externalId: string;
  email: string;
  fullName: string;
  role: string;
}

interface EditForm {
  email: string;
  fullName: string;
}

const ROLES = ['PlatformAdmin', 'ClinicalAdmin', 'Clinician', 'Patient', 'Auditor'];

export default function IdentityUserAdminPanel() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ externalId: '', email: '', fullName: '', role: 'Clinician' });
  const [creating, setCreating] = useState(false);

  const [editUser, setEditUser] = useState<UserAccount | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ email: '', fullName: '' });
  const [saving, setSaving] = useState(false);

  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/users?page=1&pageSize=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: UsersResponse = await res.json();
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function createUser() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCreateOpen(false);
      setCreateForm({ externalId: '', email: '', fullName: '', role: 'Clinician' });
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    if (!editUser) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditUser(null);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  }

  async function deactivateUser(id: string) {
    setDeactivatingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/users/${id}/deactivate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user');
    } finally {
      setDeactivatingId(null);
    }
  }

  const canCreate =
    createForm.externalId.trim() &&
    createForm.email.trim() &&
    createForm.fullName.trim() &&
    !!createForm.role;

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>
          Identity User Administration
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label={`${total} users`} size="small" />
          <IconButton size="small" onClick={fetchUsers} disabled={loading} aria-label="refresh users">
            <RefreshIcon fontSize="small" />
          </IconButton>
          <Button onClick={() => setCreateOpen(true)} disabled={loading}>
            Add User
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {loading && <CircularProgress size={24} />}

      <Card>
        <CardHeader><CardTitle>User Accounts</CardTitle></CardHeader>
        <CardContent>
          {users.length === 0 && !loading ? (
            <Alert severity="info">No user accounts found.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Login</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{u.displayName}</Typography>
                      <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                        {u.id}
                      </Typography>
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Chip label={u.role} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Badge color={u.isActive ? 'success' : 'default'}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="outline"
                          onClick={() => {
                            setEditUser(u);
                            setEditForm({ email: u.email, fullName: u.displayName });
                          }}
                        >
                          Edit
                        </Button>
                        {u.isActive && (
                          <Button
                            size="small"
                            variant="outline"
                            onClick={() => deactivateUser(u.id)}
                            disabled={deactivatingId === u.id}
                            aria-label={`deactivate ${u.email}`}
                          >
                            {deactivatingId === u.id ? <CircularProgress size={14} /> : 'Deactivate'}
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add User Account</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                label="External ID (Entra Object ID)"
                fullWidth
                required
                value={createForm.externalId}
                onChange={(e) => setCreateForm((f) => ({ ...f, externalId: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Full Name"
                fullWidth
                required
                value={createForm.fullName}
                onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  label="Role"
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                >
                  {ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button onClick={createUser} disabled={!canCreate || creating}>
            {creating ? <CircularProgress size={16} /> : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onClose={() => setEditUser(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User — {editUser?.displayName}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Full Name"
                fullWidth
                value={editForm.fullName}
                onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
          <Button onClick={saveEdit} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
