import { getDataSource } from '../../data/source';
import { useSessionStore } from '../../auth/useSessionStore';

// Port of index.html's logDownload() -- fire-and-forget, matching the
// original exactly: a failed log shouldn't block or even slow down the
// user's actual download, which has already happened by the time this
// is called (doc.save() runs first at every call site). Errors are
// swallowed rather than surfaced -- the file is still on the user's
// device either way, only its Document Vault copy is what's at risk.
export function useLogDownload() {
  const demoMode = useSessionStore((s) => s.demoMode);
  const profile = useSessionStore((s) => s.profile);
  return (filename: string, kind: string, fileData: string | null) => {
    if (!profile) return;
    getDataSource(demoMode)
      .downloads.log(profile.key, profile.name, filename, kind, fileData)
      .catch(() => {
        // Swallowed on purpose -- see comment above.
      });
  };
}
