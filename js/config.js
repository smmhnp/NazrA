/** Single source of project settings; TODO values are unverified. */

export const CONFIG = {
  universityName: "موسسه آموزش عالی شاندیز",
  programTitle: "نهضت هر شب جمعه",
  logoPath: "./assets/logo.png",

  // Program email; TODO means no mailto link is built.
  NEHZAT_EMAIL: "TODO",

  // Exact mokab address; TODO means unpublished.
  mosqueAddress: "TODO",

  // Event time in the local timeZone, HH:MM.
  // TODO: show a to-be-announced message instead.
  eventTime: "TODO",

  // Explicit IANA time zone for the displayed event time.
  timeZone: "Asia/Tehran",

  // Weekday: 0=Sunday ... 4=Thursday (Friday eve) ... 6=Saturday.
  // In the Iranian calendar, Friday eve falls on Thursday night.
  eventDayOfWeek: 4,

  brand: {
    background: "#0E0F12",
    surface: "#16181D",
    surfaceElevated: "#1C1F25",
    text: "#EDE8DC",
    textSecondary: "#AAA69D",
    gold: "#C9A24B",
    green: "#2E6B5E",
    border: "rgba(201, 162, 75, 0.16)",
    glow: "rgba(201, 162, 75, 0.08)"
  },

  // Fixed card footer line; no real location is claimed.
  card: {
    footerLine: "شب جمعه، موکب …",
    headerLine: "ایام فاطمیه • نهضت هر شب جمعه",
    fontFamily: "Vazirmatn"
  },

  privacy: {
    notice: "عکس شما فقط روی همین دستگاه پردازش میشود و به هیچ سروری ارسال نمیشود.",
    maxImageBytes: 15 * 1024 * 1024
  },

  storageKey: "nazra.state.v1",

  // Cache version is managed by scripts/bump-sw.mjs.
  serviceWorkerPath: "./sw.js"
};

export default CONFIG;
