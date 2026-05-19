export type ThemeName = "cupertino-light" | "cupertino-dark";

export interface AppTheme {
  name: ThemeName;
  label: string;
}

export const appThemes: AppTheme[] = [
  { name: "cupertino-light", label: "Cupertino Light" },
  { name: "cupertino-dark", label: "Cupertino Dark" },
];

export const defaultThemeName: ThemeName = "cupertino-light";
