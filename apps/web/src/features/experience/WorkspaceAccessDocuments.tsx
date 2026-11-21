import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './workspace-access-documents.css';
import { FileText, Link2, Trash2, Upload, Users, UserMinus, Download, RefreshCw } from 'lucide-react';
import { request } from '../../lib/api';

type Member = { userId: string; email: string; role: 'viewer'; addedAt: string };
type DocumentMeta = { documentId: string; filename: string; mediaType: 'text/plain'; byteLength: number; contentHash: string; uploadedAt: string };

export default function WorkspaceAccessDocuments({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setError('');
    try {
      const [memberResult, documentResult] = await Promise.all([
        request<{ data: Member[] }>('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/members'),
        request<{ data: DocumentMeta[] }>('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/documents'),
      ]);
      setMembers(Array.isArray(memberResult.data) ? memberResult.data : []);
      setDocuments(Array.isArray(documentResult.data) ? documentResult.data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load workspace access and documents.');
    }
  }

  useEffect(() => { void refresh(); }, [workspaceId]);

  async function share(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/members', {
        method: 'POST', body: JSON.stringify({ email: email.trim() }),
      });
      setEmail('');
      setNotice('Read-only access granted to the existing ADVERSE account.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not share this workspace.');
    } finally { setBusy(false); }
  }

  async function revoke(member: Member) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/members/' + encodeURIComponent(member.userId), { method: 'DELETE' });
      setMembers(current => current.filter(item => item.userId !== member.userId));
      setNotice('Workspace access revoked.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke access.');
    } finally { setBusy(false); }
  }

  async function upload(file?: File) {
    if (!file || busy) return;
    setError(''); setNotice('');
    if (file.type !== 'text/plain' && !file.name.toLowerCase().endsWith('.txt')) {
      setError('Only .txt documents are supported in this release.'); return;
    }
    if (file.size > 50000) { setError('The file must be 50 KB or smaller.'); return; }
    setBusy(true);
    try {
      const text = await file.text();
      await request('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/documents', {
        method: 'POST', body: JSON.stringify({ filename: file.name, mediaType: 'text/plain', text }),
      });
      setNotice('Text document saved with its SHA-256 provenance hash.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not upload this document.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function download(document: DocumentMeta) {
    setError('');
    try {
      const result = await request<{ data: { filename: string; text: string } }>(
        '/experience/workspaces/' + encodeURIComponent(workspaceId) + '/documents/' + encodeURIComponent(document.documentId),
      );
      const blob = new Blob([result.data.text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url; anchor.download = result.data.filename || document.filename;
      anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retrieve this document.');
    }
  }

  async function removeDocument(document: DocumentMeta) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/experience/workspaces/' + encodeURIComponent(workspaceId) + '/documents/' + encodeURIComponent(document.documentId), { method: 'DELETE' });
      setDocuments(current => current.filter(item => item.documentId !== document.documentId));
      setNotice('Document deleted from this workspace.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this document.');
    } finally { setBusy(false); }
  }

  return <section className="experience-access-panel" aria-label="Workspace access and documents">
    <div className="experience-access-grid">
      <section className="experience-access-card">
        <div className="experience-access-heading"><div><span className="experience-section-label"><Users size={13} /> READ-ONLY COLLABORATION</span><h3>Workspace access</h3></div><span>{members.length}/10</span></div>
        <p>Share this workspace with an existing ADVERSE account. Members can view its research; only you can change or revoke access.</p>
        <form className="experience-access-form" onSubmit={share}>
          <label className="experience-sr-only" htmlFor="workspace-share-email">Existing member email</label>
          <input id="workspace-share-email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="Existing ADVERSE account email" />
          <button type="submit" disabled={busy || !email.trim()}><Link2 size={14} /> Share</button>
        </form>
        {members.length > 0 ? <ul className="experience-access-list">{members.map(member => <li key={member.userId}><span><b>{member.email}</b><small>Viewer · read-only</small></span><button type="button" aria-label={'Revoke access for ' + member.email} disabled={busy} onClick={() => void revoke(member)}><UserMinus size={14} /> Revoke</button></li>)}</ul> : <p className="experience-access-empty">No one else has access to this workspace.</p>}
      </section>
      <section className="experience-access-card">
        <div className="experience-access-heading"><div><span className="experience-section-label"><FileText size={13} /> DOCUMENT INGESTION</span><h3>Workspace documents</h3></div><span>{documents.length}/10</span></div>
        <p>Attach plain-text notes or research excerpts. Files are limited to 50 KB each; PDF and Office formats are not accepted.</p>
        <input ref={inputRef} className="experience-document-input" type="file" accept=".txt,text/plain" aria-label="Choose a plain-text document" disabled={busy || documents.length >= 10} onChange={event => void upload(event.target.files?.[0])} />
        <button className="experience-document-upload" type="button" disabled={busy || documents.length >= 10} onClick={() => inputRef.current?.click()}><Upload size={14} /> {busy ? 'Working…' : 'Add .txt document'}</button>
        {documents.length > 0 ? <ul className="experience-access-list">{documents.map(document => <li key={document.documentId}><span><b>{document.filename}</b><small>{(document.byteLength / 1024).toFixed(1)} KB · SHA-256 · {new Date(document.uploadedAt).toLocaleDateString()}</small></span><div><button type="button" aria-label={'Download ' + document.filename} onClick={() => void download(document)}><Download size={14} /></button><button type="button" aria-label={'Delete ' + document.filename} disabled={busy} onClick={() => void removeDocument(document)}><Trash2 size={14} /></button></div></li>)}</ul> : <p className="experience-access-empty">No text documents attached yet.</p>}
      </section>
    </div>
    <div className="experience-access-footer"><button type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw size={13} /> Refresh access and documents</button><span role="status">{notice}</span></div>
    {error && <p className="experience-access-error" role="alert">{error}</p>}
  </section>;
}
