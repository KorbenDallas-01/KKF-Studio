
import { useState } from "react";
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Save,
  LoaderCircle,
} from "lucide-react";

import {
  generateProtokolDocx,
  type ProtocolFields,
} from "./generateProtokol";

type Props = {
  folder: string;
};

export default function ProtocolEditor({ folder }: Props) {
  const [form, setForm] = useState<ProtocolFields>({
    assetName: "",
    inventoryNumber: "",
    serialNumber: "",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const valid =
    form.assetName.trim().length > 0 &&
    form.inventoryNumber.trim().length > 0 &&
    form.serialNumber.trim().length > 0;

  function updateField(
    key: keyof ProtocolFields,
    value: string
  ) {
    setForm(previous => ({
      ...previous,
      [key]: value,
    }));

    setError("");
    setSuccess("");
  }

  async function generate(saveAs: boolean) {
    if (!valid || busy) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const path = await generateProtokolDocx(
        folder,
        form,
        saveAs
      );

      if (path) {
        setSuccess(`Zapisano: ${path}`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : String(err)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Nagłówek strony */}
      <div className="title-row">
        <div>
          <div className="eyebrow">
            DOKUMENT / PROTOKÓŁ
          </div>

          <h1>Protokół przekazania</h1>

          <p>
            Uzupełnij dane sprzętu i wygeneruj
            dokument zdawczo-odbiorczy.
          </p>
        </div>

        <div className="chip">
          <CheckCircle2 size={14} />
          Szablon protokołu
        </div>
      </div>

      {/* Edytor bez podglądu */}
      <div className="columns no-preview">
        <section className="editor">
          <div className="section-head">
            <h2>Dane przekazywanego sprzętu</h2>
            <span>01 / 01</span>
          </div>

          <div className="form-head">
            <b>Dane do dokumentu</b>
          </div>

          <div className="fields">

            <label>
              <span>Nazwa zasobu</span>
              <input
                value={form.assetName}
                onChange={e =>
                  updateField("assetName", e.target.value)
                }
                placeholder="Wprowadź nazwę sprzętu"
              />
            </label>

            <label>
              <span>Numer ewidencyjny</span>
              <input
                value={form.inventoryNumber}
                onChange={e =>
                  updateField(
                    "inventoryNumber",
                    e.target.value
                  )
                }
                placeholder="Np. IBE/491/2426"
              />
            </label>

            <label>
              <span>Numer seryjny</span>
              <input
                value={form.serialNumber}
                onChange={e =>
                  updateField(
                    "serialNumber",
                    e.target.value
                  )
                }
                placeholder="Wprowadź numer seryjny"
              />
            </label>

          </div>

          <div className="field-foot">
            <CheckCircle2 size={15} />
            {valid
              ? "Wszystkie pola zostały uzupełnione"
              : "Uzupełnij dane przekazywanego sprzętu"}
          </div>
        </section>
      </div>

      {/* Stopka identyczna stylistycznie jak w KKF */}
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
                ? "Gotowe do wygenerowania"
                : "Uzupełnij dane sprzętu"}
            </span>
          )}

        </div>

        <div className="footer-actions">
          <button
            className="secondary"
            disabled={!valid || busy}
            onClick={() => generate(true)}
          >
            <Save size={16} />
            Zapisz jako…
          </button>

          <button
            className="primary"
            disabled={!valid || busy}
            onClick={() => generate(false)}
          >
            {busy ? (
              <LoaderCircle
                size={16}
                className="spin"
              />
            ) : (
              <FileText size={16} />
            )}

            Generuj DOCX
          </button>
        </div>
      </footer>
    </>
  );
}
