import { useState, useEffect, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./ProfileHeader.css";

type UserProfile = {
  firstName: string;
  lastName: string;
  projectName: string;
};

const STORAGE_KEY = "kkf-studio-profile";

const emptyProfile: UserProfile = {
  firstName: "",
  lastName: "",
  projectName: "",
};

function loadProfile(): UserProfile {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("fis" + "zka-studio-profile");
    if (!saved) return { ...emptyProfile };

    const data = JSON.parse(saved);

    return {
      firstName: String(data.firstName ?? ""),
      lastName: String(data.lastName ?? ""),
      projectName: String(data.projectName ?? ""),
    };
  } catch {
    return { ...emptyProfile };
  }
}

export default function ProfileHeader() {
  const [profile, setProfile] = useState(loadProfile);
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("");

  const firstName = profile.firstName.trim();
  const lastName = profile.lastName.trim();
  const hasName = Boolean(firstName && lastName);

  const displayName = hasName
    ? `${firstName} ${lastName}`
    : "Imię i nazwisko";

  const initials = hasName
    ? `${firstName[0]}${lastName[0]}`.toLocaleUpperCase("pl-PL")
    : "F";

  async function signInGoogle() {
    setGoogleBusy(true);
    setError("");
    try {
      const user = await invoke<{
        subject: string; firstName: string; lastName: string;
        email: string; picture?: string;
      }>("google_sign_in");
      // Zachowaj nazwę projektu i istniejące dane, gdy Google nie udostępni pola.
      const updated = {
        ...profile,
        firstName: user.firstName.trim() || profile.firstName,
        lastName: user.lastName.trim() || profile.lastName,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setProfile(updated);
      setDraft(updated);
      setGoogleEmail(user.email);
      setIsOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setGoogleBusy(false);
    }
  }

  function disconnectGoogle() {
    // Aplikacja nie przechowuje tokenów. Odłączanie zachowuje lokalny profil.
    setGoogleEmail("");
  }

  function openEditor() {
    setDraft({ ...profile });
    setError("");
    setIsOpen(true);
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleaned: UserProfile = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      projectName: draft.projectName.trim(),
    };

    if (
      !cleaned.firstName ||
      !cleaned.lastName ||
      !cleaned.projectName
    ) {
      setError("Wypełnij wszystkie trzy pola.");
      return;
    }

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(cleaned)
      );

      setProfile(cleaned);
      setIsOpen(false);
      setError("");
    } catch {
      setError("Nie udało się zapisać profilu.");
    }
  }

  return (
    <>
      <button
        type="button"
        className="fs-profile-header"
        onClick={openEditor}
        title="Edytuj profil użytkownika"
      >
        <span className="fs-profile-avatar">
          {initials}
        </span>

        <span className="fs-profile-info">
          <span className="fs-profile-name">
            {displayName}
          </span>

          {profile.projectName && (
            <span className="fs-profile-project">
              {profile.projectName}
            </span>
          )}
        </span>

        <span className="fs-profile-edit" aria-hidden="true">
          ✎
        </span>
      </button>

      {isOpen && (
        <div className="fs-profile-overlay">
          <div
            className="fs-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fs-profile-title"
          >
            <h2 id="fs-profile-title">
              Edycja profilu
            </h2>

            <p>Uzupełnij dane użytkownika i projektu.</p>

            <div className="fs-google-login">
              <button type="button" className="fs-google-button" onClick={signInGoogle} disabled={googleBusy}>
                {googleBusy ? "Oczekiwanie na Google..." : "Zaloguj przez Google"}
              </button>
              {googleEmail && <button type="button" className="fs-google-disconnect" onClick={disconnectGoogle}>Odłącz Google</button>}
              <small>Opcjonalnie. Logowanie otwiera przeglądarkę; dokumenty pozostają lokalne.</small>
            </div>
            <form onSubmit={saveProfile}>
              <label htmlFor="fs-first-name">Imię</label>
              <input
                id="fs-first-name"
                value={draft.firstName}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    firstName: e.target.value,
                  })
                }
                required
                autoFocus
              />

              <label htmlFor="fs-last-name">
                Nazwisko
              </label>
              <input
                id="fs-last-name"
                value={draft.lastName}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    lastName: e.target.value,
                  })
                }
                required
              />

              <label htmlFor="fs-project-name">
                Nazwa projektu
              </label>
              <input
                id="fs-project-name"
                value={draft.projectName}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    projectName: e.target.value,
                  })
                }
                required
              />

              {error && (
                <p className="fs-profile-error" role="alert">
                  {error}
                </p>
              )}

              <div className="fs-profile-actions">
                <button
                  type="button"
                  className="fs-profile-cancel"
                  onClick={() => setIsOpen(false)}
                >
                  Anuluj
                </button>

                <button
                  type="submit"
                  className="fs-profile-save"
                >
                  Zapisz profil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
