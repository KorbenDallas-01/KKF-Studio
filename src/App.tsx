import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open, save } from '@tauri-apps/plugin-dialog';
import ProfileHeader from "./ProfileHeader";
import ProtocolEditor from "./ProtocolEditor";
import { kkfTemplates, categoryNames, projectName, type KkfCategory } from "./kkfTemplates";
import { FileText, Upload, CheckCircle2, AlertCircle, Settings2, RotateCcw, Save, PanelLeft, LoaderCircle, FilePlus2, ChevronRight, ArrowLeft, ReceiptText, ListChecks } from 'lucide-react';

type Invoice = { number: string, date: string, seller: string, items: string, gross: string };
const empty: Invoice = { number: '', date: '', seller: '', items: '', gross: '' };
type ProjectFields = { task: string; budgetPosition: string; purchaseRequestNumber: string; contractNumber: string };
const emptyProject: ProjectFields = { task: '', budgetPosition: '', purchaseRequestNumber: '', contractNumber: '' };
const projectInputFields: { key: keyof ProjectFields; label: string; required: boolean; multiline?: boolean }[] = [
  { key: 'task', label: 'Zadanie', required: true, multiline: true },
  { key: 'budgetPosition', label: 'Pozycja budżetowa', required: true, multiline: true },
  { key: 'purchaseRequestNumber', label: 'Nr wniosku zakupowego', required: false },
  { key: 'contractNumber', label: 'Nr umowy', required: false },
];
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
  const [kkfCategory, setKkfCategory] = useState<KkfCategory | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [projectFields, setProjectFields] = useState<ProjectFields>(emptyProject);
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
  const valid = !!selectedTemplate && !!kkfCategory
    && Object.values(invoice).every(x => typeof x === 'string' && x.trim().length > 0)
    && projectFields.task.trim().length > 0 && projectFields.budgetPosition.trim().length > 0;
  const changed = fields.filter(f => invoice[f.key] !== initial[f.key]).length;
  useEffect(() => { localStorage.setItem('kkf-settings', JSON.stringify({ folder, autoOpen, history })) }, [folder, autoOpen, history]);
  const call = async (action: string, params: Record<string, unknown>) => invoke<any>('helper', { request: { action, ...params } });
  const load = async (path: string) => {
    if (!selectedTemplate) return;
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
  const choose = async () => { if (!selectedTemplate) return; const path = await open({ multiple: false, filters: [{ name: 'Faktura XML', extensions: ['xml'] }] }); if (typeof path === 'string') await load(path) };
  const outputName = `KKF_${selectedTemplate ? safeName(projectName(selectedTemplate)) : 'projekt'}_${safeName(invoice.number)}.docx`;
  const generate = async (as = false) => {
    if (!valid || !kkfCategory || !selectedTemplate) { setError('Wybierz szablon, uzupełnij pięć pól dokumentu, zadanie i pozycję budżetową.'); return }
    setBusy(true); setError(''); setSuccess('');
    try {
      let target: string | null;
      if (as || !folder) { target = await save({ defaultPath: folder ? `${folder}\\${outputName}` : outputName, filters: [{ name: 'Dokument Word', extensions: ['docx'] }] }) }
      else target = `${folder}\\${outputName}`;
      if (!target) return;
      // Nie nadpisujemy pliku bez pytania: „Zapisz jako” korzysta z systemowego potwierdzenia.
      // Automatyczny zapis otrzymuje kolejną nazwę, jeśli plik już istnieje (obsługa po stronie pomocnika).
      const templatePath = await invoke<string>('template_path', { category: kkfCategory, fileName: selectedTemplate });
      const res = await call('generate', { templatePath, outputPath: target, invoice, projectFields, avoidOverwrite: !as });
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
          setKkfCategory(null);
          setSelectedTemplate(null);
          setError('');
          setSuccess('');
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
        Wersja 0.2.0
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
              <b>{selectedTemplate ? `KKF / ${projectName(selectedTemplate)}` : kkfCategory ? categoryNames[kkfCategory] : 'Nowa KKF'}</b>
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

      ) : !kkfCategory ? (
        <section className="kkf-selection">
          <div className="eyebrow">DOKUMENT / KKF</div>
          <h1>Wybierz rodzaj dokumentu</h1>
          <p>Najpierw wybierz rodzaj KKF, a następnie szablon dla właściwego projektu.</p>
          <div className="kkf-category-grid">
            <button className="kkf-category-card" onClick={() => { setKkfCategory('faktury'); setSelectedTemplate(null); }}>
              <span className="kkf-card-icon"><FileText size={24} /></span>
              <b>KKF do faktur w ramach projektów</b>
              <span>22 szablony dokumentów</span>
              <ChevronRight size={19} className="kkf-chevron" />
            </button>
            <button className="kkf-category-card" onClick={() => { setKkfCategory('rachunki'); setSelectedTemplate(null); }}>
              <span className="kkf-card-icon"><ReceiptText size={24} /></span>
              <b>KKF do rachunków w ramach projektów</b>
              <span>22 szablony dokumentów</span>
              <ChevronRight size={19} className="kkf-chevron" />
            </button>
          </div>
        </section>
      ) : !selectedTemplate ? (
        <section className="kkf-selection kkf-template-selection">
          <button className="kkf-back" onClick={() => setKkfCategory(null)}><ArrowLeft size={16} /> Rodzaje KKF</button>
          <div className="eyebrow">DOKUMENT / KKF</div>
          <h1>{categoryNames[kkfCategory]}</h1>
          <p>Wybierz projekt. Aplikacja otworzy edytor dokumentu z możliwością załączenia faktury XML.</p>
          <div className="kkf-template-list">
            {kkfTemplates[kkfCategory].map(name => (
              <button key={name} className="kkf-template-item" onClick={() => { setSelectedTemplate(name); setError(''); setSuccess(''); }}>
                <FileText size={18} />
                <span><b>{projectName(name)}</b><small>{name}</small></span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <div className="title-row">
            <div>
              <div className="eyebrow">DOKUMENT / KKF</div>
              <h1>Nowa KKF — {projectName(selectedTemplate)}</h1>
              <p>{kkfCategory === 'faktury' ? 'KKF do faktury' : 'KKF do rachunku'} • Wczytaj XML, uzupełnij pola projektu i wygeneruj dokument.</p>
              <button className="kkf-back" onClick={() => setSelectedTemplate(null)}><ArrowLeft size={14} /> Zmień szablon</button>
            </div>
            <div className="chip">
              <CheckCircle2 size={14} /> {projectName(selectedTemplate)}
            </div>
          </div>

          <div className="columns no-preview">
            <section className="editor">
              <div className="section-head">
                <h2>Dane {kkfCategory === 'faktury' ? 'faktury' : 'rachunku'}</h2>
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

              <div className="form-head kkf-project-heading">
                <b><ListChecks size={15} /> Dane projektu</b>
                <span>Pola oznaczone * są obowiązkowe</span>
              </div>
              <div className="fields">
                {projectInputFields.map(f => (
                  <label key={f.key}>
                    <span>{f.label}{f.required && <strong className="required-marker"> *</strong>}</span>
                    {f.multiline ? (
                      <textarea
                        rows={2}
                        value={projectFields[f.key]}
                        onChange={e => setProjectFields(v => ({ ...v, [f.key]: e.target.value }))}
                        placeholder={f.required ? 'Wpisz wymagane informacje' : 'Opcjonalnie'}
                      />
                    ) : (
                      <input
                        value={projectFields[f.key]}
                        onChange={e => setProjectFields(v => ({ ...v, [f.key]: e.target.value }))}
                        placeholder="Opcjonalnie"
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
                    : 'Wybierz XML i uzupełnij wymagane pola'}
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
