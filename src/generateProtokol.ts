
import PizZip from "pizzip";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export type ProtocolFields = {
  assetName: string;
  inventoryNumber: string;
  serialNumber: string;
};

type UserProfile = {
  firstName: string;
  lastName: string;
  projectName: string;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function generateProtokolDocx(
  folder: string,
  fields: ProtocolFields,
  saveAs: boolean
): Promise<string | null> {

  // 1. Odczyt profilu.
  const saved = localStorage.getItem(
    "kkf-studio-profile"
  );

  if (!saved) {
    throw new Error(
      "Najpierw uzupełnij profil użytkownika."
    );
  }

  let profile: UserProfile;

  try {
    profile = JSON.parse(saved);
  } catch {
    throw new Error("Błąd odczytu profilu.");
  }

  const firstName = profile.firstName?.trim() || "";
  const lastName = profile.lastName?.trim() || "";
  const project = profile.projectName?.trim() || "";

  if (!firstName || !lastName || !project) {
    throw new Error(
      "Uzupełnij imię, nazwisko i nazwę projektu w profilu."
    );
  }

  const assetName = fields.assetName.trim();
  const inventoryNumber = fields.inventoryNumber.trim();
  const serialNumber = fields.serialNumber.trim();

  if (!assetName || !inventoryNumber || !serialNumber) {
    throw new Error("Uzupełnij wszystkie pola sprzętu.");
  }

  // 2. Aktualna data.
  const now = new Date();

  const date = new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);

  // 3. Pobranie szablonu.
  const templateUrl =
    `${import.meta.env.BASE_URL}templates/` +
    "protokol_zdawczo-odbiorczy.docx";

  const response = await fetch(templateUrl);

  if (!response.ok) {
    throw new Error("Nie znaleziono szablonu DOCX.");
  }

  const zip = new PizZip(
    await response.arrayBuffer()
  );

  const document = zip.file("word/document.xml");

  if (!document) {
    throw new Error("Nieprawidłowy szablon Word.");
  }

  let xml = document.asText();

  // 4. Wszystkie znaczniki.
  const replacements: Record<string, string> = {
    "$data": date,
    "$imieinazwisko": `${firstName} ${lastName}`,
    "$projekt": project,
    "$nazwazasobu": assetName,
    "$numerewidencyjny": inventoryNumber,
    "$sn": serialNumber,
  };

  for (const [marker, value] of Object.entries(
    replacements
  )) {
    if (!xml.includes(marker)) {
      throw new Error(
        `Brakuje znacznika ${marker} w szablonie.`
      );
    }

    xml = xml.split(marker).join(escapeXml(value));
  }

  zip.file("word/document.xml", xml);

  // 5. Gotowy dokument DOCX.
  const bytes = zip.generate({
    type: "uint8array",
    compression: "DEFLATE",
  });

  // 6. Automatyczna nazwa z datą i godziną.
  const dateStamp =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")}`;

  const timeStamp = [
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  ].map(n => String(n).padStart(2, "0")).join("-");

  const filename =
    `Protokol_przekazania_${dateStamp}_${timeStamp}.docx`;

  const directory = folder.trim().replace(/[\\/]+$/, "");

  const suggestedPath = directory
    ? `${directory}\\${filename}`
    : filename;

  // 7. Próba bezpośredniego zapisu do folderu.
  // Gdy jest niedozwolony, otwieramy okno zapisu.
  if (!saveAs && directory) {
    try {
      await writeFile(suggestedPath, bytes);
      return suggestedPath;
    } catch {
      // Brak dostępu do folderu lub inny błąd.
      // Użytkownik wybierze miejsce ręcznie.
    }
  }

  // 8. Systemowe okno "Zapisz jako".
  const path = await save({
    title: "Zapisz protokół przekazania",
    defaultPath: suggestedPath,
    filters: [
      {
        name: "Dokument Word",
        extensions: ["docx"],
      },
    ],
  });

  if (!path) return null;

  await writeFile(path, bytes);

  return path;
}
