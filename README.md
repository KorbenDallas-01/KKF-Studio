# KKF Studio — wersja źródłowa 0.1.0

Aplikacja Windows 11 do wczytywania faktur KSeF FA(3), edycji pięciu pól i generowania oryginalnej Karty Kontroli Faktury (KKF). Interfejs inspirowany stylem Linear Dark. Dokument pozostaje lokalny.

## Wymagania (Windows 11)

- Microsoft Word w klasycznej wersji desktopowej (obsługa COM), uruchomiony w interaktywnej sesji użytkownika.
- Node.js 20+ i npm.
- Rust (rustup), Visual Studio Build Tools z komponentem C++ Desktop Development i WebView2.
- .NET 8 SDK do zbudowania pomocnika. Po publikacji pomocnik jest samowystarczalny.

## Pierwsze uruchomienie

Otwórz PowerShell w folderze projektu:

```powershell
npm install
dotnet publish .\helper\KKF.Helper.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o .\helper\publish
npm run tauri dev
```

Uwaga: Tauri w trybie dev również korzysta z zasobów zadeklarowanych w `tauri.conf.json`. Jeżeli ścieżka pomocnika nie jest dostępna w środowisku dev, zbuduj aplikację instalacyjną:

```powershell
npm run tauri build
```

Instalator NSIS będzie dostępny w `src-tauri\target\release\bundle\nsis\`.

## Jak korzystać

1. Wybierz XML lub przeciągnij plik do okna aplikacji.
2. Sprawdź i ewentualnie popraw pięć pól.
3. Zaczekaj na pełny podgląd PDF renderowany przez Worda.
4. Kliknij **Generuj DOCX** (zapis w folderze domyślnym) lub **Zapisz jako…**.
5. W ustawieniach wybierz folder domyślny i opcję otwierania dokumentu po zapisie.

Przy pierwszym zapisie bez folderu domyślnego pojawia się systemowe okno „Zapisz jako”. Kolejne pliki o tej samej nazwie przy automatycznym zapisie otrzymują dopisek `(2)`, `(3)` itd.

## Ograniczenia i ryzyka

- **Wersja demonstracyjna, nieprzetestowana kompilacyjnie na Windows w tym środowisku.** Wymaga uruchomienia i testów integracyjnych na komputerze z Wordem.
- Pełny podgląd jest generowany przez Word COM. Nie używać jako usługi Windows ani na serwerze bez sesji interaktywnej.
- Długie nazwy pozycji mogą zmienić liczbę stron; aplikacja ich nie skraca automatycznie.
- Zmiana struktury szablonu KKF wymaga weryfikacji lokalizacji pięciu komórek.
- Wczytywanie XML obejmuje faktury FA(3) o standardowych polach `P_1`, `P_2`, `P_15`, `P_7` i `Podmiot1`.
- Przed użyciem produkcyjnym należy sprawdzić druk i układ dwóch stron w Wordzie oraz przetestować przypadki błędów i współbieżności.

## Struktura

- `src/` — interfejs React i podgląd PDF.js.
- `src-tauri/` — aplikacja desktopowa Tauri/Rust.
- `helper/` — .NET 8: XML, Open XML SDK, automatyzacja Word COM.
- `assets/KKF.docx` — oryginalny szablon użytkownika.
- `tests/sample.xml` — przykładowa faktura FA(3).

## Prywatność

Aplikacja nie wysyła danych faktury do internetu. Podgląd tworzy tymczasowy DOCX i PDF w katalogu tymczasowym systemu, a następnie je usuwa. Ustawienia i historia nazw plików przechowywane są lokalnie.
