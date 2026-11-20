using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using W = DocumentFormat.OpenXml.Wordprocessing;

record Invoice(string Number, string Date, string Seller, string Items, string Gross);
record ProjectFields(string Task, string BudgetPosition, string PurchaseRequestNumber, string ContractNumber);
record Request(string Action, string? XmlPath, string? TemplatePath, string? OutputPath, Invoice? Invoice, ProjectFields? ProjectFields, bool AvoidOverwrite = false);

class Program
{
    static int Main()
    {
        // Proces pomocniczy komunikuje sie z Tauri wyłącznie przez UTF-8.
        // To ustawienie musi poprzedzać pierwszy odczyt Console.In.
        Console.InputEncoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
        Console.OutputEncoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
        try
        {
            var req = JsonSerializer.Deserialize<Request>(Console.In.ReadToEnd(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? throw new Exception("Brak żądania.");
            object response = req.Action switch
            {
                "parse" => Parse(req.XmlPath ?? throw new Exception("Nie wybrano XML.")),
                // Diagnostyka: sprawdza, czy ścieżka dotarła niezmieniona z Tauri do .NET.
                "checkPath" => CheckPath(req.XmlPath ?? throw new Exception("Nie wybrano ścieżki.")),
                // Diagnostyka: przekazuje tekst przez cały kanał komunikacji bez otwierania pliku.
                "echoUnicode" => new { path = req.XmlPath, sample = "Zażółć gęślą jaźń ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż" },
                "generate" => Generate(req),
                "preview" => Preview(req),
                _ => throw new Exception("Nieznana operacja.")
            };
            Console.WriteLine(JsonSerializer.Serialize(new { ok = true, data = response }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
            return 0;
        }
        catch (Exception e)
        {
            Console.WriteLine(JsonSerializer.Serialize(new { ok = false, error = e.Message }));
            return 1;
        }
    }

    static object CheckPath(string path)
    {
        // Nie kodujemy URI, nie używamy ANSI ani nie modyfikujemy normalizacji nazwy.
        // Windows/.NET obsługuje tu Unicode (UTF-16) bezpośrednio.
        return new { path, exists = File.Exists(path), isXml = string.Equals(Path.GetExtension(path), ".xml", StringComparison.OrdinalIgnoreCase) };
    }

    static Invoice Parse(string path)
    {
        if (new FileInfo(path).Length > 15_000_000) throw new Exception("Plik XML jest zbyt duży.");
        using var stream = File.OpenRead(path);
        using var reader = System.Xml.XmlReader.Create(stream, new System.Xml.XmlReaderSettings { DtdProcessing = System.Xml.DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 15_000_000 });
        var xml = XDocument.Load(reader);
        XNamespace ns = "http://crd.gov.pl/wzor/2025/06/25/13775/";
        if (xml.Root?.Name != ns + "Faktura" || xml.Root.Element(ns + "Naglowek")?.Element(ns + "WariantFormularza")?.Value != "3")
            throw new Exception("Obsługiwane są faktury KSeF FA(3).");
        var fa = xml.Root.Element(ns + "Fa") ?? throw new Exception("Brak sekcji Fa.");
        string Required(XElement? e, string label) => !string.IsNullOrWhiteSpace(e?.Value) ? e.Value.Trim() : throw new Exception($"Brak pola: {label}.");
        var date = DateTime.ParseExact(Required(fa.Element(ns + "P_1"), "data wystawienia"), "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var amount = decimal.Parse(Required(fa.Element(ns + "P_15"), "kwota brutto"), NumberStyles.Number, CultureInfo.InvariantCulture);
        var items = fa.Elements(ns + "FaWiersz").Select(x => x.Element(ns + "P_7")?.Value.Trim()).Where(x => !string.IsNullOrWhiteSpace(x));
        var currency = fa.Element(ns + "KodWaluty")?.Value.Trim() ?? "PLN";
        return new Invoice(Required(fa.Element(ns + "P_2"), "numer faktury"), date.ToString("dd.MM.yyyy"),
            Required(xml.Root.Element(ns + "Podmiot1")?.Element(ns + "DaneIdentyfikacyjne")?.Element(ns + "Nazwa"), "sprzedawca"),
            string.Join("\n", items), amount.ToString("N2", CultureInfo.GetCultureInfo("pl-PL")) + " " + currency);
    }

    static object Generate(Request req)
    {
        var output = req.OutputPath ?? throw new Exception("Brak ścieżki wyjściowej.");
        if (req.AvoidOverwrite)
        {
            var original = output;
            int suffix = 2;
            while (File.Exists(output))
            {
                output = Path.Combine(Path.GetDirectoryName(original)!, Path.GetFileNameWithoutExtension(original) + $" ({suffix++})" + Path.GetExtension(original));
                if (suffix > 9999) throw new Exception("Zbyt wiele dokumentów o tej samej nazwie.");
            }
        }
        Fill(req.TemplatePath ?? throw new Exception("Brak szablonu."), output,
            req.Invoice ?? throw new Exception("Brak danych."),
            req.ProjectFields ?? throw new Exception("Brak danych projektu."));
        return new { path = output };
    }

    static object Preview(Request req)
    {
        var dir = Path.Combine(Path.GetTempPath(), "KKFStudio", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var docx = Path.Combine(dir, "preview.docx");
            var pdf = Path.Combine(dir, "preview.pdf");
            Fill(req.TemplatePath ?? throw new Exception("Brak szablonu."), docx,
                req.Invoice ?? throw new Exception("Brak danych."),
                req.ProjectFields ?? throw new Exception("Brak danych projektu."));
            ExportPdfWithWord(docx, pdf);
            return new { pdfBase64 = Convert.ToBase64String(File.ReadAllBytes(pdf)) };
        }
        finally { try { Directory.Delete(dir, true); } catch { } }
    }

    // W szablonach polskie nazwy pól są czasem rozbite na wiele węzłów Text.
    // Wyszukujemy etykiety po połączonej treści i niezależnie od spacji i dwukropka.
    static string NormalizeLabel(string text) =>
        Regex.Replace(text.Trim().TrimEnd(':'), @"\s+", " ").ToLowerInvariant();

    static void Fill(string template, string output, Invoice invoice, ProjectFields project)
    {
        if (!File.Exists(template)) throw new Exception("Nie znaleziono szablonu KKF.");
        foreach (var value in new[] { invoice.Number, invoice.Date, invoice.Seller, invoice.Items, invoice.Gross })
            if (string.IsNullOrWhiteSpace(value)) throw new Exception("Wszystkie pięć pól dokumentu musi być uzupełnionych.");
        if (string.IsNullOrWhiteSpace(project.Task) || string.IsNullOrWhiteSpace(project.BudgetPosition))
            throw new Exception("Uzupełnij zadanie i pozycję budżetową.");

        // Klucz: widoczny nagłówek w tabeli; id: unikatowe pole formularza.
        var map = new Dictionary<string, (string Id, string Value)>(StringComparer.OrdinalIgnoreCase) {
            ["nr faktury"] = ("number", invoice.Number),
            ["nr rachunku /nr faktury"] = ("number", invoice.Number),
            ["z dnia"] = ("date", invoice.Date),
            ["wystawiona przez"] = ("seller", invoice.Seller),
            ["nazwa towaru/usługi"] = ("items", invoice.Items),
            ["kwota brutto dokumentu"] = ("gross", invoice.Gross),
            ["zadanie"] = ("task", project.Task),
            ["pozycja budżetowa"] = ("budget", project.BudgetPosition),
            ["nr wniosku zakupowego"] = ("purchase", project.PurchaseRequestNumber ?? ""),
            ["nr umowy"] = ("contract", project.ContractNumber ?? ""),
        };
        var requiredIds = new[] { "number", "date", "seller", "items", "gross", "task", "budget", "purchase", "contract" };
        var target = Path.GetFullPath(output);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        if (Path.GetFullPath(template).Equals(target, StringComparison.OrdinalIgnoreCase)) throw new Exception("Nie wolno nadpisywać szablonu.");
        var tmp = target + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.Copy(template, tmp);
            using (var doc = WordprocessingDocument.Open(tmp, true))
            {
                var table = doc.MainDocumentPart?.Document.Body?.Elements<Table>().FirstOrDefault()
                    ?? throw new Exception("Brak tabeli w szablonie.");
                var filled = new HashSet<string>();
                foreach (var row in table.Elements<TableRow>())
                {
                    // Elements<TableCell> zwraca rzeczywiste komórki, a nie powtórzenia komórek scalonych.
                    var cells = row.Elements<TableCell>().ToList();
                    for (int i = 0; i < cells.Count - 1; i++)
                    {
                        var label = NormalizeLabel(string.Concat(cells[i].Descendants<W.Text>().Select(x => x.Text)));
                        if (!map.TryGetValue(label, out var entry) || !filled.Add(entry.Id)) continue;
                        var cell = cells[i + 1];
                        // W części szablonów znajdują się przykładowe wartości i instrukcje.
                        // Podmieniamy WYŁĄCZNIE dziewięć docelowych komórek, bez zmian sąsiednich.
                        // Pozostawiamy właściwości TableCellProperties (szerokość, scalenie, obramowania).
                        foreach (var child in cell.ChildElements.Where(c => c is not TableCellProperties).ToList()) child.Remove();
                        var lines = (entry.Value ?? "").Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
                        foreach (var line in lines)
                        {
                            cell.Append(new Paragraph(new ParagraphProperties(new SpacingBetweenLines { Before = "0", After = "0" }),
                                new Run(new RunProperties(new FontSize { Val = "18" }),
                                    new W.Text(line) { Space = DocumentFormat.OpenXml.SpaceProcessingModeValues.Preserve })));
                        }
                        // Pomiń właśnie wypełnioną komórkę; jej tekst nie jest nową etykietą.
                        i++;
                    }
                }
                if (filled.Count != requiredIds.Length)
                    throw new Exception("Szablon nie zawiera wymaganych pól: " + string.Join(", ", requiredIds.Except(filled)));
                doc.MainDocumentPart!.Document.Save();
            }
            File.Move(tmp, target, true);
        }
        finally { if (File.Exists(tmp)) File.Delete(tmp); }
    }

    static void ExportPdfWithWord(string docx, string pdf)
    {
        // Word COM wymaga interaktywnej sesji Windows z zainstalowanym Wordem.
        var type = Type.GetTypeFromProgID("Word.Application") ?? throw new Exception("Nie znaleziono Microsoft Word.");
        dynamic? app = null; dynamic? document = null;
        try
        {
            app = Activator.CreateInstance(type)!;
            app.Visible = false;
            app.DisplayAlerts = 0;
            document = app.Documents.Open(docx, ReadOnly: true, AddToRecentFiles: false, Visible: false);
            document.ExportAsFixedFormat(pdf, 17); // wdExportFormatPDF
        }
        catch (Exception ex) { throw new Exception("Nie udało się przygotować podglądu przez Word: " + ex.Message); }
        finally
        {
            try { if (document != null) document.Close(false); } catch { }
            try { if (app != null) app.Quit(false); } catch { }
        }
    }
}
