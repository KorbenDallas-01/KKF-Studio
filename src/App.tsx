import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open, save } from '@tauri-apps/plugin-dialog';
import ProfileHeader from "./ProfileHeader";
import { generateProtokolDocx } from "./generateProtokol";
import ProtocolEditor from "./ProtocolEditor";
import { FileText, Upload, CheckCircle2, AlertCircle, Settings2, RotateCcw, Save, PanelLeft, LoaderCircle, FilePlus2 } from 'lucide-react';

type Invoice = { number: string, date: string, seller: string, items: string, gross: string };
const empty: Invoice = { number: '', date: '', seller: '', items: '', gross: '' };
// Dane z pomocnika są nieufne: wszystkie pola formularza muszą być tekstem.
function normalizeInvoice(data: unknown): Invoice {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Parser XML nie zwrócił obiektu danych faktury.');
  }
  const obj = data as Record<string, unknown>;
  const asText = (value: unknown): string =>
    value == null ? '' : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return {
    number: asText(obj.number ?? obj.Number),
    date: asText(obj.date ?? obj.Date),
    seller: asText(obj.seller ?? obj.Seller),
    items: asText(obj.items ?? obj.Items),
    gross: asText(obj.gross ?? obj.Gross),
  };
}

const fields: { key: keyof Invoice, label: string, multiline?: boolean }[] = [
  { key: 'number', label: 'Nr Faktury' }, { key: 'date', label: 'Z dnia' }, { key: 'seller', label: 'Wystawiona przez' },
  { key: 'items', label: 'Nazwa towaru/usługi', multiline: true }, { key: 'gross', label: 'Kwota brutto dokumentu' }
];
function safeName(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    console.warn("KKF Studio: brak wartości nazwy pliku");
    return "faktura_bez_numeru";
  }

  const text = String(value);

  const cleaned = text
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "");

  return cleaned || "faktura_bez_numeru";
}
const readSettings = () => { try { return JSON.parse((localStorage.getItem('kkf-settings') ?? localStorage.getItem('fis' + 'zka-settings')) || '{}') } catch { return {} } };

export default function App() {
  const [protokolMode, setProtokolMode] = useState(false);
  const [invoice, setInvoice] = useState<Invoice>(empty);
  const [initial, setInitial] = useState<Invoice>(empty);
  const [xmlPath, setXmlPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [settings, setSettings] = useState(false);
  const [folder, setFolder] = useState<string>(readSettings().folder || '');
  const [autoOpen, setAutoOpen] = useState<boolean>(readSettings().autoOpen || false);
  const [history, setHistory] = useState<{ name: string, path: string, time: string }[]>(readSettings().history || []);
  const template = useRef('');
  const valid = Object.values(invoice).every(x => typeof x === 'string' && x.trim().length > 0);
  const changed = fields.filter(f => invoice[f.key] !== initial[f.key]).length;
  useEffect(() => { invoke<string>('template_path').then(x => template.current = x).catch(e => setError(String(e))) }, []);
  useEffect(() => { localStorage.setItem('kkf-settings', JSON.stringify({ folder, autoOpen, history })) }, [folder, autoOpen, history]);
  const call = async (action: string, params: Record<string, unknown>) => invoke<any>('helper', { request: { action, ...params } });
  const load = async (path: string) => {
    if (xmlPath && changed && !window.confirm('Zmiany w formularzu zostaną utracone. Wczytać nową fakturę?')) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      // Przekazujemy systemową ścieżkę DOSŁOWNIE: bez encodeURI, escape, btoa itd.
      // Pomocnik sprawdza, czy przejście przez Rust nie zmieniło polskich znaków.
      const check = await call('checkPath', { xmlPath: path }) as { path: string, exists: boolean, isXml: boolean };
      if (check.path !== path) {
        throw new Error('Ścieżka XML została uszkodzona podczas komunikacji z pomocnikiem. Wybrano: ' + path + '; otrzymano: ' + check.path);
      }
      if (!check.isXml) throw new Error('Wybrany plik nie ma rozszerzenia .xml.');
      if (!check.exists) throw new Error('Pomocnik C# nie może znaleźć pliku pod ścieżką: ' + path);
      const raw = await call('parse', { xmlPath: path });
      const data = normalizeInvoice(raw);
      setInvoice(data); setInitial(data); setXmlPath(path);
      const missing = fields.filter(f => !data[f.key].trim()).map(f => f.label);
      if (missing.length) {
        setError('Nie odczytano pól: ' + missing.join(', ') + '. Uzupełnij je ręcznie. Jeśli są w XML, trzeba poprawić mapowanie parsera FA(3).');
        console.warn('Niepełny wynik parsera XML:', raw);
      }
    }
    catch (e) { setError(String(e)) } finally { setBusy(false) }
  };
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebviewWindow().onDragDropEvent(event => {
      if (event.payload.type === 'drop' && event.payload.paths?.[0]) load(event.payload.paths[0]);
    }).then(fn => unlisten = fn).catch(() => { });
    return () => unlisten?.();
  });
  const choose = async () => { const path = await open({ multiple: false, filters: [{ name: 'Faktura XML', extensions: ['xml'] }] }); if (typeof path === 'string') await load(path) };
  const outputName = `KKF_${safeName(invoice.number)}.docx`;
  const generate = async (as = false) => {
    if (!valid) { setError('Uzupełnij wszystkie pięć pól.'); return }
    setBusy(true); setError(''); setSuccess('');
    try {
      let target: string | null;
      if (as || !folder) { target = await save({ defaultPath: folder ? `${folder}\\${outputName}` : outputName, filters: [{ name: 'Dokument Word', extensions: ['docx'] }] }) }
      else target = `${folder}\\${outputName}`;
      if (!target) return;
      // Nie nadpisujemy pliku bez pytania: „Zapisz jako” korzysta z systemowego potwierdzenia.
      // Automatyczny zapis otrzymuje kolejną nazwę, jeśli plik już istnieje (obsługa po stronie pomocnika).
      const res = await call('generate', { templatePath: template.current, outputPath: target, invoice, avoidOverwrite: !as });
      setSuccess(`Zapisano: ${res.path}`);
      setHistory(h => [{ name: res.path.split(/[\\/]/).pop() || outputName, path: res.path, time: new Date().toLocaleString('pl-PL') }, ...h].slice(0, 15));
      if (autoOpen) await invoke('open_document', { path: res.path });
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  };
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); choose() } if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); generate(true) } else if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); generate(false) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) });

  // async function handleGenerateProtokol() {
  //   try {
  //     setError("");

  //     const savedPath = await generateProtokolDocx(
  //       folder || ""
  //     );

  //     if (savedPath) {
  //       setSuccess("Protokół został zapisany.");

  //       window.alert(
  //         `Protokół zapisano pomyślnie:\n${savedPath}`
  //       );
  //     }
  //   } catch (err) {
  //     const message =
  //       err instanceof Error
  //         ? err.message
  //         : String(err);

  //     setError(message);
  //     window.alert(`Błąd: ${message}`);
  //   }
  // }


  return <div className="app" onDragOver={e => e.preventDefault()}>
    <aside className="sidebar">
      {/* <div className="brand"><div className="brand-icon">F</div><span>KKF Studio</span></div> */}
      {/* Profil użytkownika */}
      <ProfileHeader />

      <div className="side-label" style={{ marginTop: 30 }}>
        PRZESTRZEŃ ROBOCZA
      </div>

      {/* <button
        className="side-item active"
        onClick={choose}
      >
        <FilePlus2 size={17} />
        Nowa kkf
      </button>

      <button
        className="side-item"
        onClick={() => setSettings(s => !s)}
      >
        <Settings2 size={17} />
        Ustawienia
      </button> */}

      {/* <button
        className={`side-item ${!settings ? "active" : ""}`}
        onClick={() => setSettings(false)}
      >
        <FilePlus2 size={17} />
        Nowa kkf
      </button>

      <button
        className="side-item"
        onClick={handleGenerateProtokol}
      >
        <FileText size={17} />
        Protokół przekazania
      </button>


      <button
        className={`side-item ${settings ? "active" : ""}`}
        onClick={() => setSettings(true)}
      >
        <Settings2 size={17} />
        Ustawienia
      </button> */}

      <button
        className={`side-item ${!settings && !protokolMode ? "active" : ""
          }`}
        onClick={() => {
          setSettings(false);
          setProtokolMode(false);
        }}
      >
        <FilePlus2 size={17} />
        Nowa kkf
      </button>

      <button
        className={`side-item ${!settings && protokolMode ? "active" : ""
          }`}
        onClick={() => {
          setSettings(false);
          setProtokolMode(true);
        }}
      >
        <FileText size={17} />
        Protokół przekazania
      </button>

      <button
        className={`side-item ${settings ? "active" : ""}`}
        onClick={() => {
          setSettings(true);
          setProtokolMode(false);
        }}
      >
        <Settings2 size={17} />
        Ustawienia
      </button>


      <div className="side-label history-label">
        OSTATNIE DOKUMENTY
      </div>

      {history.slice(0, 6).map((h, i) => (
        <div
          className="history-item"
          title={h.path}
          key={i}
        >
          <FileText size={14} />
          <span>{h.name}</span>
        </div>
      ))}

      <div className="sidebar-bottom">
        Lokalnie • Windows 11
        <br />
        Wersja 0.1.1
      </div>
    </aside>

    {/* <div className="side-label">PRZESTRZEŃ ROBOCZA</div><button className="side-item active" onClick={choose}><FilePlus2 size={17} /> Nowa kkf</button><button className="side-item" onClick={() => setSettings(s => !s)}><Settings2 size={17} /> Ustawienia</button><div className="side-label history-label">OSTATNIE DOKUMENTY</div>{history.slice(0, 6).map((h, i) => <div className="history-item" title={h.path} key={i}><FileText size={14} /><span>{h.name}</span></div>)}<div className="sidebar-bottom">Lokalnie • Windows 11<br />Wersja 0.1.0</div></aside> */}
    <main className="workspace">
      {/* <header className="topbar"><div className="crumb"><PanelLeft size={17} /> <span>Dokumenty</span><span className="sep">/</span><b>Nowa kkf</b></div><span className="top-status"><span className="status-dot" /> Przetwarzanie lokalne</span></header> */}

      <header className="topbar">
        <div className="crumb">
          {settings ? (
            <>
              <Settings2 size={17} />
              <b>Ustawienia</b>
            </>
          ) : protokolMode ? (
            <>
              <FileText size={17} />
              <span>Dokumenty</span>
              <span className="sep">/</span>
              <b>Protokół przekazania</b>
            </>
          ) : (
            <>
              <PanelLeft size={17} />
              <span>Dokumenty</span>
              <span className="sep">/</span>
              <b>Nowa kkf</b>
            </>
          )}
        </div>

        <span className="top-status">
          <span className="status-dot" />
          Przetwarzanie lokalne
        </span>
      </header>

      {settings ? (
        <section className="settings">
          <h1>Ustawienia</h1>
          <p className="muted">Preferencje zapisu dokumentów</p>

          <div className="setting-row">
            <div>
              <b>Folder domyślny</b>
              <p>{folder || 'Nie wybrano — pytaj przy pierwszym zapisie'}</p>
            </div>
            <button
              className="secondary"
              onClick={async () => {
                const p = await open({ directory: true });
                if (typeof p === 'string') setFolder(p);
              }}
            >
              Wybierz folder
            </button>
          </div>

          <div className="setting-row">
            <div>
              <b>Otwórz po zapisie</b>
              <p>Otwórz wynikowy DOCX w domyślnym programie</p>
            </div>
            <input
              type="checkbox"
              checked={autoOpen}
              onChange={e => setAutoOpen(e.target.checked)}
            />
          </div>

          <button
            className="secondary"
            onClick={() => setSettings(false)}
          >
            Wróć do edytora
          </button>
        </section>

      ) : protokolMode ? (

        <ProtocolEditor folder={folder || ""} />

      ) : (
        <>
          <div className="title-row">
            <div>
              <div className="eyebrow">DOKUMENT / KKF</div>
              <h1>Nowa kkf</h1>
              <p>Wczytaj fakturę, sprawdź dane i wygeneruj dokument.</p>
            </div>
            <div className="chip">
              <CheckCircle2 size={14} /> Szablon KKF
            </div>
          </div>

          <div className="columns no-preview">
            <section className="editor">
              <div className="section-head">
                <h2>Dane faktury</h2>
                <span>01 / 02</span>
              </div>

              <button className="upload" onClick={choose}>
                <Upload size={19} />
                <div>
                  <b>
                    {xmlPath
                      ? xmlPath.split(/[\\/]/).pop()
                      : 'Wybierz plik XML'}
                  </b>
                  <span>
                    {xmlPath
                      ? 'Faktura FA(3) wczytana'
                      : 'Import faktury KSeF FA(3)'}
                  </span>
                </div>
                <span className="upload-right">
                  {xmlPath ? '✓' : 'Wybierz'}
                </span>
              </button>

              <div className="form-head">
                <b>Dane do dokumentu</b>
                <button
                  className="text-button"
                  disabled={!xmlPath}
                  onClick={() => setInvoice(initial)}
                >
                  <RotateCcw size={14} /> Przywróć
                </button>
              </div>

              <div className="fields">
                {fields.map(f => (
                  <label key={f.key}>
                    <span>
                      {f.label}
                      {invoice[f.key] !== initial[f.key] && (
                        <em> Zmieniono</em>
                      )}
                    </span>
                    {f.multiline ? (
                      <textarea
                        rows={5}
                        value={invoice[f.key]}
                        onChange={e =>
                          setInvoice(v => ({
                            ...v,
                            [f.key]: e.target.value
                          }))
                        }
                        placeholder="Wszystkie pozycje faktury"
                      />
                    ) : (
                      <input
                        value={invoice[f.key]}
                        onChange={e =>
                          setInvoice(v => ({
                            ...v,
                            [f.key]: e.target.value
                          }))
                        }
                        placeholder="—"
                      />
                    )}
                  </label>
                ))}
              </div>

              <div className="field-foot">
                <CheckCircle2 size={15} />
                {xmlPath
                  ? `${changed} zmienionych pól • ${(invoice.items || '').split('\n').filter(Boolean).length} pozycji`
                  : 'Oczekiwanie na fakturę'}
              </div>
            </section>
          </div>

          <footer className="footer">
            <div className="foot-status">
              {error ? (
                <span className="error-text">
                  <AlertCircle size={17} />
                  {error}
                </span>
              ) : success ? (
                <span className="success-text">
                  <CheckCircle2 size={17} />
                  {success}
                </span>
              ) : (
                <span>
                  <CheckCircle2 size={17} />
                  {valid
                    ? 'Gotowe do wygenerowania'
                    : 'Wczytaj fakturę XML'}
                </span>
              )}
            </div>

            <div className="footer-actions">
              <button
                className="secondary"
                disabled={!valid || busy}
                onClick={() => generate(true)}
              >
                <Save size={16} /> Zapisz jako…
              </button>

              <button
                className="primary"
                disabled={!valid || busy}
                onClick={() => generate(false)}
              >
                {busy
                  ? <LoaderCircle size={16} className="spin" />
                  : <FileText size={16} />}
                Generuj DOCX
              </button>
            </div>
          </footer>
        </>
      )}
    </main>
  </div>;
}
