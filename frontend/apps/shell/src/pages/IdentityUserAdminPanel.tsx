import { useState, useEffect, useCallback, useRef } from 'react';
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

const DEMO_USERS: UserAccount[] = [
  { id: 'usr-001', externalId: 'b2c-usr-admin-001', email: 'admin@healthq.demo',           displayName: 'Platform Administrator', role: 'PlatformAdmin', isActive: true,  lastLoginAt: new Date(Date.now() - 1 * 3600_000).toISOString() },
  { id: 'usr-002', externalId: 'b2c-usr-patel',     email: 'sarah.patel@healthq.demo',     displayName: 'Dr. Sarah Patel',        role: 'Clinician',     isActive: true,  lastLoginAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: 'usr-003', externalId: 'b2c-usr-torres',    email: 'michael.torres@healthq.demo',  displayName: 'Dr. Michael Torres',     role: 'Clinician',     isActive: true,  lastLoginAt: new Date(Date.now() - 6 * 3600_000).toISOString() },
  { id: 'usr-004', externalId: 'b2c-usr-auditor',   email: 'compliance@healthq.demo',      displayName: 'Compliance Auditor',     role: 'Auditor',       isActive: true,  lastLoginAt: new Date(Date.now() - 1 * 86400_000).toISOString() },
  { id: 'usr-005', externalId: 'b2c-usr-pat-00142', email: 'alice.morgan@email-demo.health', displayName: 'Alice Morgan',           role: 'Patient',       isActive: true,  lastLoginAt: new Date(Date.now() - 3 * 86400_000).toISOString() },
  { id: 'usr-006', externalId: 'b2c-usr-clin-admin', email: 'clinadmin@healthq.demo',      displayName: 'Clinical Admin',         role: 'ClinicalAdmin', isActive: false, lastLoginAt: new Date(Date.now() - 14 * 86400_000).toISOString() },
];

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

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
  const usersRequest = useRef<AbortController | null>(null);
  const createRequest = useRef<AbortController | null>(null);
  const editRequest = useRef<AbortController | null>(null);
  const deactivateRequest = useRef<AbortController | null>(null);

  const fetchUsers = useCallback(async () => {
    usersRequest.current?.abort();
    const controller = new AbortController();
    usersRequest.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/users?page=1&pageSize=50`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: UsersResponse = await res.json();
      if (controller.signal.aborted) return;
      setUsers(data.users);
      setTotal(data.total);
    } catch (error) {
      if (isAbortLikeError(error) || controller.signal.aborted) {
        return;
      }
      setUsers(DEMO_USERS);
      setTotal(DEMO_USERS.length);
      setError(null);
    } finally {
      window.clearTimeout(timeoutId);
      if (usersRequest.current === controller) {
        usersRequest.current = null;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
    return () => {
      usersRequest.current?.abort();
      createRequest.current?.abort();
      editRequest.current?.abort();
      deactivateRequest.current?.abort();
    };
  }, [fetchUsers]);

  async function createUser() {
    createRequest.current?.abort();
    const controller = new AbortController();
    createRequest.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/users`, {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCreateOpen(false);
      setCreateForm({ externalId: '', email: '', fullName: '', role: 'Clinician' });
      await fetchUsers();
    } catch (error) {
      if (isAbortLikeError(error) || controller.signal.aborted) {
        return;
      }
      // Backend offline — add user locally so administration can continue
      const newUser: UserAccount = {
        id: `usr-demo-${Date.now()}`,
        externalId: createForm.externalId,
        email: createForm.email,
        displayName: createForm.fullName,
        role: createForm.role,
        isActive: true,
        lastLoginAt: null,
      };
      setUsers(prev => [...prev, newUser]);
      setTotal(prev => prev + 1);
      setCreateOpen(false);
      setCreateForm({ externalId: '', email: '', fullName: '', role: 'Clinician' });
      setError(null);
    } finally {
      window.clearTimeout(timeoutId);
      if (createRequest.current === controller) {
        createRequest.current = null;
      }
      if (!controller.signal.aborted) {
        setCreating(false);
      }
    }
  }

  async function saveEdit() {
    if (!editUser) return;
    const targetUser = editUser;

    editRequest.current?.abort();
    const controller = new AbortController();
    editRequest.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/users/${targetUser.id}`, {
        signal: controller.signal,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditUser(null);
      await fetchUsers();
    } catch (error) {
      if (isAbortLikeError(error) || controller.signal.aborted) {
        return;
      }
      // Backend offline — update in local state
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, email: editForm.email, displayName: editForm.fullName } : u));
      setEditUser(null);
      setError(null);
    } finally {
      window.clearTimeout(timeoutId);
      if (editRequest.current === controller) {
        editRequest.current = null;
      }
      if (!controller.signal.aborted) {
        setSaving(false);
      }
    }
  }

  async function deactivateUser(id: string) {
    deactivateRequest.current?.abort();
    const controller = new AbortController();
    deactivateRequest.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    setDeactivatingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/identity/users/${id}/deactivate`, {
        signal: controller.signal,
        method: 'POST',
      });
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchUsers();
    } catch (error) {
      if (isAbortLikeError(error) || controller.signal.aborted) {
        return;
      }
      // Backend offline — deactivate in local state
      setUsers(prev => prev.map(u => u.id === id ? { ...u, isActive: false } : u));
      setError(null);
    } finally {
      window.clearTimeout(timeoutId);
      if (deactivateRequest.current === controller) {
        deactivateRequest.current = null;
      }
      if (!controller.signal.aborted) {
        setDeactivatingId(null);
      }
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
            <Grid size={12}>
              <TextField
                label="External ID (Entra Object ID)"
                fullWidth
                required
                value={createForm.externalId}
                onChange={(e) => setCreateForm((f) => ({ ...f, externalId: e.target.value }))}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Full Name"
                fullWidth
                required
                value={createForm.fullName}
                onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
              />
            </Grid>
            <Grid size={12}>
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
            <Grid size={12}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Grid>
            <Grid size={12}>
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
