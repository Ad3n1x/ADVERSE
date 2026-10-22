import { useState } from 'react';
import { request } from '../../lib/api';

type Notify = (message: string) => void;
type SetMessage = (message: string) => void;

/** Owns user-managed search-provider and AI credentials, isolated from workspace rendering. */
export function useWorkspaceCredentials(
  setError: SetMessage,
  notify: Notify,
  setAiProviderStatus: SetMessage,
) {
  const [providerKeysDraft, setProviderKeysDraft] = useState<Record<string, string>>({});
  const [providerKeysConfigured, setProviderKeysConfigured] = useState<string[]>([]);
  const [providerKeysAvailable, setProviderKeysAvailable] = useState<string[]>([]);
  const [providerKeysSaving, setProviderKeysSaving] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState<any[]>([]);
  const [aiKeysDraft, setAiKeysDraft] = useState<Record<string, string>>({});
  const [aiKeysConfigured, setAiKeysConfigured] = useState<string[]>([]);
  const [aiKeysEnvironment, setAiKeysEnvironment] = useState<string[]>([]);
  const [aiKeysSaving, setAiKeysSaving] = useState(false);

  const refreshAiStatus = async () => {
    const status = await request<{ data: { configured: boolean; providers: string[] } }>('/ai/status');
    setAiProviderStatus(status.data.configured
      ? status.data.providers.join(' + ') + ' configured · end-to-end unverified'
      : 'Not configured');
  };

  const loadProviderCredentials = async () => {
    try {
      const response = await request<{ data: { configured: string[]; userConfigured: string[]; providers: any[] } }>('/search/provider-credentials');
      setProviderKeysConfigured(response.data.userConfigured || []);
      setProviderKeysAvailable(response.data.configured || response.data.userConfigured || []);
      setProviderCatalog(response.data.providers || []);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load search provider settings.');
    }
  };

  const loadAiCredentials = async () => {
    try {
      const response = await request<{ data: { userConfigured: string[]; environmentConfigured: string[] } }>('/ai/credentials');
      setAiKeysConfigured(response.data.userConfigured || []);
      setAiKeysEnvironment(response.data.environmentConfigured || []);
      await refreshAiStatus();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load AI service settings.');
    }
  };

  const saveAiCredentials = async () => {
    setAiKeysSaving(true);
    try {
      const response = await request<{ data: { userConfigured: string[]; environmentConfigured: string[] }; message: string }>(
        '/ai/credentials', { method: 'PUT', body: JSON.stringify(aiKeysDraft) },
      );
      setAiKeysConfigured(response.data.userConfigured || []);
      setAiKeysEnvironment(response.data.environmentConfigured || []);
      setAiKeysDraft({});
      await refreshAiStatus();
      notify(response.message || 'AI service settings saved.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save AI service settings.');
    } finally {
      setAiKeysSaving(false);
    }
  };

  const removeAiCredentials = async () => {
    setAiKeysSaving(true);
    try {
      const body = Object.fromEntries(
        ['GEMINI_API_KEY', 'GEMINI_MODEL', 'AI_PROVIDER_BASE_URL', 'AI_PROVIDER_API_KEY', 'AI_PROVIDER_MODEL'].map((key) => [key, '']),
      );
      const response = await request<{ data: { userConfigured: string[]; environmentConfigured: string[] }; message: string }>(
        '/ai/credentials', { method: 'PUT', body: JSON.stringify(body) },
      );
      setAiKeysConfigured(response.data.userConfigured || []);
      setAiKeysEnvironment(response.data.environmentConfigured || []);
      setAiKeysDraft({});
      await refreshAiStatus();
      notify('Your saved AI credentials were removed. Server-level credentials, if any, remain managed by the service owner.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not remove AI credentials.');
    } finally {
      setAiKeysSaving(false);
    }
  };

  const saveProviderCredentials = async () => {
    setProviderKeysSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(providerKeysDraft).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
      const response = await request<{ data: { configured: string[]; userConfigured: string[]; providers: any[] }; message: string }>(
        '/search/provider-credentials', { method: 'PUT', body: JSON.stringify(body) },
      );
      setProviderKeysConfigured(response.data.userConfigured || []);
      setProviderCatalog(response.data.providers || []);
      setProviderKeysDraft({});
      notify(response.message || 'Search service settings saved.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save search-service keys.');
    } finally {
      setProviderKeysSaving(false);
    }
  };

  const removeProviderCredentials = async (keyNames: string[]) => {
    setProviderKeysSaving(true);
    try {
      const body = Object.fromEntries(keyNames.map((keyName) => [keyName, '']));
      const response = await request<{ data: { userConfigured: string[]; providers: any[] }; message: string }>(
        '/search/provider-credentials', { method: 'PUT', body: JSON.stringify(body) },
      );
      setProviderKeysConfigured(response.data.userConfigured || []);
      setProviderCatalog(response.data.providers || []);
      setProviderKeysDraft((current) => ({ ...current, ...Object.fromEntries(keyNames.map((keyName) => [keyName, ''])) }));
      notify('Provider credential removed from your account.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not remove provider credential.');
    } finally {
      setProviderKeysSaving(false);
    }
  };

  return {
    providerKeysDraft, setProviderKeysDraft, providerKeysConfigured, setProviderKeysConfigured,
    providerKeysAvailable, providerKeysSaving, providerCatalog, setProviderCatalog,
    aiKeysDraft, setAiKeysDraft, aiKeysConfigured, aiKeysEnvironment, aiKeysSaving,
    loadProviderCredentials, loadAiCredentials, saveAiCredentials, removeAiCredentials,
    saveProviderCredentials, removeProviderCredentials,
  };
}
