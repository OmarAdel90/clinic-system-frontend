"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Locale = "en" | "ar";

type LocaleContextValue = {
  locale: Locale;
  isRTL: boolean;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (text?: string | null) => string;
};

const STORAGE_KEY = "clinic-system-locale";

const exactTranslations: Record<string, string> = {
  "Clinic System": "نظام العيادة",
  "Operations CRM": "إدارة عمليات العيادة",
  staff: "موظف",
  "Sign Out": "تسجيل الخروج",
  Workspace: "مساحة العمل",
  Overview: "نظرة عامة",
  CRM: "إدارة العملاء",
  Clinical: "العيادات",
  Operations: "العمليات",
  Administration: "الإدارة",
  Dashboard: "لوحة التحكم",
  Leads: "العملاء المحتملون",
  "Lead Queue": "طابور العملاء",
  "Lead Statuses": "حالات العملاء",
  Agent: "الموظف",
  Campaigns: "الحملات",
  "Treatment Plans": "خطط العلاج",
  Visits: "الزيارات",
  Reports: "التقارير",
  "Medical Records": "السجلات الطبية",
  "Patient Feedback": "ملاحظات المرضى",
  Invoices: "الفواتير",
  Clinics: "العيادات",
  Warehouses: "المخازن",
  Pharmaceuticals: "الأدوية",
  Suppliers: "الموردون",
  Users: "المستخدمون",
  Roles: "الأدوار",
  Settings: "الإعدادات",
  "Operational overview": "ملخص العمليات",
  "CRM pipeline and assignments": "مسار العملاء والتعيينات",
  "Round-robin queue management": "إدارة الطابور الدوري",
  "Dynamic pipeline status management": "إدارة حالات المسار",
  "Conversations, chat, and follow-through": "المحادثات والمتابعة",
  "Marketing performance": "أداء التسويق",
  "Primary care-plan workspace and visit bundles": "خطط العلاج والزيارات",
  "Operational queue for scheduling, confirmations, and exceptions":
    "طابور الجدولة والتأكيدات والاستثناءات",
  "Doctor notes, visit outcomes, and completed care records":
    "ملاحظات الطبيب ونتائج الزيارة",
  "Patient files and clinical attachments": "ملفات المرضى والمرفقات الطبية",
  "Post-visit sentiment and follow-through": "ملاحظات ما بعد الزيارة",
  "Billing and payments": "الفواتير والمدفوعات",
  "Branches and services": "الفروع والخدمات",
  "Inventory and stock": "المخزون والعهد",
  "Medication catalog": "دليل الأدوية",
  "Vendors, supplier batches, and payments": "الموردون والدفعات والمدفوعات",
  "Team members and access": "أعضاء الفريق والصلاحيات",
  "Permissions and RBAC": "الصلاحيات والأدوار",
  "Meta messaging credentials and webhook setup":
    "بيانات اعتماد ميتا وإعدادات الـ webhook",
  "Clinic operations": "عمليات العيادة",
  "Leads, visits, stock, billing, and team access in one place.":
    "العملاء والزيارات والمخزون والفواتير وصلاحيات الفريق في مكان واحد.",
  "CRM Pipeline": "مسار العملاء",
  "Lead intake, assignment, and agent follow-up.":
    "استقبال العملاء وتعيينهم ومتابعتهم.",
  "Clinical Visits": "الزيارات العلاجية",
  "Scheduling, completion, reports, and billing.":
    "الجدولة والإتمام والتقارير والفواتير.",
  "Inventory Ops": "عمليات المخزون",
  "Warehouses, supplier transactions, and stock control.":
    "المخازن وحركات الموردين وضبط المخزون.",
  "Sign In": "تسجيل الدخول",
  "Open the operations workspace": "الدخول إلى مساحة العمل",
  "Continue with your email address or phone number.":
    "تابع باستخدام البريد الإلكتروني أو رقم الهاتف.",
  "Loading sign-in...": "جاري تحميل تسجيل الدخول...",
  "Email or Phone": "البريد الإلكتروني أو الهاتف",
  "Email address or phone number": "البريد الإلكتروني أو رقم الهاتف",
  Password: "كلمة المرور",
  "Enter your password": "أدخل كلمة المرور",
  "Unable to sign in.": "تعذر تسجيل الدخول.",
  "Signing In...": "جارٍ تسجيل الدخول...",
  "No matches found.": "لا توجد نتائج.",
  Search: "بحث",
  "Select an option": "اختر قيمة",
  "Open conversation and work the lead from one place.":
    "افتح المحادثة وأدر العميل من نفس المكان.",
  "Pending follow-ups.": "متابعات معلقة.",
  "Conversation details.": "تفاصيل المحادثة.",
  "Update lead details.": "تحديث بيانات العميل.",
  "Assign or clear the clinic.": "تعيين العيادة أو إلغاء التعيين.",
  "Search and manage team accounts.": "البحث وإدارة حسابات الفريق.",
  "Add a new team account.": "إضافة حساب جديد.",
  "Update account details and roles.": "تحديث بيانات الحساب والأدوار.",
  "Manage roles and permissions.": "إدارة الأدوار والصلاحيات.",
  "Search and manage roles.": "البحث وإدارة الأدوار.",
  "Add a new role.": "إضافة دور جديد.",
  "Update the role and permissions.": "تحديث الدور والصلاحيات.",
  "Manage clinics, services, staff, and warehouse links.":
    "إدارة العيادات والخدمات والموظفين وروابط المخازن.",
  "Search and manage clinics.": "البحث وإدارة العيادات.",
  "Add a clinic and its services.": "إضافة عيادة وخدماتها.",
  "Update clinic details, staff, and warehouse link.":
    "تحديث بيانات العيادة والموظفين ورابط المخزن.",
  "Manage imported and manual campaigns.":
    "إدارة الحملات المستوردة واليدوية.",
  "Search and manage campaigns.": "البحث وإدارة الحملات.",
  "Pull campaigns from the selected Meta ad account.":
    "سحب الحملات من حساب ميتا الإعلاني المحدد.",
  "Add a manual campaign.": "إضافة حملة يدوية.",
  "Update campaign details.": "تحديث بيانات الحملة.",
  "Imported ad sets for this campaign.": "مجموعات الإعلانات لهذه الحملة.",
  "Manage the medication catalog.": "إدارة دليل الأدوية.",
  "Search and manage medications.": "البحث وإدارة الأدوية.",
  "Add a catalog item.": "إضافة عنصر إلى الدليل.",
  "Update medication details.": "تحديث بيانات الدواء.",
  "Saved attributes.": "الخصائص المحفوظة.",
  "Manage clinical files and notes.": "إدارة الملفات الطبية والملاحظات.",
  "Search and manage records by lead.": "البحث وإدارة السجلات حسب العميل.",
  "Attach a file to the selected lead.": "إرفاق ملف بالعميل المحدد.",
  "Saved notes.": "الملاحظات المحفوظة.",
  "Open or save the attachment.": "فتح المرفق أو حفظه.",
  "Update or remove the record.": "تحديث السجل أو حذفه.",
  "Unable to load dashboard.": "تعذر تحميل لوحة التحكم.",
  "Today's overview": "نظرة اليوم",
  "Keep the pipeline, visits, and cashflow in one glance.":
    "تابع العملاء والزيارات والتدفق النقدي من نظرة واحدة.",
  "This board is trimmed down to the numbers that matter most while you are running the operation.":
    "هذه اللوحة تعرض أهم الأرقام أثناء تشغيل العمل.",
  Collected: "المحصل",
  Outstanding: "المتبقي",
  Alerts: "التنبيهات",
  "Operational pressure": "الضغط التشغيلي",
  "Pending follow-ups": "متابعات معلقة",
  "Missed or cancelled visits": "زيارات فائتة أو ملغاة",
  "Critical stock rows": "أصناف حرجة",
  Performance: "الأداء",
  "Visit Pipeline": "مسار الزيارات",
  "Booking through completion.": "من الحجز حتى الإتمام.",
  Scheduled: "مجدول",
  Confirmed: "مؤكد",
  Completed: "مكتمل",
  Loss: "مفقود",
  "Treatment Plan Progress": "تقدم خطط العلاج",
  "How many plans are still in flight versus fully completed.":
    "عدد الخطط الجارية مقابل الخطط المكتملة.",
  "Recent Visits": "أحدث الزيارات",
  "Latest visit activity.": "آخر نشاط للزيارات.",
  "No visit activity returned yet.": "لا يوجد نشاط زيارات بعد.",
};

function translatePattern(text: string): string | null {
  const pageHeaderPattern = [
    [/^CRM and clinic operations in (.+)\.$/, "إدارة العملاء وعمليات العيادة بتوقيت $1."],
    [/^Completed visit reports in (.+)\.$/, "تقارير الزيارات المكتملة بتوقيت $1."],
    [/^Conversations and performance in (.+)\.$/, "المحادثات والأداء بتوقيت $1."],
    [/^Invoices and payments in (.+)\.$/, "الفواتير والمدفوعات بتوقيت $1."],
    [/^Patient feedback in (.+)\.$/, "ملاحظات المرضى بتوقيت $1."],
    [/^Treatment plans and scheduled visits in (.+)\.$/, "خطط العلاج والزيارات المجدولة بتوقيت $1."],
    [/^Visit operations in (.+)\.$/, "عمليات الزيارات بتوقيت $1."],
  ] as const;

  for (const [pattern, replacement] of pageHeaderPattern) {
    if (pattern.test(text)) {
      return text.replace(pattern, replacement);
    }
  }

  return null;
}

function translateText(text: string | null | undefined, locale: Locale): string {
  if (!text || locale === "en") {
    return text ?? "";
  }

  return exactTranslations[text] ?? translatePattern(text) ?? text;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "ar" || saved === "en") {
      setLocaleState(saved);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale === "ar" ? "ar" : "en";

    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      isRTL: locale === "ar",
      setLocale: (nextLocale) => setLocaleState(nextLocale),
      toggleLocale: () => setLocaleState((current) => (current === "en" ? "ar" : "en")),
      t: (text) => translateText(text, locale),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider.");
  }

  return context;
}
