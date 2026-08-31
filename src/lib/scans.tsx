import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { createId } from '@/lib/notes';

const STORAGE_KEY = 'scans:v1';
const SAVE_DIR_KEY = 'scans:saveDir';
const AUTO_EXPORT_KEY = 'scans:autoExport';

/** Where saved scan PDFs live (survives app restarts). */
const scansDir = new Directory(Paths.document, 'scans');

export type Scan = {
  id: string;
  title: string;
  /** file:// URI of the saved PDF. */
  uri: string;
  pageCount: number;
  createdAt: number;
};

export type ExportResult =
  | { ok: true; folder: string }
  | { ok: false; reason: 'no-folder' | 'error' };

/** Human-readable name for a SAF tree URI (e.g. "Download/Goku"). */
export function folderLabel(treeUri: string | null): string | null {
  if (!treeUri) return null;
  try {
    const decoded = decodeURIComponent(treeUri);
    const tail = decoded.split(':').pop() ?? decoded;
    return tail.replace(/^\/+/, '') || 'Selected folder';
  } catch {
    return 'Selected folder';
  }
}

/**
 * Turn a list of page image URIs into a single PDF (via the system print
 * pipeline — no extra native code) and return its temp URI + page count.
 */
export async function buildScanPdf(
  imageUris: string[],
): Promise<{ uri: string; pageCount: number }> {
  const imgs = imageUris
    .map((u, i) => {
      const src = u.startsWith('file://') || u.startsWith('http') ? u : `file://${u}`;
      const last = i === imageUris.length - 1;
      return `<img src="${src}" style="${last ? '' : 'page-break-after:always;'}" />`;
    })
    .join('');
  const html = `<html><head><meta name="viewport" content="width=device-width"><style>
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { display: block; width: 100%; height: auto; }
  </style></head><body>${imgs}</body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  return { uri, pageCount: imageUris.length };
}

type ScansContextValue = {
  scans: Scan[];
  loading: boolean;
  /** Persist a freshly built PDF (moves it into the scans dir) and index it. */
  addScan: (pdfUri: string, pageCount: number, title?: string) => Promise<Scan>;
  renameScan: (id: string, title: string) => void;
  deleteScan: (id: string) => void;

  /** SAF tree URI of the folder chosen for exporting copies, or null. */
  saveDir: string | null;
  /** Whether every saved scan is also copied to `saveDir`. */
  autoExport: boolean;
  setAutoExport: (v: boolean) => void;
  /** Opens the Android folder picker; stores + returns the granted tree URI. */
  chooseSaveDir: () => Promise<string | null>;
  clearSaveDir: () => void;
  /** Copy a saved scan's PDF into `saveDir` (picking one first if needed). */
  exportToDevice: (scan: Scan) => Promise<ExportResult>;
};

const ScansContext = createContext<ScansContextValue | null>(null);

export function ScansProvider({ children }: { children: ReactNode }) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveDir, setSaveDir] = useState<string | null>(null);
  const [autoExport, setAutoExportState] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [raw, dir, auto] = await AsyncStorage.multiGet([
          STORAGE_KEY,
          SAVE_DIR_KEY,
          AUTO_EXPORT_KEY,
        ]);
        if (raw[1]) {
          const parsed = JSON.parse(raw[1]) as Scan[];
          if (Array.isArray(parsed)) setScans(parsed);
        }
        if (dir[1]) setSaveDir(dir[1]);
        if (auto[1] === '1') setAutoExportState(true);
      } catch (e) {
        console.warn('Failed to load scans', e);
      } finally {
        hydrated.current = true;
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(scans)).catch((e) =>
      console.warn('Failed to save scans', e),
    );
  }, [scans]);

  const addScan = useCallback<ScansContextValue['addScan']>(
    async (pdfUri, pageCount, title) => {
      const id = createId();
      const finalTitle = title?.trim() || defaultTitle();
      try {
        if (!scansDir.exists) scansDir.create();
      } catch {
        // dir may already exist
      }
      // Name the file after the title so the shared PDF reads nicely; keep a
      // short id suffix so titles can repeat without colliding.
      const dest = new File(scansDir, `${fileSlug(finalTitle)}-${id.slice(-4)}.pdf`);
      const src = new File(pdfUri);
      await src.move(dest);

      const scan: Scan = {
        id,
        title: finalTitle,
        uri: dest.uri,
        pageCount,
        createdAt: Date.now(),
      };
      setScans((prev) => [scan, ...prev]);
      return scan;
    },
    [],
  );

  const renameScan = useCallback((id: string, title: string) => {
    setScans((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: title.trim() || s.title } : s)),
    );
  }, []);

  const deleteScan = useCallback((id: string) => {
    setScans((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) {
        try {
          const f = new File(target.uri);
          if (f.exists) f.delete();
        } catch (e) {
          console.warn('Failed to delete scan file', e);
        }
      }
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const setAutoExport = useCallback((v: boolean) => {
    setAutoExportState(v);
    AsyncStorage.setItem(AUTO_EXPORT_KEY, v ? '1' : '0').catch(() => {});
  }, []);

  const chooseSaveDir = useCallback<ScansContextValue['chooseSaveDir']>(async () => {
    try {
      const res = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!res.granted) return null;
      setSaveDir(res.directoryUri);
      AsyncStorage.setItem(SAVE_DIR_KEY, res.directoryUri).catch(() => {});
      return res.directoryUri;
    } catch (e) {
      console.warn('Folder pick failed', e);
      return null;
    }
  }, []);

  const clearSaveDir = useCallback(() => {
    setSaveDir(null);
    setAutoExport(false);
    AsyncStorage.multiRemove([SAVE_DIR_KEY]).catch(() => {});
  }, [setAutoExport]);

  const exportToDevice = useCallback<ScansContextValue['exportToDevice']>(
    async (scan) => {
      let dir = saveDir;
      if (!dir) dir = await chooseSaveDir();
      if (!dir) return { ok: false, reason: 'no-folder' };
      try {
        const base64 = await new File(scan.uri).base64();
        const name = `${fileSlug(scan.title)}-${scan.id.slice(-4)}`;
        const target = await StorageAccessFramework.createFileAsync(
          dir,
          name,
          'application/pdf',
        );
        await StorageAccessFramework.writeAsStringAsync(target, base64, {
          encoding: 'base64',
        });
        return { ok: true, folder: folderLabel(dir) ?? 'the folder' };
      } catch (e) {
        console.warn('Export failed', e);
        return { ok: false, reason: 'error' };
      }
    },
    [saveDir, chooseSaveDir],
  );

  const value = useMemo<ScansContextValue>(
    () => ({
      scans,
      loading,
      addScan,
      renameScan,
      deleteScan,
      saveDir,
      autoExport,
      setAutoExport,
      chooseSaveDir,
      clearSaveDir,
      exportToDevice,
    }),
    [
      scans,
      loading,
      addScan,
      renameScan,
      deleteScan,
      saveDir,
      autoExport,
      setAutoExport,
      chooseSaveDir,
      clearSaveDir,
      exportToDevice,
    ],
  );

  return <ScansContext.Provider value={value}>{children}</ScansContext.Provider>;
}

export function useScans() {
  const ctx = useContext(ScansContext);
  if (!ctx) throw new Error('useScans must be used within a ScansProvider');
  return ctx;
}

function defaultTitle(): string {
  return `Scan ${new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })}`;
}

/** Safe, readable filename stem from a user title. */
function fileSlug(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 40)
    .trim();
  return cleaned || 'Scan';
}
