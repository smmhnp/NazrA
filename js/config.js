/**
 * config.js — یگانه منبع تنظیمات پروژه.
 *
 * ⚠️ مقادیر «TODO» تأییدنشدهاند و نباید بهعنوان اطلاعات واقعی نمایش داده شوند.
 * برای انتشار، فقط این فایل (و محتوای content.js) را ویرایش کنید.
 * هیچ مقداری در این فایل از سرور، API یا سرویس خارجی خوانده نمیشود.
 */

export const CONFIG = {
  universityName: "دانشگاه شاندیز",
  programTitle: "نهضت هر شب جمعه",
  logoPath: "./assets/logo.svg",

  // آدرس ایمیل نهضت. «TODO» یعنی تنظیم نشده → لینک mailto ساخته نمیشود.
  NEHZAT_EMAIL: "TODO",

  // آدرس دقیق موکب. «TODO» یعنی اعلامنشده.
  mosqueAddress: "TODO",

  // ساعت برگزاری به وقت محلیِ timeZone، قالب «HH:MM».
  // «TODO» یعنی ساعت تأییدنشده → شمارش معکوس نمایش داده نمیشود.
  eventTime: "TODO",

  // منطقه زمانی صریح (IANA). محاسبات شمارش معکوس بر اساس همین مقدار است.
  timeZone: "Asia/Tehran",

  // روز برگزاری: ۰=یکشنبه … ۴=پنجشنبه (شب جمعه) … ۶=شنبه.
  // «شب جمعه» در تقویم ایرانی برابر است با غروب/شب پنجشنبه.
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

  // متن ثابت پایین همهٔ کارتها. نام مکان بهصورت واقعی ادعا نمیشود.
  card: {
    footerLine: "شب جمعه، موکب …",
    headerLine: "ایام فاطمیه • نهضت هر شب جمعه",
    fontFamily: "Vazirmatn"
  },

  privacy: {
    notice: "عکس شما فقط روی همین دستگاه پردازش میشود و به هیچ سروری ارسال نمیشود.",
    comingNotice: "این فقط نشانگر شخصی روی دستگاه شماست؛ ثبتنام یا اعلام حضور به برگزارکنندگان انجام نمیشود.",
    maxImageBytes: 15 * 1024 * 1024
  },

  storageKey: "nazra.state.v1",

  // نسخهٔ کش توسط scripts/bump-sw.mjs مدیریت میشود.
  serviceWorkerPath: "./sw.js"
};

export default CONFIG;
