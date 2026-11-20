# KKF Studio — rozszerzenie: 44 szablony projektowe

Aplikacja lokalna Windows 11 (React, Tauri 2, .NET 8 / Open XML). Korzysta z 22 szablonów **KKF do faktur** i 22 szablonów **KKF do rachunków** przekazanych przez użytkownika. Pozostałe funkcje projektu (Profil, Protokół przekazania, Ustawienia) zostały zachowane.

## Jak korzystać

1. W menu kliknij **Nowa kkf**.
2. Wybierz **KKF do faktur w ramach projektów** lub **KKF do rachunków w ramach projektów**.
3. Kliknij nazwę konkretnego projektu / szablonu.
4. W edytorze **DOKUMENT / KKF** załącz XML KSeF FA(3) i sprawdź automatycznie uzupełnione pola.
5. Uzupełnij **Zadanie** oraz **Pozycja budżetowa** (wymagane).
6. Opcjonalnie uzupełnij **Nr wniosku zakupowego** i **Nr umowy**.
7. Kliknij **Generuj DOCX** lub **Zapisz jako…**. Wszystkie 9 pól jest wpisywane do właściwych komórek wybranego DOCX.

Szablony oryginalne są w `assets/templates/faktury/` i `assets/templates/rachunki/`. Są kopiowane do instalatora przez deklarację w `src-tauri/tauri.conf.json`. Mechanizm generowania podmienia tylko wskazane komórki, także w szablonach zawierających już przykładowe wartości. Nie ma automatycznego podglądu PDF.

## Kompilacja na Windows 11

Wymagane: Node.js 20+, Rust (MSVC), .NET 8 SDK, Visual Studio C++ Build Tools, WebView2. Po rozpakowaniu całego archiwum otwórz PowerShell w katalogu z `package.json` i uruchom:

```powershell
.\START_KOMPILACJI.cmd
```

Lub:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Skrypt publikuje pomocnika .NET, instaluje paczki npm i buduje instalator NSIS. Instalator pojawi się w `src-tauri\target\release\bundle\nsis\`. Docelowy DOCX można otwierać w Microsoft Word, ale samo wypełnianie komórek korzysta z Open XML.

## Implementacja

- `src/App.tsx` — trzyetapowe UI (rodzaj, szablon, edytor), formularz, walidacja, zapisywanie.
- `src/kkfTemplates.ts` — lista nazw 44 rzeczywistych szablonów.
- `src/style.css` — nowa lista szablonów i przyciski wyboru.
- `src-tauri/src/lib.rs` — bezpieczne odnajdywanie wybranego szablonu w zasobach aplikacji.
- `src-tauri/tauri.conf.json` — pakowanie wszystkich plików DOCX.
- `helper/Program.cs` — uzupełnianie 9 pozycji w tabelach, również w szablonach rachunków.
- `tests/sample.xml` — przykładowy XML ze starszego projektu.

**Weryfikacja:** przeprowadzono statyczne sprawdzenie 44 dokumentów oraz składni TSX. Nie wykonano kompilacji ani testu instalatora na Windows w tym środowisku (brak .NET SDK oraz kompletnej instalacji zależności npm). Przed wdrożeniem przetestuj na Windows generowanie przynajmniej po jednym dokumencie z każdej grupy, a także szablon z wcześniejszym tekstem pomocniczym (np. FERS 5PRK).
