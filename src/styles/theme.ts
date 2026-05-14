/**
 * TypeScript mirror of CSS custom property token values.
 * Use for JS-driven visuals (charts, SVG, email) where CSS vars aren't available.
 * Values must exactly match globals.css.
 */

interface ThemeTokens {
  [key: string]: string;
  bgCanvas: string;
  bgSurface: string;
  bgSurfaceSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  borderDefault: string;
  borderStrong: string;
  accent: string;
  accentHover: string;
  accentSubtle: string;
  accentOn: string;
  coachAccent: string;
  coachSubtle: string;
  partyInitiator: string;
  partyInitiatorSubtle: string;
  partyInvitee: string;
  partyInviteeSubtle: string;
  danger: string;
  dangerSubtle: string;
  warning: string;
  warningSubtle: string;
  success: string;
  privateTint: string;
}

const theme: { light: ThemeTokens; dark: ThemeTokens } = {
  light: {
    bgCanvas: "#FAF8F5",
    bgSurface: "#FFFFFF",
    bgSurfaceSubtle: "#F3EFE9",
    textPrimary: "#1F1D1A",
    textSecondary: "#5C5952",
    textTertiary: "#8A8680",
    borderDefault: "#E5E0D8",
    borderStrong: "#CBC4B8",
    accent: "#6B8E7F",
    accentHover: "#5A7A6C",
    accentSubtle: "#DCE7E0",
    accentOn: "#FFFFFF",
    coachAccent: "#8B7AB5",
    coachSubtle: "#EAE4F2",
    partyInitiator: "#6B85A8",
    partyInitiatorSubtle: "#DFE5EF",
    partyInvitee: "#B07A8F",
    partyInviteeSubtle: "#EFE0E4",
    danger: "#B5594D",
    dangerSubtle: "#F2DCD8",
    warning: "#B58B4D",
    warningSubtle: "#F2E5D4",
    success: "#6B8E7F",
    privateTint: "#F0E9E0",
  },
  dark: {
    bgCanvas: "#1A1816",
    bgSurface: "#242220",
    bgSurfaceSubtle: "#2E2B28",
    textPrimary: "#F2EFE9",
    textSecondary: "#A8A39A",
    textTertiary: "#7A766E",
    borderDefault: "#3A3632",
    borderStrong: "#4A4640",
    accent: "#89A99B",
    accentHover: "#9ABAAC",
    accentSubtle: "#2E3A35",
    accentOn: "#1A1816",
    coachAccent: "#A797CC",
    coachSubtle: "#342E42",
    partyInitiator: "#8BA3C2",
    partyInitiatorSubtle: "#2C3542",
    partyInvitee: "#CC96A9",
    partyInviteeSubtle: "#3E2E34",
    danger: "#CC786D",
    dangerSubtle: "#3E2A27",
    warning: "#CC9F6D",
    warningSubtle: "#3E3228",
    success: "#89A99B",
    privateTint: "#2D2924",
  },
};

export default theme;
