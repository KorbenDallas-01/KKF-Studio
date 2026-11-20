export type KkfCategory = "faktury" | "rachunki";
export const kkfTemplates: Record<KkfCategory, string[]> = {
  faktury: [
    "KKF do faktury projekt FERS 5PRK.docx",
    "KKF do faktury projekt FERS BM.docx",
    "KKF do faktury projekt FERS CWD.docx",
    "KKF do faktury projekt FERS E-dostęp.docx",
    "KKF do faktury projekt FERS EDUW.docx",
    "KKF do faktury projekt FERS LOSY3.docx",
    "KKF do faktury projekt FERS Mikro.docx",
    "KKF do faktury projekt FERS Nauczyciele2.docx",
    "KKF do faktury projekt FERS P4S.docx",
    "KKF do faktury projekt FERS PrzedmiotyŚcisłe.docx",
    "KKF do faktury projekt FERS RozZPE.docx",
    "KKF do faktury projekt FERS UczeńZdolny.docx",
    "KKF do faktury projekt FERS ZRK3.docx",
    "KKF do faktury projekt FERS ZSK7.docx",
    "KKF do faktury projekt ICCS2027.docx",
    "KKF do faktury projekt INTEGRED.docx",
    "KKF do faktury projekt MOWE.docx",
    "KKF do faktury projekt OECDps.docx",
    "KKF do faktury projekt PISA2025.docx",
    "KKF do faktury projekt PrzyjaznaSzkoła.docx",
    "KKF do faktury projekt ReferNet2026.docx",
    "KKF do faktury projekt Tranzycja.docx"
  ],
  rachunki: [
    "KKF do rachunku projekt FERS 5PRK.docx",
    "KKF do rachunku projekt FERS BM.docx",
    "KKF do rachunku projekt FERS CWD.docx",
    "KKF do rachunku projekt FERS E-dostęp.docx",
    "KKF do rachunku projekt FERS EDUW.docx",
    "KKF do rachunku projekt FERS LOSY3.docx",
    "KKF do rachunku projekt FERS Mikro.docx",
    "KKF do rachunku projekt FERS Nauczyciele2.docx",
    "KKF do rachunku projekt FERS P4S.docx",
    "KKF do rachunku projekt FERS PrzedmiotyŚcisłe.docx",
    "KKF do rachunku projekt FERS RozZPE.docx",
    "KKF do rachunku projekt FERS UczeńZdolny.docx",
    "KKF do rachunku projekt FERS ZRK3.docx",
    "KKF do rachunku projekt FERS ZSK7.docx",
    "KKF do rachunku projekt ICCS2027.docx",
    "KKF do rachunku projekt INTEGRED.docx",
    "KKF do rachunku projekt MOWE.docx",
    "KKF do rachunku projekt OECDps.docx",
    "KKF do rachunku projekt PISA2025.docx",
    "KKF do rachunku projekt PrzyjaznaSzkoła.docx",
    "KKF do rachunku projekt ReferNet2026.docx",
    "KKF do rachunku projekt Tranzycja.docx"
  ]
};
export const categoryNames: Record<KkfCategory, string> = {
  faktury: "KKF do faktur w ramach projektów",
  rachunki: "KKF do rachunków w ramach projektów",
};
export function projectName(fileName: string): string {
  return fileName.replace(/^KKF do (faktury|rachunku) projekt /, "").replace(/\.docx$/i, "");
}
