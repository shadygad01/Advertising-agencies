"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Sign = {
  id: string;
  location: string;
  start: string;
  end: string;
  cost: number;
};
type Installment = {
  id: string;
  label: string;
  due: string;
  amount: number;
  kind: "deposit" | "installment";
};
type Payment = { id: string; date: string; amount: number; note: string };
type Contract = {
  id: string;
  company: string;
  title: string;
  start: string;
  displayStart?: string;
  quantity?: number;
  monthlyUnitPrice?: number;
  durationMonths?: number;
  signs: Sign[];
  installments: Installment[];
  payments: Payment[];
  notes: string;
  agreementType?: "campaign" | "printing" | "companyDeposit";
};

const KEY = "ad-expense-planner-v2";
const monthsAr = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const fiscalMonths = (startYear: number) =>
  Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(startYear, 6 + offset, 1, 12);
    return {
      name: monthsAr[date.getMonth()],
      month: date.getMonth(),
      year: date.getFullYear(),
      label: `${monthsAr[date.getMonth()]} ${date.getFullYear()}`,
    };
  });
const currentFiscalYear = () => {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
};
const money = (n: number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n) +
  " ج.م";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);
const splitRoundedInstallments = (total: number, count: number) => {
  if (count <= 0) return [];
  const candidate = Math.round(total / count / 1000) * 1000;
  const regular =
    count > 1 && candidate * (count - 1) > total
      ? Math.floor(total / count / 1000) * 1000
      : candidate;
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? total - regular * (count - 1) : regular,
  );
};
const validateDepositSchedule = (
  deposit: number,
  total: number,
  depositDate: string,
  installments: Installment[],
) => {
  if (deposit < 0 || deposit > total) {
    alert("دفعة التعاقد يجب ألا تتجاوز إجمالي قيمة الاتفاق.");
    return false;
  }
  if (!deposit) return true;
  const laterPriorityItem = installments
    .filter((i) => i.kind === "installment")
    .some((i) => i.due < depositDate);
  if (laterPriorityItem) {
    alert("تاريخ دفعة التعاقد يجب أن يسبق تاريخ أول قسط أو يوافقه.");
    return false;
  }
  return true;
};
const agreementValueForMonth = (c: Contract, year: number, month: number) => {
  const startText = c.displayStart || c.signs[0]?.start;
  const endText = c.signs[0]?.end;
  if (!startText || !endText) return 0;
  const monthStart = new Date(year, month, 1, 12);
  const monthEnd = new Date(year, month + 1, 0, 12);
  const start = new Date(startText + "T12:00:00");
  const end = new Date(endText + "T12:00:00");
  const from = start > monthStart ? start : monthStart;
  const to = end < monthEnd ? end : monthEnd;
  if (from > to) return 0;
  if (year === start.getFullYear() && month === start.getMonth() && start.getDate() === 15) return Math.round((c.quantity || 1) * (c.monthlyUnitPrice || 0) * 50) / 100;
  const activeDays = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
  const daysInMonth = monthEnd.getDate();
  return (
    Math.round(
      (((c.quantity || 1) * (c.monthlyUnitPrice || 0) * activeDays) /
        daysInMonth) *
        100,
    ) / 100
  );
};
const partialStartMonthAmount = (startText: string, quantity: number, unitPrice: number) => { if (!startText) return 0; const start = new Date(startText + "T12:00:00"); if (start.getDate() === 1) return 0; if (start.getDate() === 15) return Math.round(quantity * unitPrice * 50) / 100; const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(); return Math.round(quantity * unitPrice * (days - start.getDate() + 1) / days * 100) / 100; };

const normalizeMidMonthInstallments = (contract: Contract) => {
  const startText = contract.displayStart || contract.signs[0]?.start || "";
  const start = startText ? new Date(startText + "T12:00:00") : null;
  const duration = contract.durationMonths || 0;
  const normal = contract.installments
    .filter((i) => i.kind === "installment")
    .sort((a, b) => a.due.localeCompare(b.due));
  if (!start || start.getDate() !== 15 || !normal.length || duration % 1 !== 0.5)
    return contract;

  const depositTotal = contract.installments
    .filter((i) => i.kind === "deposit")
    .reduce((sum, i) => sum + i.amount, 0);
  const total = contract.installments.reduce((sum, i) => sum + i.amount, 0);
  const remaining = Math.max(0, total - depositTotal);
  const fullMonth = total / duration;
  const halfMonth = Math.min(fullMonth * 0.5, remaining);
  const fullMonths = (remaining - halfMonth) / fullMonth;
  if (Math.abs(fullMonths - normal.length) > 0.01) return contract;
  const normalized = contract.installments.map((i) => {
    if (i.kind === "deposit") return i;
    const index = normal.findIndex((item) => item.id === i.id);
    const amount = index === 0
      ? fullMonth + halfMonth
      : index === normal.length - 1
        ? remaining - (fullMonth + halfMonth) - fullMonth * (normal.length - 2)
        : fullMonth;
    return { ...i, amount };
  });
  return {
    ...contract,
    installments: normalized,
  };
};

const installmentsForCompanyReport = (contract: Contract) => {
  const startText = contract.displayStart || contract.signs[0]?.start || "";
  const endText = contract.signs[0]?.end || "";
  const normal = contract.installments
    .filter((i) => i.kind === "installment")
    .sort((a, b) => a.due.localeCompare(b.due));
  if (!startText || !endText || !normal.length) return contract.installments;
  const start = new Date(startText + "T12:00:00");
  if (start.getDate() !== 15) return contract.installments;

  const firstDue = new Date(normal[0].due + "T12:00:00");
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
  const end = new Date(endText + "T12:00:00");
  const amounts = new Map<string, number>();
  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const value = agreementValueForMonth(contract, year, month);
    const beforeFirstDue =
      year < firstDue.getFullYear() ||
      (year === firstDue.getFullYear() && month <= firstDue.getMonth());
    const key = beforeFirstDue
      ? normal[0].due.slice(0, 7)
      : `${year}-${String(month + 1).padStart(2, "0")}`;
    amounts.set(key, (amounts.get(key) || 0) + value);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const rebuilt = [...amounts.entries()].map(([month, amount], index) => ({
    id: `${contract.id}-report-${month}`,
    label: normal[index]?.label || `القسط ${index + 1}`,
    due: normal[index]?.due || `${month}-01`,
    amount,
    kind: "installment" as const,
  }));
  const depositTotal = contract.installments
    .filter((i) => i.kind === "deposit")
    .reduce((sum, item) => sum + item.amount, 0);
  const adjustedAmounts = depositTotal
    ? splitRoundedInstallments(
        Math.max(0, rebuilt.reduce((sum, item) => sum + item.amount, 0) - depositTotal),
        rebuilt.length,
      )
    : rebuilt.map((item) => item.amount);
  return [
    ...contract.installments.filter((i) => i.kind === "deposit"),
    ...rebuilt.map((item, index) => ({ ...item, amount: adjustedAmounts[index] })),
  ];
};

type CompanyScheduleRow = Installment & {
  company: string;
  contractId: string;
  title: string;
  agreementType?: Contract["agreementType"];
};

const accountRowsForCompany = (companyContracts: Contract[]) => {
  const raw: CompanyScheduleRow[] = companyContracts.flatMap((contract) =>
    installmentsForCompanyReport(contract).map((installment) => ({
      ...installment,
      company: contract.company,
      contractId: contract.id,
      title: contract.title,
      agreementType: contract.agreementType,
    })),
  );
  const agreementDeposits = raw.filter(
    (row) => row.agreementType === "companyDeposit",
  );
  if (!agreementDeposits.length) return raw;

  const monthlyRows = raw.filter(
    (row) =>
      row.kind === "installment" &&
      (!row.agreementType || row.agreementType === "campaign"),
  );
  const months = [...new Set(monthlyRows.map((row) => row.due.slice(0, 7)))].sort();
  if (!months.length) return raw;
  const depositTotal = agreementDeposits.reduce((sum, row) => sum + row.amount, 0);
  const installmentTotal = monthlyRows.reduce((sum, row) => sum + row.amount, 0);
  const remainingForInstallments = Math.max(0, installmentTotal - depositTotal);
  const roundedAmounts = splitRoundedInstallments(remainingForInstallments, months.length);
  const monthTargets = new Map(
    months.map((month, index) => [
      month,
      roundedAmounts[index],
    ]),
  );

  return raw.map((row) => {
    if (!monthlyRows.some((item) => item.id === row.id)) return row;
    const month = row.due.slice(0, 7);
    const monthRows = monthlyRows.filter((item) => item.due.slice(0, 7) === month);
    const originalMonthTotal = monthRows.reduce((sum, item) => sum + item.amount, 0);
    return {
      ...row,
      amount: originalMonthTotal
        ? (row.amount / originalMonthTotal) * (monthTargets.get(month) || 0)
        : 0,
    };
  });
};

const seed: Contract[] = [
  {
    id: "demo",
    company: "شركة يونايتد",
    title: "إعلان حج",
    start: "2026-07-15",
    displayStart: "2026-08-01",
    quantity: 5,
    monthlyUnitPrice: 5000,
    durationMonths: 3,
    notes: "بيانات تجريبية — يمكن حذف الاتفاق والبدء ببياناتك.",
    signs: [
      {
        id: "s1",
        location: "شارع فؤاد",
        start: "2026-08-01",
        end: "2026-10-31",
        cost: 75000,
      },
    ],
    installments: [
      {
        id: "i1",
        label: "القسط الأول",
        due: "2026-08-01",
        amount: 25000,
        kind: "installment",
      },
      {
        id: "i2",
        label: "القسط الثاني",
        due: "2026-09-01",
        amount: 25000,
        kind: "installment",
      },
      {
        id: "i3",
        label: "القسط الثالث",
        due: "2026-10-01",
        amount: 25000,
        kind: "installment",
      },
    ],
    payments: [],
  },
];

function allocate(c: Contract) {
  let paid = c.payments.reduce((s, p) => s + p.amount, 0);
  return [...c.installments]
    .sort((a, b) => a.due.localeCompare(b.due))
    .map((i) => {
      const applied = Math.min(paid, i.amount);
      paid -= applied;
      const remaining = i.amount - applied;
      const overdue = remaining > 0 && i.due < today();
      return {
        ...i,
        applied,
        remaining,
        status:
          remaining === 0
            ? "مدفوع"
            : applied > 0
              ? "مدفوع جزئيًا"
              : overdue
                ? "متأخر"
                : "مستحق",
      };
    });
}

export default function Home() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<
    "dashboard" | "contracts" | "payments" | "reports" | "paidReports"
  >("dashboard");
  const [year, setYear] = useState(currentFiscalYear);
  const [modal, setModal] = useState<
    "newCompanyContract" | "agreement" | "companyDeposit" | "payment" | "editPayment" | null
  >(null);
  const [editingPayment, setEditingPayment] = useState<{
    company: string;
    payment: Payment;
  } | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [reportCompany, setReportCompany] = useState<string>("");
  const [companyPayments, setCompanyPayments] = useState<
    Record<string, Payment[]>
  >({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved =
      localStorage.getItem(KEY) ||
      localStorage.getItem("ad-expense-planner-v1");
    const loaded: Contract[] = (saved ? JSON.parse(saved) : seed).map(
      normalizeMidMonthInstallments,
    );
    const savedCompanyPayments = localStorage.getItem("ad-company-payments-v1");
    if (savedCompanyPayments)
      setCompanyPayments(JSON.parse(savedCompanyPayments));
    else {
      const migrated: Record<string, Payment[]> = {};
      loaded.forEach((c) =>
        c.payments.forEach((p) => {
          migrated[c.company] = [...(migrated[c.company] || []), p];
        }),
      );
      setCompanyPayments(migrated);
      loaded.forEach((c) => {
        c.payments = [];
      });
    }
    setContracts(loaded);
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify(contracts));
  }, [contracts, ready]);
  useEffect(() => {
    if (ready)
      localStorage.setItem(
        "ad-company-payments-v1",
        JSON.stringify(companyPayments),
      );
  }, [companyPayments, ready]);
  useEffect(() => {
    const update = (event: Event) => {
      const changed = (event as CustomEvent<Contract>).detail;
      setContracts((v) => v.map((c) => (c.id === changed.id ? changed : c)));
    };
    window.addEventListener("agreement-updated", update);
    return () => window.removeEventListener("agreement-updated", update);
  }, []);

  const allRows = useMemo(
    () =>
      [...new Set(contracts.map((c) => c.company))].flatMap((company) => {
        let paid = (companyPayments[company] || []).reduce(
          (s, p) => s + p.amount,
          0,
        );
        return accountRowsForCompany(contracts.filter((c) => c.company === company))
          .sort((a, b) => a.due.localeCompare(b.due))
          .map((i) => {
            const applied = Math.min(paid, i.amount);
            paid -= applied;
            const remaining = i.amount - applied;
            const overdue = remaining > 0 && i.due < today();
            return {
              ...i,
              applied,
              remaining,
              status:
                remaining === 0
                  ? "مدفوع"
                  : applied > 0
                    ? "مدفوع جزئيًا"
                    : overdue
                      ? "متأخر"
                      : "مستحق",
            };
          });
      }),
    [contracts, companyPayments],
  );
  const companies = useMemo(
    () =>
      [...new Set([...contracts.map((c) => c.company), ...Object.keys(companyPayments)])].sort((a, b) =>
        a.localeCompare(b, "ar"),
      ),
    [contracts, companyPayments],
  );
  const companyDueRows = useMemo(
    () => {
      const groups = new Map<string, typeof allRows>();
      allRows
        .filter((row) => row.remaining > 0)
        .forEach((row) => {
          const key = `${row.company}::${row.due.slice(0, 7)}`;
          groups.set(key, [...(groups.get(key) || []), row]);
        });
      return [...groups.entries()]
        .map(([key, rows]) => {
          const [company, monthKey] = key.split("::");
          const amount = rows.reduce((s, r) => s + r.amount, 0);
          const applied = rows.reduce((s, r) => s + r.applied, 0);
          const remaining = rows.reduce((s, r) => s + r.remaining, 0);
          const due = [...rows].sort((a, b) => a.due.localeCompare(b.due))[0]
            .due;
          const hasOverdue = rows.some((r) => r.due < today());
          return {
            id: `company-${company}-${monthKey}`,
            company,
            title: `${new Set(rows.map((r) => r.contractId)).size} اتفاق`,
            label: `قسط ${monthsAr[Number(monthKey.slice(5, 7)) - 1]} ${monthKey.slice(0, 4)} (${rows.length} بند)`,
            due,
            amount,
            applied,
            remaining,
            status: hasOverdue
              ? "متأخر"
              : applied > 0
                ? "مدفوع جزئيًا"
                : "مستحق",
          };
        })
        .sort((a, b) => a.due.localeCompare(b.due) || a.company.localeCompare(b.company, "ar"));
    },
    [companies, allRows],
  );
  const reportContracts = useMemo(
    () =>
      reportCompany
        ? contracts.filter((c) => c.company === reportCompany)
        : contracts,
    [contracts, reportCompany],
  );
  const reportRows = useMemo(
    () => allRows.filter((r) => !reportCompany || r.company === reportCompany),
    [allRows, reportCompany],
  );
  const reportMonthData = useMemo(
    () =>
      fiscalMonths(year).map(({ name, label, month, year: itemYear }) => {
        const rows = reportRows.filter(
          (r) =>
            Number(r.due.slice(0, 4)) === itemYear &&
            Number(r.due.slice(5, 7)) === month + 1,
        );
        return {
          name,
          label,
          month,
          year: itemYear,
          due: rows.reduce((s, r) => s + r.amount, 0),
          paid: rows.reduce((s, r) => s + r.applied, 0),
          remaining: rows.reduce((s, r) => s + r.remaining, 0),
        };
      }),
    [reportRows, year],
  );
  const timelineData = useMemo(() => fiscalMonths(year).map(({ name, month, year: itemYear }) => { const rows = allRows.filter(r => Number(r.due.slice(0, 4)) === itemYear && Number(r.due.slice(5, 7)) === month + 1); return { name, month, year: itemYear, due: rows.reduce((s, r) => s + r.amount, 0), paid: rows.reduce((s, r) => s + r.applied, 0), remaining: rows.reduce((s, r) => s + r.remaining, 0) }; }), [allRows, year]);
  const totalContracted = allRows.reduce((sum, row) => sum + row.amount, 0);
  const totalPaid = Object.values(companyPayments)
    .flat()
    .reduce((s, p) => s + p.amount, 0);
  const overdue = allRows
    .filter((r) => r.due < today())
    .reduce((s, r) => s + r.remaining, 0);
  const dueThisMonth = allRows.filter(r => Number(r.due.slice(0, 4)) === new Date().getFullYear() && Number(r.due.slice(5, 7)) === new Date().getMonth() + 1).reduce((s, r) => s + r.remaining, 0);

  function savePayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const company = String(fd.get("company"));
    const amount = Number(fd.get("amount"));
    if (!company || amount <= 0) return;
    setCompanyPayments((v) => ({
      ...v,
      [company]: [
        ...(v[company] || []),
        {
          id: uid(),
          date: String(fd.get("date")),
          amount,
          note: String(fd.get("note") || ""),
        },
      ],
    }));
    setModal(null);
  }
  function saveCompanyContractDeposit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const due = String(fd.get("date"));
    if (!selectedCompany || amount <= 0 || !due) return;
    const companyContracts = contracts.filter((c) => c.company === selectedCompany);
    const monthlyInstallments = companyContracts
      .filter((c) => !c.agreementType || c.agreementType === "campaign")
      .flatMap((c) => installmentsForCompanyReport(c))
      .filter((i) => i.kind === "installment");
    const existingDeposits = companyContracts
      .filter((c) => c.agreementType === "companyDeposit")
      .flatMap((c) => c.installments)
      .reduce((sum, item) => sum + item.amount, 0);
    const available = monthlyInstallments.reduce((sum, item) => sum + item.amount, 0) - existingDeposits;
    const firstInstallmentDue = [...monthlyInstallments]
      .sort((a, b) => a.due.localeCompare(b.due))[0]?.due;
    if (amount > available) {
      alert(`دفعة الاتفاق لا يمكن أن تتجاوز المتبقي المتاح للأقساط (${money(Math.max(0, available))}).`);
      return;
    }
    if (firstInstallmentDue && due > firstInstallmentDue) {
      alert("موعد دفعة الاتفاق يجب أن يسبق أول قسط شهري أو يوافقه.");
      return;
    }
    setContracts((current) => [
      ...current,
      {
        id: uid(),
        company: selectedCompany,
        title: "دفعة اتفاق على المشاع",
        start: today(),
        notes: String(fd.get("note") || "دفعة اتفاق على المشاع"),
        agreementType: "companyDeposit",
        signs: [],
        installments: [{
          id: uid(),
          label: "دفعة اتفاق",
          due,
          amount,
          kind: "deposit",
        }],
        payments: [],
      },
    ]);
    setModal(null);
  }
  function deletePayment(company: string, target: Payment) {
    if (!confirm("حذف دفعة السداد؟ سيتم إلغاء أثرها من جميع التقارير وجدول الأقساط."))
      return;
    setCompanyPayments((current) => {
      const remaining = (current[company] || []).filter(
        (payment) => payment.id !== target.id,
      );
      const next = { ...current };
      if (remaining.length) next[company] = remaining;
      else delete next[company];
      localStorage.setItem("ad-company-payments-v1", JSON.stringify(next));
      return next;
    });
  }
  function startEditingPayment(company: string, payment: Payment) {
    setEditingPayment({ company, payment });
    setModal("editPayment");
  }
  function savePaymentEdits(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingPayment) return;
    const fd = new FormData(e.currentTarget);
    const nextCompany = String(fd.get("company"));
    const amount = Number(fd.get("amount"));
    if (!nextCompany || amount <= 0) return;
    const updated: Payment = {
      ...editingPayment.payment,
      date: String(fd.get("date")),
      amount,
      note: String(fd.get("note") || ""),
    };
    setCompanyPayments((current) => {
      const next = { ...current };
      const sourcePayments = (next[editingPayment.company] || []).filter(
        (payment) => payment.id !== editingPayment.payment.id,
      );
      if (sourcePayments.length) next[editingPayment.company] = sourcePayments;
      else delete next[editingPayment.company];
      next[nextCompany] = [...(next[nextCompany] || []), updated];
      return next;
    });
    setEditingPayment(null);
    setModal(null);
  }
  function backup() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 2,
            exportedAt: new Date().toISOString(),
            contracts,
            companyPayments,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `نسخة-احتياطية-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function restore(f?: File) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(String(r.result));
        if (Array.isArray(d.contracts)) {
          setContracts(d.contracts);
          if (d.companyPayments) setCompanyPayments(d.companyPayments);
        } else alert("ملف غير صالح");
      } catch {
        alert("تعذر قراءة الملف");
      }
    };
    r.readAsText(f);
  }

  if (!ready) return <main className="loading">جارٍ تجهيز النظام…</main>;
  const nav = [
    { id: "dashboard", label: "لوحة المتابعة", icon: "◫" },
    { id: "contracts", label: "الشركات والاتفاقات", icon: "▤" },
    { id: "payments", label: "المدفوعات", icon: "◉" },
    { id: "reports", label: "التقارير السنوية", icon: "▦" },
    { id: "paidReports", label: "المصروفات المسددة", icon: "▣" },
  ] as const;

  return (
    <div className="app" dir="rtl">
      <aside className="sidebar print-hide">
        <div className="brand">
          <span className="brandmark">م</span>
          <div>
            <span className="org-name">مجموعة شركات آثار للسياحة</span>
            <strong>مخطط المصروف</strong>
            <small>الدعاية والإعلانات</small>
          </div>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => setView(n.id)}
            >
              <span>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="side-actions">
          <button onClick={backup}>↓ نسخ احتياطي</button>
          <button onClick={() => fileRef.current?.click()}>
            ↑ استعادة البيانات
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => restore(e.target.files?.[0])}
          />
          <small>البيانات محفوظة على هذا الجهاز</small>
        </div>
      </aside>
      <main className="main">
        <header className="topbar print-hide">
          <div>
            <span className="org-eyebrow">مجموعة شركات آثار للسياحة</span>
            <h1>{nav.find((n) => n.id === view)?.label}</h1>
            <p>نظرة واضحة على التزامات شركات الدعاية والسداد</p>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={() => setModal("payment")}>
              تسجيل دفعة
            </button>
            <button className="primary" onClick={() => setModal("newCompanyContract")}>
              ＋ عقد جديد
            </button>
          </div>
        </header>

        {view === "dashboard" && (
          <>
            <section className="stats">
              <article>
                <span className="stat-icon green">✓</span>
                <div>
                  <small>إجمالي المدفوع</small>
                  <b>{money(totalPaid)}</b>
                  <em>من {money(totalContracted)}</em>
                </div>
              </article>
              <article>
                <span className="stat-icon blue">◷</span>
                <div>
                  <small>المطلوب هذا الشهر</small>
                  <b>{money(dueThisMonth)}</b>
                  <em>{monthsAr[new Date().getMonth()]}</em>
                </div>
              </article>
              <article>
                <span className="stat-icon red">!</span>
                <div>
                  <small>إجمالي المتأخرات</small>
                  <b>{money(overdue)}</b>
                  <em>
                    {
                      allRows.filter(
                        (r) =>
                          r.status === "متأخر" ||
                          (r.due < today() && r.remaining),
                      ).length
                    }{" "}
                    قسط
                  </em>
                </div>
              </article>
              <article>
                <span className="stat-icon gold">▤</span>
                <div>
                  <small>العقود النشطة</small>
                  <b>{contracts.length}</b>
                  <em>
                    {contracts.reduce((s, c) => s + c.signs.length, 0)} يافطة
                  </em>
                </div>
              </article>
            </section>
            <section className="panel timeline">
              <div className="panel-head">
                <div>
                  <h2>الخريطة الزمنية للسداد</h2>
                  <p>من يوليو {year} حتى يونيو {year + 1}</p>
                </div>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {[year - 1, year, year + 1].map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="months">
                {timelineData.map((m) => (
                  <article
                    className={
                      m.month === new Date().getMonth() &&
                      m.year === new Date().getFullYear()
                        ? "current"
                        : ""
                    }
                    key={`${m.year}-${m.month}`}
                  >
                    <div className="month-name">{m.name} <small>{m.year}</small></div>
                    <small>المتبقي</small>
                    <b>{money(m.remaining)}</b>
                    <div className="bar">
                      <i
                        style={{
                          width: `${m.due ? (m.paid / m.due) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <small>
                      {m.due
                        ? `أصل ${money(m.due)} · مدفوع ${money(m.paid)}`
                        : "لا توجد التزامات"}
                    </small>
                  </article>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>الاستحقاقات القريبة</h2>
                  <p>مرتبة من الأقدم إلى الأحدث</p>
                </div>
                <button
                  className="text-btn"
                  onClick={() => setView("payments")}
                >
                  عرض الكل ←
                </button>
              </div>
              <DueTable
                rows={companyDueRows.filter(
                  (row) =>
                    row.due.slice(0, 7) ===
                    companyDueRows[0]?.due.slice(0, 7),
                ) as any[]}
              />
            </section>
          </>
        )}

        {view === "contracts" && (
          <section className="content-stack">
            <div className="section-title">
              <div>
                <h2>{selectedCompany || "شركات الدعاية والإعلان"}</h2>
                <p>
                  {selectedCompany
                    ? `${contracts.filter((c) => c.company === selectedCompany).length} اتفاق مسجل`
                    : `${companies.length} شركة نتعامل معها`}
                </p>
              </div>
              <div className="header-actions print-hide">
                {selectedCompany && (
                  <button
                    className="secondary"
                    onClick={() => setModal("companyDeposit")}
                  >
                    ＋ دفعة تعاقد على المشاع
                  </button>
                )}
                <button
                  className="primary"
                  onClick={() =>
                    setModal(selectedCompany ? "agreement" : "newCompanyContract")
                  }
                >
                  ＋ {selectedCompany ? "اتفاق جديد" : "عقد جديد"}
                </button>
              </div>
            </div>
            {!selectedCompany ? (
              <div className="companies-grid">
                {companies.map((company) => {
                  const list = contracts.filter((c) => c.company === company);
                  const total = accountRowsForCompany(list).reduce(
                    (sum, row) => sum + row.amount,
                    0,
                  );
                  const paid = (companyPayments[company] || []).reduce(
                    (s, p) => s + p.amount,
                    0,
                  );
                  return (
                    <button
                      className="company-card"
                      key={company}
                      onClick={() => setSelectedCompany(company)}
                    >
                      <span className="company-dot">{company.slice(0, 1)}</span>
                      <div>
                        <h3>{company}</h3>
                        <p>
                          {list.length} اتفاق ·{" "}
                          {list.reduce(
                            (s, c) => s + (c.quantity || c.signs.length),
                            0,
                          )}{" "}
                          يافطة
                        </p>
                      </div>
                      <div className="company-money">
                        <small>إجمالي التعامل</small>
                        <b>{money(total)}</b>
                        <em>متبقي {money(total - paid)}</em>
                      </div>
                      <strong className="arrow">←</strong>
                    </button>
                  );
                })}
                {companies.length === 0 && (
                  <div className="empty-state">
                    لا توجد شركات مسجلة. أضف أول اتفاق للبدء.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="company-tools print-hide">
                  <button
                    className="secondary"
                    onClick={() => setSelectedCompany("")}
                  >
                    → كل الشركات
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setReportCompany(selectedCompany);
                      setView("reports");
                    }}
                  >
                    تقرير الشركة
                  </button>
                </div>
                {contracts
                  .filter((c) => c.company === selectedCompany)
                  .map((c) => (
                    <AgreementCard
                      key={c.id}
                      contract={c}
                      companyContracts={contracts.filter(
                        (item) => item.company === selectedCompany,
                      )}
                      onDelete={() => {
                        if (!confirm("حذف هذا الاتفاق؟")) return;
                        setContracts((v) => v.filter((x) => x.id !== c.id));
                      }}
                    />
                  ))}
              </>
            )}
          </section>
        )}

        {view === "payments" && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>جدول الأقساط والمدفوعات</h2>
                <p>يُوزّع كل سداد على أقدم استحقاق تلقائيًا</p>
              </div>
              <button className="primary" onClick={() => setModal("payment")}>
                ＋ تسجيل دفعة
              </button>
            </div>
            <DueTable rows={allRows} />
            <PaymentHistory
              payments={companyPayments}
            />
          </section>
        )}

        {view === "reports" && (
          <section className="report">
            <div className="section-title print-hide">
              <div>
                <h2>
                  {reportCompany
                    ? `تقرير شركة ${reportCompany}`
                    : "التقرير السنوي العام"}
                </h2>
                <p>الاستحقاقات والمدفوعات موزعة على شهور السنة</p>
              </div>
              <div>
                <select
                  value={reportCompany}
                  onChange={(e) => setReportCompany(e.target.value)}
                >
                  <option value="">كل الشركات</option>
                  {companies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {[year - 1, year, year + 1].map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
                <button className="primary" onClick={() => window.print()}>
                  طباعة / حفظ PDF
                </button>
              </div>
            </div>
            <div className="print-title">
              <h1>
                {reportCompany
                  ? `تقرير شركة ${reportCompany}`
                  : "تقرير مصروف الدعاية والإعلانات"}
              </h1>
              <p>
                السنة المالية يوليو {year} — يونيو {year + 1} · تاريخ التقرير {today()}
              </p>
            </div>
            <CompanySummaryReport
              companies={reportCompany ? [reportCompany] : companies}
              contracts={contracts}
              payments={companyPayments}
            />
            <CompanyInstallmentDistribution
              companies={reportCompany ? [reportCompany] : companies}
              contracts={contracts}
              year={year}
            />
            {reportCompany && (
              <div className="panel report-table">
                <div className="panel-head">
                  <div>
                    <h2>أصل الاتفاق حسب شهور العرض</h2>
                    <p>
                      قيمة العرض الشهرية قبل النظر إلى مواعيد الأقساط والسداد
                    </p>
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>الاتفاق</th>
                      {fiscalMonths(year).map((m) => (
                        <th key={m.label}>{m.label}</th>
                      ))}
                      <th>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportContracts.map((c) => {
                      const vals = fiscalMonths(year).map((m) =>
                        agreementValueForMonth(c, m.year, m.month),
                      );
                      return (
                        <tr key={`origin-${c.id}`}>
                          <td>
                            <b>{c.title}</b>
                            <small>
                              {c.signs[0]?.location} · {c.quantity || 1} يافطة ×{" "}
                              {money(c.monthlyUnitPrice || 0)}
                            </small>
                          </td>
                          {vals.map((v, i) => (
                            <td key={i}>
                              {v
                                ? new Intl.NumberFormat("ar-EG", {
                                    maximumFractionDigits: 0,
                                  }).format(v)
                                : "—"}
                            </td>
                          ))}
                          <td>
                            <b>
                              {new Intl.NumberFormat("ar-EG", {
                                maximumFractionDigits: 0,
                              }).format(vals.reduce((s, v) => s + v, 0))}
                            </b>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="total-row">
                      <td>أصل المستحق لكل شهر</td>
                      {fiscalMonths(year).map((m) => {
                        const total = reportContracts.reduce(
                          (s, c) => s + agreementValueForMonth(c, m.year, m.month),
                          0,
                        );
                        return (
                          <td key={m.label}>
                            {total
                              ? new Intl.NumberFormat("ar-EG", {
                                  maximumFractionDigits: 0,
                                }).format(total)
                              : "—"}
                          </td>
                        );
                      })}
                      <td>
                        {new Intl.NumberFormat("ar-EG", {
                          maximumFractionDigits: 0,
                        }).format(
                          reportContracts.reduce(
                            (sum, c) =>
                              sum +
                              fiscalMonths(year).reduce(
                                (s, m) =>
                                  s + agreementValueForMonth(c, m.year, m.month),
                                0,
                              ),
                            0,
                          ),
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <div className="panel-head report-section-label">
              <div>
                <h2>جدول الأقساط المتبقية بعد السداد</h2>
                <p>المبالغ المتبقية بعد توزيع دفعات الشركة على أقدم الأقساط</p>
              </div>
            </div>
            <div className="panel report-table">
              <table>
                <thead>
                  <tr>
                    <th>{reportCompany ? "الاتفاق" : "الشركة / الاتفاق"}</th>
                    {fiscalMonths(year).map((m) => (
                      <th key={m.label}>{m.label}</th>
                    ))}
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {reportContracts.map((c) => {
                    const rows = allRows.filter((row) => row.contractId === c.id);
                    const vals = fiscalMonths(year).map((m) =>
                      rows
                        .filter(
                          (r) =>
                            Number(r.due.slice(0, 4)) === m.year &&
                            Number(r.due.slice(5, 7)) === m.month + 1,
                        )
                        .reduce((s, r) => s + r.remaining, 0),
                    );
                    return (
                      <tr key={c.id}>
                        <td>
                          <b>{c.title}</b>
                          <small>
                            {c.company} · {c.signs[0]?.location}
                          </small>
                        </td>
                        {vals.map((v, i) => (
                          <td key={i}>
                            {v ? new Intl.NumberFormat("ar-EG").format(v) : "—"}
                          </td>
                        ))}
                        <td>
                          <b>
                            {new Intl.NumberFormat("ar-EG").format(
                              vals.reduce((s, v) => s + v, 0),
                            )}
                          </b>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="total-row">
                    <td>إجمالي الشهر</td>
                    {reportMonthData.map((m) => (
                      <td key={m.label}>
                        {m.remaining
                          ? new Intl.NumberFormat("ar-EG").format(m.remaining)
                          : "—"}
                      </td>
                    ))}
                    <td>
                      {new Intl.NumberFormat("ar-EG").format(
                        reportMonthData.reduce((s, m) => s + m.remaining, 0),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="report-summary">
              <span>
                إجمالي السنة{" "}
                <b>{money(reportMonthData.reduce((s, m) => s + m.due, 0))}</b>
              </span>
              <span>
                المدفوع{" "}
                <b>{money(reportMonthData.reduce((s, m) => s + m.paid, 0))}</b>
              </span>
              <span>
                المتبقي{" "}
                <b>
                  {money(reportMonthData.reduce((s, m) => s + m.remaining, 0))}
                </b>
              </span>
            </div>
          </section>
        )}

        {view === "paidReports" && (
          <section className="report">
            <div className="section-title print-hide">
              <div>
                <h2>
                  {reportCompany
                    ? `المصروفات المسددة لشركة ${reportCompany}`
                    : "المصروفات المسددة لكل شركات الإعلانات"}
                </h2>
                <p>دفعات السداد العامة غير المخصصة لحملة إعلانية معينة</p>
              </div>
              <div>
                <select
                  value={reportCompany}
                  onChange={(e) => setReportCompany(e.target.value)}
                >
                  <option value="">كل الشركات</option>
                  {companies.map((company) => (
                    <option key={company}>{company}</option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {[year - 1, year, year + 1].map((itemYear) => (
                    <option key={itemYear}>{itemYear}</option>
                  ))}
                </select>
                <button className="primary" onClick={() => window.print()}>
                  طباعة / حفظ PDF
                </button>
              </div>
            </div>
            <div className="print-title">
              <h1>
                {reportCompany
                  ? `المصروفات المسددة لشركة ${reportCompany}`
                  : "المصروفات المسددة لكل شركات الإعلانات"}
              </h1>
              <p>السنة المالية يوليو {year} — يونيو {year + 1} · تاريخ التقرير {today()}</p>
            </div>
            <PaymentsReport
              companies={reportCompany ? [reportCompany] : companies}
              payments={companyPayments}
              year={year}
              selectedCompany={reportCompany}
              onEdit={startEditingPayment}
              onDelete={deletePayment}
            />
          </section>
        )}
      </main>

      {(modal === "newCompanyContract" || modal === "agreement") && (
        <Modal
          title={
            modal === "agreement" && selectedCompany
              ? `اتفاق جديد — ${selectedCompany}`
              : "عقد جديد مع شركة جديدة"
          }
          close={() => setModal(null)}
        >
          <AgreementForm
            defaultCompany={modal === "newCompanyContract" ? "" : selectedCompany}
            onSave={(c) => {
              setContracts((v) => [...v, c]);
              setSelectedCompany(c.company);
              setModal(null);
            }}
          />
        </Modal>
      )}

      {modal === "companyDeposit" && selectedCompany && (
        <Modal
          title={`تسجيل دفعة تعاقد — ${selectedCompany}`}
          close={() => setModal(null)}
        >
          <form className="form" onSubmit={saveCompanyContractDeposit}>
            <div className="balance-box">
              قيد استحقاق غير مسدد يُخصم من إجمالي المتبقي، ثم يوزع النظام الباقي بالتساوي على أشهر الأقساط المسجلة. في شهر استحقاقها تُضاف دفعة الاتفاق إلى قسط الشهر.
            </div>
            <div className="form-grid">
              <label>
                قيمة دفعة التعاقد
                <input name="amount" type="number" min="1" step="0.01" required />
              </label>
              <label>
                تاريخ الاستحقاق
                <input name="date" type="date" defaultValue={today()} required />
              </label>
              <label className="wide">
                البيان / الملاحظات
                <input name="note" defaultValue="دفعة تعاقد على المشاع" />
              </label>
            </div>
            <button className="primary submit">تسجيل الاستحقاق وإعادة حساب الأقساط</button>
          </form>
        </Modal>
      )}

      {modal === "editPayment" && editingPayment && (
        <Modal
          title="تعديل دفعة السداد"
          close={() => {
            setEditingPayment(null);
            setModal(null);
          }}
        >
          <form className="form" onSubmit={savePaymentEdits}>
            <div className="form-grid">
              <label>
                شركة الإعلانات
                <select name="company" defaultValue={editingPayment.company} required>
                  {companies.map((company) => (
                    <option key={company} value={company}>{company}</option>
                  ))}
                </select>
              </label>
              <label>
                تاريخ السداد
                <input name="date" type="date" defaultValue={editingPayment.payment.date} required />
              </label>
              <label>
                مبلغ الدفعة
                <input name="amount" type="number" min="1" step="0.01" defaultValue={editingPayment.payment.amount} required />
              </label>
              <label className="wide">
                البيان / الملاحظة
                <textarea name="note" rows={3} defaultValue={editingPayment.payment.note} placeholder="مثال: دفعة سداد" />
              </label>
            </div>
            <button className="primary submit" type="submit">حفظ التعديلات</button>
          </form>
        </Modal>
      )}
      {modal === "payment" && (
        <Modal title="تسجيل دفعة جديدة" close={() => setModal(null)}>
          <form onSubmit={savePayment} className="form">
            <label>
              شركة الإعلانات
              <select
                name="company"
                required
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">اختر شركة الإعلانات</option>
                {companies.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <div className="balance-box">
                الرصيد المتبقي:{" "}
                <b>
                  {money(
                    Math.max(
                      0,
                      allRows
                        .filter((row) => row.company === selected)
                        .reduce((sum, row) => sum + row.amount, 0) -
                        (companyPayments[selected] || []).reduce(
                          (s, p) => s + p.amount,
                          0,
                        ),
                    ),
                  )}
                </b>
              </div>
            )}
            <div className="form-grid">
              <label>
                قيمة الدفعة
                <input name="amount" type="number" min="1" required />
              </label>
              <label>
                تاريخ السداد
                <input
                  name="date"
                  type="date"
                  defaultValue={today()}
                  required
                />
              </label>
              <label className="wide">
                بيان / ملاحظة
                <input name="note" placeholder="مثال: تحويل بنكي" />
              </label>
            </div>
            <button className="primary submit">تسجيل السداد</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function DueTable({
  rows,
}: {
  rows: ReturnType<typeof allocate>[number][] & any[];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>الشركة</th>
            <th>البيان</th>
            <th>تاريخ الاستحقاق</th>
            <th>قيمة القسط</th>
            <th>المسدّد</th>
            <th>المتبقي</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.company}</b>
                  <small>{r.title}</small>
                </td>
                <td>{r.label}</td>
                <td>{r.due}</td>
                <td>{money(r.amount)}</td>
                <td>{money(r.applied)}</td>
                <td>{money(r.remaining)}</td>
                <td>
                  <span
                    className={`badge ${r.status === "مدفوع" ? "ok" : r.status === "متأخر" ? "late" : r.status === "مدفوع جزئيًا" ? "partial" : "due"}`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="empty">
                لا توجد استحقاقات مسجلة
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="total-row">
              <td colSpan={3}>إجمالي الاستحقاقات الظاهرة</td>
              <td>{money(rows.reduce((sum, row) => sum + row.amount, 0))}</td>
              <td>{money(rows.reduce((sum, row) => sum + row.applied, 0))}</td>
              <td>{money(rows.reduce((sum, row) => sum + row.remaining, 0))}</td>
              <td>—</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function PaymentHistory({
  payments,
}: {
  payments: Record<string, Payment[]>;
}) {
  const rows = Object.entries(payments)
    .flatMap(([company, items]) =>
      items.map((payment) => ({ ...payment, company })),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="payment-history">
      <div className="subhead">
        <b>دفعات السداد المسجلة</b>
        <small>للتعديل أو الحذف استخدم تبويب المصروفات المسددة</small>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الشركة</th>
              <th>تاريخ السداد</th>
              <th>المبلغ</th>
              <th>البيان</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((payment) => (
                <tr key={`${payment.company}-${payment.id}`}>
                  <td><b>{payment.company}</b></td>
                  <td>{payment.date}</td>
                  <td>{money(payment.amount)}</td>
                  <td>{payment.note || "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>لا توجد دفعات سداد مسجلة.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={close}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ContractForm({ onSave }: { onSave: (c: Contract) => void }) {
  const blankSign = (): Sign => ({
    id: uid(),
    location: "",
    start: today(),
    end: "",
    cost: 0,
  });
  const blankInst = (): Installment => ({
    id: uid(),
    label: "قسط",
    due: today(),
    amount: 0,
    kind: "installment",
  });
  const [signs, setSigns] = useState<Sign[]>([blankSign()]);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [manual, setManual] = useState<Installment[]>([blankInst()]);
  const total = signs.reduce((s, x) => s + Number(x.cost || 0), 0);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const start = String(fd.get("start"));
    const deposit = Number(fd.get("deposit") || 0);
    const depositDate = String(fd.get("depositDate") || start);
    let installments: Installment[] = [];
    const limit = new Date(start + "T12:00:00");
    limit.setFullYear(limit.getFullYear() + 1);
    if (
      signs.some(
        (s) => new Date(s.end + "T12:00:00") > limit || s.end < s.start,
      )
    ) {
      alert(
        "مدة اليافطة يجب ألا تتجاوز 12 شهرًا من تاريخ التعاقد، وأن يكون تاريخ النهاية بعد البداية.",
      );
      return;
    }
    if (deposit > 0)
      installments.push({
        id: uid(),
        label: "دفعة التعاقد",
        due: depositDate,
        amount: deposit,
        kind: "deposit",
      });
    if (mode === "manual")
      installments.push(...manual.filter((i) => i.amount > 0 && i.due));
    else {
      const count = Math.max(1, Number(fd.get("count") || 1));
      const firstDue = String(fd.get("firstDue") || start);
      const remaining = Math.max(0, total - deposit);
      const each = remaining / count;
      for (let x = 0; x < count; x++) {
        const d = new Date(firstDue + "T12:00:00");
        d.setMonth(d.getMonth() + x);
        installments.push({
          id: uid(),
          label: `القسط ${x + 1}`,
          due: d.toISOString().slice(0, 10),
          amount: x === count - 1 ? remaining - each * (count - 1) : each,
          kind: "installment",
        });
      }
    }
    if (!validateDepositSchedule(deposit, total, depositDate, installments)) return;
    if (installments.some((i) => new Date(i.due + "T12:00:00") > limit)) {
      alert("موعد أي دفعة يجب ألا يتجاوز 12 شهرًا من تاريخ التعاقد.");
      return;
    }
    const scheduled = installments.reduce((s, i) => s + Number(i.amount), 0);
    if (Math.abs(scheduled - total) > 0.01) {
      alert(
        `إجمالي الدفعات (${money(scheduled)}) لا يساوي قيمة اليافطات (${money(total)}).`,
      );
      return;
    }
    onSave({
      id: uid(),
      company: String(fd.get("company")),
      title: String(fd.get("title")),
      start,
      notes: String(fd.get("notes") || ""),
      signs,
      installments,
      payments: [],
    });
  }
  return (
    <form onSubmit={submit} className="form">
      <div className="form-grid">
        <label>
          شركة الإعلان
          <input name="company" required />
        </label>
        <label>
          اسم العقد / الحملة
          <input name="title" required />
        </label>
        <label>
          تاريخ التعاقد
          <input name="start" type="date" required defaultValue={today()} />
        </label>
        <label>
          ملاحظات
          <input name="notes" />
        </label>
      </div>
      <div className="subhead">
        <b>اليافطات داخل العقد</b>
        <button
          type="button"
          className="text-btn"
          onClick={() => setSigns((v) => [...v, blankSign()])}
        >
          ＋ إضافة يافطة
        </button>
      </div>
      {signs.map((s) => (
        <div className="row-editor signs-editor" key={s.id}>
          <label>
            الموقع
            <input
              required
              value={s.location}
              onChange={(e) =>
                setSigns((v) =>
                  v.map((x) =>
                    x.id === s.id ? { ...x, location: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            من
            <input
              type="date"
              required
              value={s.start}
              onChange={(e) =>
                setSigns((v) =>
                  v.map((x) =>
                    x.id === s.id ? { ...x, start: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            إلى
            <input
              type="date"
              required
              value={s.end}
              onChange={(e) =>
                setSigns((v) =>
                  v.map((x) =>
                    x.id === s.id ? { ...x, end: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            التكلفة
            <input
              type="number"
              min="1"
              required
              value={s.cost || ""}
              onChange={(e) =>
                setSigns((v) =>
                  v.map((x) =>
                    x.id === s.id ? { ...x, cost: Number(e.target.value) } : x,
                  ),
                )
              }
            />
          </label>
          {signs.length > 1 && (
            <button
              type="button"
              className="remove"
              onClick={() => setSigns((v) => v.filter((x) => x.id !== s.id))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <div className="total-box">
        إجمالي قيمة اليافطات <b>{money(total)}</b>
      </div>
      <div className="form-grid">
        <label>
          دفعة التعاقد
          <input name="deposit" type="number" min="0" defaultValue="0" />
        </label>
        <label>
          تاريخ دفعة التعاقد
          <input name="depositDate" type="date" defaultValue={today()} />
        </label>
      </div>
      <p className="form-hint">تُسجل دفعة التعاقد كاستحقاق مستقل بأولوية السداد، وتُوزع الأقساط على المبلغ المتبقي بعدها.</p>
      <div className="tabs">
        <button
          type="button"
          className={mode === "auto" ? "active" : ""}
          onClick={() => setMode("auto")}
        >
          توزيع تلقائي
        </button>
        <button
          type="button"
          className={mode === "manual" ? "active" : ""}
          onClick={() => setMode("manual")}
        >
          إدخال يدوي
        </button>
      </div>
      {mode === "auto" ? (
        <div className="form-grid">
          <label>
            عدد الأقساط الباقية
            <input
              name="count"
              type="number"
              min="1"
              max="12"
              defaultValue="1"
            />
          </label>
          <label>
            تاريخ أول قسط
            <input name="firstDue" type="date" defaultValue={today()} />
          </label>
        </div>
      ) : (
        <>
          {manual.map((i) => (
            <div className="row-editor installment-editor" key={i.id}>
              <label>
                البيان
                <input
                  value={i.label}
                  onChange={(e) =>
                    setManual((v) =>
                      v.map((x) =>
                        x.id === i.id ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                التاريخ
                <input
                  type="date"
                  required
                  value={i.due}
                  onChange={(e) =>
                    setManual((v) =>
                      v.map((x) =>
                        x.id === i.id ? { ...x, due: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                المبلغ
                <input
                  type="number"
                  min="1"
                  required
                  value={i.amount || ""}
                  onChange={(e) =>
                    setManual((v) =>
                      v.map((x) =>
                        x.id === i.id
                          ? { ...x, amount: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              {manual.length > 1 && (
                <button
                  type="button"
                  className="remove"
                  onClick={() =>
                    setManual((v) => v.filter((x) => x.id !== i.id))
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-btn add-row"
            onClick={() => setManual((v) => [...v, blankInst()])}
          >
            ＋ إضافة قسط
          </button>
        </>
      )}
      <button className="primary submit">حفظ العقد وإنشاء جدول السداد</button>
    </form>
  );
}

function AgreementCard({
  contract: c,
  companyContracts,
  onDelete,
}: {
  contract: Contract;
  companyContracts: Contract[];
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState<
    "period" | "firstDue" | "installmentCount" | "contractDeposit" | "depositDue" | "quantity" | null
  >(null);
  const total = c.installments.reduce((s, i) => s + i.amount, 0);
  const companyPaymentStore: Record<string, Payment[]> =
    typeof window === "undefined"
      ? {}
      : JSON.parse(localStorage.getItem("ad-company-payments-v1") || "{}");
  const paid = (companyPaymentStore[c.company] || []).reduce(
    (s, p) => s + p.amount,
    0,
  );
  const sign = c.signs[0];
  const isPrinting = c.agreementType === "printing";
  const isCompanyDeposit = c.agreementType === "companyDeposit";
  const isGeneralObligation = isPrinting || isCompanyDeposit;
  return (
    <article className="contract-card">
      <div className="contract-top">
        <div>
          <span className="company-dot">{c.title.slice(0, 1)}</span>
          <div>
            <h3>{c.title}</h3>
            <p>
              {isGeneralObligation
                ? `${isCompanyDeposit ? "دفعة تعاقد على المشاع" : "التزام طباعة"} · الاستحقاق ${c.installments[0]?.due || c.start}`
                : `${sign?.location} · الاتفاق ${c.start} · العرض ${c.displayStart || sign?.start}`}
            </p>
          </div>
        </div>
        <div className="card-actions">
          {!isGeneralObligation && (
            <>
              <button className="text-btn" onClick={() => setEditing("period")}>
                تعديل فترة العرض
              </button>
              <button className="text-btn" onClick={() => setEditing("firstDue")}>
                تعديل أول قسط
              </button>
              <button className="text-btn" onClick={() => setEditing("installmentCount")}>
                تعديل عدد الأقساط
              </button>
              <button className="text-btn" onClick={() => setEditing("contractDeposit")}>
                دفعة تعاقد للإعلان
              </button>
              <button className="text-btn" onClick={() => setEditing("quantity")}>
                تعديل العدد والسعر
              </button>
            </>
          )}
          {isCompanyDeposit && (
            <button className="text-btn" onClick={() => setEditing("depositDue")}>
              تعديل تاريخ الاستحقاق
            </button>
          )}
          <button className="danger-link" onClick={onDelete}>
            حذف الاتفاق
          </button>
        </div>
      </div>
      {isGeneralObligation ? (
        <div className="agreement-formula">
          <span className="formula-total">
            <small>{isCompanyDeposit ? "قيمة دفعة التعاقد العامة" : "قيمة التزام عقد الطباعة"}</small>
            <b>{money(total)}</b>
          </span>
          <span>
            <small>تاريخ الاستحقاق</small>
            <b>{c.installments[0]?.due || c.start}</b>
          </span>
        </div>
      ) : <div className="agreement-formula">
        <span>
          <small>عدد اليافطات</small>
          <b>{c.quantity || c.signs.length}</b>
        </span>
        <i>×</i>
        <span>
          <small>سعر الشهر لليافطة</small>
          <b>{money(c.monthlyUnitPrice || sign?.cost || 0)}</b>
        </span>
        <i>×</i>
        <span>
          <small>مدة العرض</small>
          <b>{c.durationMonths || 1} شهر</b>
        </span>
        <i>=</i>
        <span className="formula-total">
          <small>إجمالي الاتفاق</small>
          <b>{money(total)}</b>
        </span>
      </div>}
      {!isGeneralObligation && <div className="contract-grid">
        <div>
          <small>فترة العرض</small>
          <b>
            {c.displayStart || sign?.start} — {sign?.end}
          </b>
        </div>
        <div>
          <small>إجمالي المدفوع للشركة</small>
          <b>{money(paid)}</b>
        </div>
        <div>
          <small>قيمة هذا الاتفاق</small>
          <b>{money(total)}</b>
        </div>
        <div>
          <small>عدد الأقساط</small>
          <b>{c.installments.filter((i) => i.kind === "installment").length}</b>
        </div>
      </div>}
      {c.notes && <p className="note">{c.notes}</p>}
      {editing === "period" && (
        <Modal title="تعديل فترة العرض" close={() => setEditing(null)}>
          <PeriodEditForm
            contract={c}
            onSave={(updated) => {
              window.dispatchEvent(
                new CustomEvent("agreement-updated", { detail: updated }),
              );
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {editing === "firstDue" && (
        <Modal title="تعديل موعد أول قسط" close={() => setEditing(null)}>
          <FirstDueEditForm
            contract={c}
            onSave={(updated) => {
              window.dispatchEvent(
                new CustomEvent("agreement-updated", { detail: updated }),
              );
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {editing === "quantity" && (
        <Modal
          title="تعديل عدد اليافطات وسعر الشهر"
          close={() => setEditing(null)}
        >
          <QuantityEditForm
            contract={c}
            onSave={(updated) => {
              window.dispatchEvent(
                new CustomEvent("agreement-updated", { detail: updated }),
              );
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {editing === "installmentCount" && (
        <Modal title="تعديل عدد أقساط الإعلان" close={() => setEditing(null)}>
          <InstallmentCountEditForm
            contract={c}
            onSave={(updated) => {
              window.dispatchEvent(
                new CustomEvent("agreement-updated", { detail: updated }),
              );
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {editing === "contractDeposit" && (
        <Modal title={`دفعة تعاقد — ${c.title}`} close={() => setEditing(null)}>
          <ContractDepositEditForm
            contract={c}
            onSave={(updated) => {
              window.dispatchEvent(
                new CustomEvent("agreement-updated", { detail: updated }),
              );
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {editing === "depositDue" && isCompanyDeposit && (
        <Modal title="تعديل موعد دفعة التعاقد" close={() => setEditing(null)}>
          <CompanyDepositDueEditForm
            contract={c}
            companyContracts={companyContracts}
            onSave={(updated) => {
              window.dispatchEvent(
                new CustomEvent("agreement-updated", { detail: updated }),
              );
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </article>
  );
}

function AgreementForm({
  defaultCompany,
  onSave,
}: {
  defaultCompany: string;
  onSave: (c: Contract) => void;
}) {
  const blankInst = (): Installment => ({
    id: uid(),
    label: "قسط",
    due: today(),
    amount: 0,
    kind: "installment",
  });
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [displayStart, setDisplayStart] = useState(today());
  const [displayEnd, setDisplayEnd] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [manual, setManual] = useState<Installment[]>([blankInst()]);
  const [agreementType, setAgreementType] = useState<"campaign" | "printing">("campaign");
  const billingMonths = (start: string, end: string) => {
    if (!start || !end || end < start) return 0;
    const a = new Date(start + "T12:00:00");
    const b = new Date(end + "T12:00:00");
    const days = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    let value = 0;
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())
      value = a.getDate() === 15 ? 0.5 : (b.getDate() - a.getDate() + 1) / days(a.getFullYear(), a.getMonth());
    else {
      value = (a.getDate() === 15 ? 0.5 : (days(a.getFullYear(), a.getMonth()) - a.getDate() + 1) / days(a.getFullYear(), a.getMonth())) + b.getDate() / days(b.getFullYear(), b.getMonth());
      const cursor = new Date(a.getFullYear(), a.getMonth() + 1, 1);
      const last = new Date(b.getFullYear(), b.getMonth(), 1);
      while (cursor < last) {
        value++;
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return Math.round(value * 10) / 10;
  };
  const months = billingMonths(displayStart, displayEnd);
  const total = quantity * unitPrice * months;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (agreementType === "printing") {
      const amount = Number(fd.get("printingAmount") || 0);
      if (amount <= 0) return;
      const created = today();
      onSave({
        id: uid(),
        company: defaultCompany,
        title: "عقد طباعة",
        start: created,
        notes: String(fd.get("printingNotes") || ""),
        agreementType: "printing",
        signs: [],
        installments: [{
          id: uid(),
          label: "عقد طباعة",
          due: created,
          amount,
          kind: "installment",
        }],
        payments: [],
      });
      return;
    }
    const agreementDate = String(fd.get("agreementDate"));
    const deposit = Number(fd.get("deposit") || 0);
    const depositDate = String(fd.get("depositDate") || agreementDate);
    if (!months || months > 12) {
      alert("اختر تاريخ نهاية بعد تاريخ البداية، وبحد أقصى 12 شهرًا.");
      return;
    }
    let installments: Installment[] = [];
    if (deposit > 0)
      installments.push({
        id: uid(),
        label: "دفعة التعاقد",
        due: depositDate,
        amount: deposit,
        kind: "deposit",
      });
    if (mode === "manual")
      installments.push(...manual.filter((i) => i.amount > 0 && i.due));
    else {
      const count = Math.max(1, Number(fd.get("count") || 1));
      const firstDue = String(fd.get("firstDue"));
      const remaining = Math.max(0, total - deposit);
      const partial = Math.min(partialStartMonthAmount(displayStart, quantity, unitPrice), remaining);
      const each = (remaining - partial) / count;
      for (let x = 0; x < count; x++) {
        const d = new Date(firstDue + "T12:00:00");
        d.setMonth(d.getMonth() + x);
        installments.push({
          id: uid(),
          label: `القسط ${x + 1}`,
          due: d.toISOString().slice(0, 10),
          amount: x === 0 ? each + partial : x === count - 1 ? remaining - (each + partial) - each * (count - 2) : each,
          kind: "installment",
        });
      }
    }
    if (!validateDepositSchedule(deposit, total, depositDate, installments)) return;
    const scheduled = installments.reduce((s, i) => s + i.amount, 0);
    if (Math.abs(scheduled - total) > 0.01) {
      alert(
        `إجمالي جدول السداد ${money(scheduled)} لا يساوي قيمة الاتفاق ${money(total)}.`,
      );
      return;
    }
    onSave({
      id: uid(),
      company: String(fd.get("company")),
      title: String(fd.get("title")),
      start: agreementDate,
      displayStart,
      quantity,
      monthlyUnitPrice: unitPrice,
      durationMonths: months,
      notes: String(fd.get("notes") || ""),
      agreementType: "campaign",
      signs: [
        {
          id: uid(),
          location: String(fd.get("location")),
          start: displayStart,
          end: displayEnd,
          cost: total,
        },
      ],
      installments,
      payments: [],
    });
  }
  return (
    <form onSubmit={submit} className="form">
      {defaultCompany && (
        <div className="tabs">
          <button type="button" className={agreementType === "campaign" ? "active" : ""} onClick={() => setAgreementType("campaign")}>
            اتفاق حملة إعلانية
          </button>
          <button type="button" className={agreementType === "printing" ? "active" : ""} onClick={() => setAgreementType("printing")}>
            عقد طباعة
          </button>
        </div>
      )}
      {agreementType === "printing" ? (
        <>
          <div className="balance-box">
            يُسجل المبلغ كالتزام عام على شركة آثار تجاه {defaultCompany}، ويُضاف إلى إجمالي حساب الشركة في شهر إنشائه دون ربطه بحملة معينة.
          </div>
          <div className="form-grid">
            <label>
              المبلغ
              <input name="printingAmount" type="number" min="1" required />
            </label>
            <label className="wide">
              ملاحظات
              <input name="printingNotes" />
            </label>
          </div>
          <button className="primary submit">حفظ عقد الطباعة وإضافة الالتزام</button>
        </>
      ) : <>
      <div className="form-grid">
        <label>
          شركة الإعلان
          <input
            name="company"
            required
            defaultValue={defaultCompany}
            readOnly={!!defaultCompany}
          />
        </label>
        <label>
          اسم الإعلان / الحملة
          <input name="title" required placeholder="مثال: إعلان حج" />
        </label>
        <label>
          موقع اليافطات
          <input name="location" required placeholder="مثال: شارع فؤاد" />
        </label>
        <label>
          تاريخ الاتفاق
          <input
            name="agreementDate"
            type="date"
            required
            defaultValue={today()}
          />
        </label>
        <label>
          تاريخ بداية عرض الإعلان
          <input
            type="date"
            required
            value={displayStart}
            onChange={(e) => setDisplayStart(e.target.value)}
          />
        </label>
        <label>
          تاريخ نهاية عرض الإعلان
          <input
            type="date"
            required
            min={displayStart}
            value={displayEnd}
            onChange={(e) => setDisplayEnd(e.target.value)}
          />
          <small className="duration-result">
            المدة المحسوبة: {months || 0} شهر
          </small>
        </label>
        <label>
          عدد اليافطات
          <input
            type="number"
            min="1"
            required
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        <label>
          سعر الشهر لليافطة الواحدة
          <input
            type="number"
            min="1"
            required
            value={unitPrice || ""}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
          />
        </label>
        <label className="wide">
          ملاحظات
          <input name="notes" />
        </label>
      </div>
      <div className="calculation-box">
        <span>{quantity} يافطة</span>
        <i>×</i>
        <span>{money(unitPrice)} شهريًا</span>
        <i>×</i>
        <span>{months || 0} شهر</span>
        <strong>{money(total)}</strong>
      </div>
      <div className="subhead">
        <b>خطة السداد</b>
        <small>مواعيد السداد مستقلة عن تاريخ الاتفاق وبداية العرض</small>
      </div>
      <div className="form-grid">
        <label>
          دفعة التعاقد (اختياري)
          <input name="deposit" type="number" min="0" defaultValue="0" />
        </label>
        <label>
          تاريخ دفعة التعاقد
          <input name="depositDate" type="date" defaultValue={today()} />
        </label>
      </div>
      <p className="form-hint">تُضاف دفعة التعاقد إلى حساب الشركة في تاريخ استحقاقها، ثم تُحسب الأقساط من صافي قيمة الاتفاق بعد خصمها.</p>
      <div className="tabs">
        <button
          type="button"
          className={mode === "auto" ? "active" : ""}
          onClick={() => setMode("auto")}
        >
          توزيع تلقائي
        </button>
        <button
          type="button"
          className={mode === "manual" ? "active" : ""}
          onClick={() => setMode("manual")}
        >
          إدخال يدوي
        </button>
      </div>
      {mode === "auto" ? (
        <div className="form-grid">
          <label>
            عدد الأقساط
            <input
              name="count"
              type="number"
              min="1"
              max="12"
              defaultValue="1"
            />
          </label>
          <label>
            تاريخ أول قسط
            <input
              name="firstDue"
              type="date"
              required
              defaultValue={today()}
            />
          </label>
        </div>
      ) : (
        <>
          {manual.map((i) => (
            <div className="row-editor installment-editor" key={i.id}>
              <label>
                البيان
                <input
                  value={i.label}
                  onChange={(e) =>
                    setManual((v) =>
                      v.map((x) =>
                        x.id === i.id ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                موعد السداد
                <input
                  type="date"
                  required
                  value={i.due}
                  onChange={(e) =>
                    setManual((v) =>
                      v.map((x) =>
                        x.id === i.id ? { ...x, due: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                المبلغ
                <input
                  type="number"
                  min="1"
                  required
                  value={i.amount || ""}
                  onChange={(e) =>
                    setManual((v) =>
                      v.map((x) =>
                        x.id === i.id
                          ? { ...x, amount: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              {manual.length > 1 && (
                <button
                  type="button"
                  className="remove"
                  onClick={() =>
                    setManual((v) => v.filter((x) => x.id !== i.id))
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-btn add-row"
            onClick={() => setManual((v) => [...v, blankInst()])}
          >
            ＋ إضافة قسط
          </button>
        </>
      )}
      <button className="primary submit">حفظ الاتفاق وإنشاء جدول السداد</button>
      </>}
    </form>
  );
}

function PeriodEditForm({
  contract,
  onSave,
}: {
  contract: Contract;
  onSave: (c: Contract) => void;
}) {
  const sign = contract.signs[0];
  const [start, setStart] = useState(
    contract.displayStart || sign?.start || today(),
  );
  const [end, setEnd] = useState(sign?.end || "");
  const calc = (aValue: string, bValue: string) => {
    if (!aValue || !bValue || bValue < aValue) return 0;
    const a = new Date(aValue + "T12:00:00");
    const b = new Date(bValue + "T12:00:00");
    const days = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    let value = 0;
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())
      value = a.getDate() === 15 ? 0.5 : (b.getDate() - a.getDate() + 1) / days(a.getFullYear(), a.getMonth());
    else {
      value = (a.getDate() === 15 ? 0.5 : (days(a.getFullYear(), a.getMonth()) - a.getDate() + 1) / days(a.getFullYear(), a.getMonth())) + b.getDate() / days(b.getFullYear(), b.getMonth());
      const cursor = new Date(a.getFullYear(), a.getMonth() + 1, 1);
      const last = new Date(b.getFullYear(), b.getMonth(), 1);
      while (cursor < last) {
        value++;
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return Math.round(value * 10) / 10;
  };
  const months = calc(start, end);
  const quantity = contract.quantity || 1;
  const unit = contract.monthlyUnitPrice || 0;
  const newTotal = quantity * unit * months;
  const oldTotal = contract.installments.reduce((s, i) => s + i.amount, 0);
  const paid = contract.payments.reduce((s, p) => s + p.amount, 0);
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!months || months > 12) {
      alert("اختر فترة صحيحة لا تتجاوز 12 شهرًا.");
      return;
    }
    if (newTotal < paid) {
      alert("لا يمكن أن تقل قيمة الاتفاق الجديدة عن المبلغ المدفوع بالفعل.");
      return;
    }
    const depositTotal = contract.installments.filter(i => i.kind === "deposit").reduce((s, i) => s + i.amount, 0);
    const normal = contract.installments.filter(i => i.kind === "installment").sort((a, b) => a.due.localeCompare(b.due));
    const remaining = Math.max(0, newTotal - depositTotal); const halfMonth = Math.min(partialStartMonthAmount(start, quantity, unit), remaining); const each = normal.length ? (remaining - halfMonth) / normal.length : 0;
    const installments = contract.installments.map(i => { if (i.kind === "deposit") return { ...i }; const index = normal.findIndex(x => x.id === i.id); const amount = index === 0 ? each + halfMonth : index === normal.length - 1 ? remaining - (each + halfMonth) - each * (normal.length - 2) : each; return { ...i, amount }; });
    const signs = contract.signs.length
      ? contract.signs.map((s, i) =>
          i === 0 ? { ...s, start, end, cost: newTotal } : s,
        )
      : [{ id: uid(), location: "", start, end, cost: newTotal }];
    onSave({
      ...contract,
      displayStart: start,
      durationMonths: months,
      signs,
      installments,
    });
  }
  return (
    <form className="form" onSubmit={save}>
      <div className="form-grid">
        <label>
          تاريخ بداية العرض
          <input
            type="date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          تاريخ نهاية العرض
          <input
            type="date"
            required
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <div className="calculation-box">
        <span>
          المدة الجديدة: <b>{months} شهر</b>
        </span>
        <span>القيمة السابقة: {money(oldTotal)}</span>
        <strong>القيمة الجديدة: {money(newTotal)}</strong>
      </div>
      <p className="form-hint">
        بداية العرض بعد يوم 1 تُحسب بنصف شهر ثابت 50% وتُضاف إلى القسط الأول فقط، دون حساب الأيام.
      </p>
      <button className="primary submit">حفظ تعديل فترة العرض</button>
    </form>
  );
}

function FirstDueEditForm({
  contract,
  onSave,
}: {
  contract: Contract;
  onSave: (c: Contract) => void;
}) {
  const ordered = [...contract.installments].sort((a, b) =>
    a.due.localeCompare(b.due),
  );
  const target = ordered.find((i) => i.kind === "installment") || ordered[0];
  const [date, setDate] = useState(target?.due || today());
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    onSave({
      ...contract,
      installments: contract.installments.map((i) =>
        i.id === target.id ? { ...i, due: date } : i,
      ),
    });
  }
  return (
    <form className="form" onSubmit={save}>
      <div className="balance-box">
        القسط: <b>{target?.label || "أول قسط"}</b> · القيمة:{" "}
        <b>{money(target?.amount || 0)}</b>
      </div>
      <label>
        موعد السداد الصحيح
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <p className="form-hint">
        سيتم تعديل تاريخ هذا القسط فقط، ثم يعيد النظام ترتيب الاستحقاقات حسب
        التاريخ.
      </p>
      <button className="primary submit">حفظ موعد أول قسط</button>
    </form>
  );
}

function InstallmentCountEditForm({
  contract,
  onSave,
}: {
  contract: Contract;
  onSave: (c: Contract) => void;
}) {
  const normal = contract.installments
    .filter((i) => i.kind === "installment")
    .sort((a, b) => a.due.localeCompare(b.due));
  const deposits = contract.installments.filter((i) => i.kind === "deposit");
  const [count, setCount] = useState(Math.max(1, normal.length));
  const firstDue = normal[0]?.due || today();
  const installmentTotal = normal.reduce((sum, item) => sum + item.amount, 0);

  function dueAfterMonths(dateText: string, offset: number) {
    const source = new Date(`${dateText}T12:00:00`);
    const targetMonth = new Date(
      source.getFullYear(),
      source.getMonth() + offset,
      1,
      12,
    );
    const lastDay = new Date(
      targetMonth.getFullYear(),
      targetMonth.getMonth() + 1,
      0,
      12,
    ).getDate();
    targetMonth.setDate(Math.min(source.getDate(), lastDay));
    return `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}-${String(targetMonth.getDate()).padStart(2, "0")}`;
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const nextCount = Math.max(1, Math.min(12, count));
    const partial = Math.min(
      partialStartMonthAmount(
        contract.displayStart || contract.signs[0]?.start || "",
        contract.quantity || 1,
        contract.monthlyUnitPrice || 0,
      ),
      installmentTotal,
    );
    const each = (installmentTotal - partial) / nextCount;
    const rebuilt = Array.from({ length: nextCount }, (_, index) => ({
      id: normal[index]?.id || uid(),
      label: `القسط ${index + 1}`,
      due: dueAfterMonths(firstDue, index),
      amount:
        index === 0
          ? each + partial
          : index === nextCount - 1
            ? installmentTotal - (each + partial) - each * (nextCount - 2)
            : each,
      kind: "installment" as const,
    }));
    onSave({ ...contract, installments: [...deposits, ...rebuilt] });
  }

  return (
    <form className="form" onSubmit={save}>
      <div className="balance-box">
        صافي المبلغ الموزع على الأقساط: <b>{money(installmentTotal)}</b>
        {deposits.length > 0 && <> · دفعة التعاقد محفوظة دون تعديل</>}
      </div>
      <div className="form-grid">
        <label>
          عدد الأقساط الحالي
          <input type="number" value={normal.length} disabled />
        </label>
        <label>
          عدد الأقساط الجديد
          <input
            type="number"
            min="1"
            max="12"
            required
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="form-hint">
        يبدأ الجدول الجديد من {firstDue} بفاصل شهر بين الأقساط. بعد الحفظ يعاد
        توزيع سداد الشركة على جميع الاستحقاقات حسب ترتيب تواريخها.
      </p>
      <button className="primary submit">إعادة توزيع الأقساط وحفظ التعديل</button>
    </form>
  );
}

function CompanyDepositDueEditForm({
  contract,
  companyContracts,
  onSave,
}: {
  contract: Contract;
  companyContracts: Contract[];
  onSave: (c: Contract) => void;
}) {
  const deposit = contract.installments[0];
  const [date, setDate] = useState(deposit?.due || today());
  const firstMonthlyDue = companyContracts
    .filter((item) => !item.agreementType || item.agreementType === "campaign")
    .flatMap((item) => installmentsForCompanyReport(item))
    .filter((item) => item.kind === "installment")
    .sort((a, b) => a.due.localeCompare(b.due))[0]?.due;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!deposit) return;
    if (firstMonthlyDue && date > firstMonthlyDue) {
      alert(`موعد دفعة التعاقد يجب ألا يتجاوز موعد أول قسط شهري (${firstMonthlyDue}).`);
      return;
    }
    onSave({
      ...contract,
      installments: contract.installments.map((item) =>
        item.id === deposit.id ? { ...item, due: date } : item,
      ),
    });
  }

  return (
    <form className="form" onSubmit={save}>
      <div className="balance-box">
        قيمة دفعة التعاقد: <b>{money(deposit?.amount || 0)}</b>
      </div>
      <label>
        تاريخ الاستحقاق الجديد
        <input
          type="date"
          required
          max={firstMonthlyDue}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <p className="form-hint">
        ستنتقل دفعة التعاقد إلى شهر التاريخ الجديد، ويُعاد حساب إجمالي استحقاقات الشهر وتقارير الشركة تلقائيًا دون تغيير قيمتها.
      </p>
      <button className="primary submit">حفظ التاريخ وإعادة الحساب</button>
    </form>
  );
}

function ContractDepositEditForm({
  contract,
  onSave,
}: {
  contract: Contract;
  onSave: (c: Contract) => void;
}) {
  const normal = contract.installments
    .filter((item) => item.kind === "installment")
    .sort((a, b) => a.due.localeCompare(b.due));
  const deposits = contract.installments.filter((item) => item.kind === "deposit");
  const agreementTotal = contract.installments.reduce((sum, item) => sum + item.amount, 0);
  const existingDepositTotal = deposits.reduce((sum, item) => sum + item.amount, 0);
  const firstDue = normal[0]?.due || today();

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get("amount"));
    const due = String(fd.get("date"));
    if (amount <= 0 || !due || !normal.length) return;
    if (due > firstDue) {
      alert("موعد دفعة التعاقد يجب أن يسبق أول قسط للإعلان أو يوافقه.");
      return;
    }
    if (existingDepositTotal + amount > agreementTotal) {
      alert(`إجمالي دفعات التعاقد لا يمكن أن يتجاوز قيمة الإعلان (${money(agreementTotal)}).`);
      return;
    }
    const remaining = agreementTotal - existingDepositTotal - amount;
    const amounts = splitRoundedInstallments(remaining, normal.length);
    const adjusted = normal.map((item, index) => ({
      ...item,
      label: `القسط ${index + 1}`,
      amount: amounts[index],
    }));
    onSave({
      ...contract,
      installments: [
        ...deposits,
        {
          id: uid(),
          label: "دفعة تعاقد للإعلان",
          due,
          amount,
          kind: "deposit",
        },
        ...adjusted,
      ],
    });
  }

  return (
    <form className="form" onSubmit={save}>
      <div className="balance-box">
        تُسجل كاستحقاق غير مسدد لهذا الإعلان، وتُخصم من قيمته قبل إعادة توزيع المتبقي على أقساطه الحالية.
      </div>
      <div className="form-grid">
        <label>
          قيمة دفعة التعاقد
          <input name="amount" type="number" min="1" step="0.01" required />
        </label>
        <label>
          تاريخ الاستحقاق
          <input name="date" type="date" max={firstDue} defaultValue={firstDue} required />
        </label>
      </div>
      <p className="form-hint">
        قيمة الإعلان {money(agreementTotal)} · أول قسط {firstDue} · عدد الأقساط {normal.length}
      </p>
      <button className="primary submit">تسجيل الدفعة وإعادة حساب أقساط الإعلان</button>
    </form>
  );
}

function QuantityEditForm({
  contract,
  onSave,
}: {
  contract: Contract;
  onSave: (c: Contract) => void;
}) {
  const [quantity, setQuantity] = useState(
    contract.quantity || contract.signs.length || 1,
  );
  const [unit, setUnit] = useState(contract.monthlyUnitPrice || 0);
  const months = contract.durationMonths || 1;
  const oldTotal = contract.installments.reduce((s, i) => s + i.amount, 0);
  const newTotal = quantity * unit * months;
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!contract.installments.length || oldTotal <= 0) return;
    const depositTotal = contract.installments.filter(i => i.kind === "deposit").reduce((s, i) => s + i.amount, 0);
    const normal = contract.installments.filter(i => i.kind === "installment").sort((a, b) => a.due.localeCompare(b.due));
    const remaining = Math.max(0, newTotal - depositTotal); const partial = Math.min(partialStartMonthAmount(contract.displayStart || contract.signs[0]?.start || "", quantity, unit), remaining); const each = normal.length ? (remaining - partial) / normal.length : 0;
    const installments = contract.installments.map(i => { if (i.kind === "deposit") return { ...i }; const index = normal.findIndex(x => x.id === i.id); const amount = index === 0 ? each + partial : index === normal.length - 1 ? remaining - (each + partial) - each * (normal.length - 2) : each; return { ...i, amount }; });
    const signs = contract.signs.map((s, i) =>
      i === 0 ? { ...s, cost: newTotal } : s,
    );
    onSave({
      ...contract,
      quantity,
      monthlyUnitPrice: unit,
      installments,
      signs,
    });
  }
  return (
    <form className="form" onSubmit={save}>
      <div className="form-grid">
        <label>
          عدد اليافطات الصحيح
          <input
            type="number"
            min="1"
            required
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        <label>
          سعر الشهر الصحيح لليافطة
          <input
            type="number"
            min="1"
            required
            value={unit || ""}
            onChange={(e) => setUnit(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="calculation-box">
        <span>{quantity} يافطة</span>
        <i>×</i>
        <span>{money(unit)} شهريًا</span>
        <i>×</i>
        <span>{months} شهر</span>
        <strong>{money(newTotal)}</strong>
      </div>
      <div className="balance-box">
        القيمة السابقة: <b>{money(oldTotal)}</b> · القيمة الجديدة:{" "}
        <b>{money(newTotal)}</b>
      </div>
      <p className="form-hint">
        سيُعاد حساب جميع الأقساط من البداية بنفس مواعيدها ونِسَب توزيعها
        الحالية، وليس تعديل آخر قسط فقط.
      </p>
      <button className="primary submit">إعادة الحساب وحفظ التعديل</button>
    </form>
  );
}

function CompanySummaryReport({
  companies,
  contracts,
  payments,
}: {
  companies: string[];
  contracts: Contract[];
  payments: Record<string, Payment[]>;
}) {
  const rows = companies.map((company) => {
    const list = contracts.filter((c) => c.company === company);
    const total = accountRowsForCompany(list).reduce(
      (sum, row) => sum + row.amount,
      0,
    );
    const paid = (payments[company] || []).reduce((s, p) => s + p.amount, 0);
    return {
      company,
      campaigns: list.filter((c) => !c.agreementType || c.agreementType === "campaign").length,
      total,
      paid,
      remaining: Math.max(0, total - paid),
    };
  });
  return (
    <div className="panel report-table print-keep">
      <div className="panel-head">
        <div>
          <h2>ملخص إجمالي الشركات</h2>
          <p>إجمالي الحملات والعقود والمدفوع حتى الآن</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>شركة الإعلانات</th>
            <th>عدد الحملات</th>
            <th>إجمالي العقود</th>
            <th>إجمالي المدفوع</th>
            <th>المتبقي</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.company}>
              <td>
                <b>{r.company}</b>
              </td>
              <td>{r.campaigns}</td>
              <td>{money(r.total)}</td>
              <td>
                {money(r.paid)}
              </td>
              <td>{money(r.remaining)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td>الإجمالي العام</td>
            <td>{rows.reduce((s, r) => s + r.campaigns, 0)}</td>
            <td>{money(rows.reduce((s, r) => s + r.total, 0))}</td>
            <td>{money(rows.reduce((s, r) => s + r.paid, 0))}</td>
            <td>{money(rows.reduce((s, r) => s + r.remaining, 0))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PaymentsReport({
  companies,
  payments,
  year,
  selectedCompany,
  onEdit,
  onDelete,
}: {
  companies: string[];
  payments: Record<string, Payment[]>;
  year: number;
  selectedCompany: string;
  onEdit: (company: string, payment: Payment) => void;
  onDelete: (company: string, payment: Payment) => void;
}) {
  const rows = companies
    .flatMap((company) =>
      (payments[company] || [])
        .filter((payment) => {
          const date = new Date(`${payment.date}T12:00:00`);
          const start = new Date(year, 6, 1, 12);
          const end = new Date(year + 1, 5, 30, 12);
          return date >= start && date <= end;
        })
        .map((payment) => ({ ...payment, company })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const companyTotals = companies
    .map((company) => ({
      company,
      count: rows.filter((row) => row.company === company).length,
      total: rows
        .filter((row) => row.company === company)
        .reduce((sum, row) => sum + row.amount, 0),
    }))
    .filter((item) => item.count > 0);
  const grandTotal = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="panel report-table print-keep">
      <div className="panel-head">
        <div>
          <h2>
            {selectedCompany
              ? `دفعات السداد المصروفة لشركة ${selectedCompany}`
              : "دفعات السداد المصروفة لكل شركات الإعلانات"}
          </h2>
          <p>
            دفعات عامة خلال السنة المالية من يوليو {year} حتى يونيو {year + 1}
          </p>
        </div>
      </div>
      {!selectedCompany && companyTotals.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>شركة الإعلانات</th>
              <th>عدد دفعات السداد</th>
              <th>إجمالي المصروف</th>
            </tr>
          </thead>
          <tbody>
            {companyTotals.map((item) => (
              <tr key={`payment-total-${item.company}`}>
                <td><b>{item.company}</b></td>
                <td>{item.count}</td>
                <td>{money(item.total)}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td>الإجمالي العام</td>
              <td>{rows.length}</td>
              <td>{money(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <table>
        <thead>
          <tr>
            {!selectedCompany && <th>شركة الإعلانات</th>}
            <th>تاريخ السداد</th>
            <th>البيان / الملاحظة</th>
            <th>المبلغ المصروف</th>
            <th className="print-hide">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={`payment-report-${row.company}-${row.id}`}>
                {!selectedCompany && <td><b>{row.company}</b></td>}
                <td>{row.date}</td>
                <td>{row.note || "دفعة سداد"}</td>
                <td>{money(row.amount)}</td>
                <td className="payment-actions print-hide">
                  <button className="edit-payment" type="button" onClick={() => onEdit(row.company, row)}>تعديل</button>
                  <button className="delete-payment" type="button" onClick={() => onDelete(row.company, row)}>حذف</button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={selectedCompany ? 4 : 5}>لا توجد دفعات سداد مصروفة خلال هذه السنة.</td>
            </tr>
          )}
          {rows.length > 0 && (
            <tr className="total-row">
              <td colSpan={selectedCompany ? 2 : 3}>
                {selectedCompany ? "إجمالي دفعات الشركة" : "إجمالي دفعات كل الشركات"}
              </td>
              <td>{money(grandTotal)}</td>
              <td className="print-hide" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CompanyInstallmentDistribution({
  companies,
  contracts,
  year,
}: {
  companies: string[];
  contracts: Contract[];
  year: number;
}) {
  const values = (company: string) =>
    fiscalMonths(year).map(({ month, year: itemYear }) =>
      accountRowsForCompany(contracts.filter((c) => c.company === company))
        .filter(
          (row) =>
            Number(row.due.slice(0, 4)) === itemYear &&
            Number(row.due.slice(5, 7)) === month + 1,
        )
        .reduce((sum, row) => sum + row.amount, 0),
    );
  const rows = companies.map((company) => ({ company, vals: values(company) }));
  return (
    <div className="panel report-table print-keep">
      <div className="panel-head">
        <div>
          <h2>توزيع الأقساط الشهرية حسب الشركات</h2>
          <p>الشركات المكوّنة لإجمالي الأقساط المطلوبة في كل شهر</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>شركة الإعلانات</th>
            {fiscalMonths(year).map((m) => (
              <th key={m.label}>{m.label}</th>
            ))}
            <th>إجمالي السنة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.company}>
              <td>
                <b>{r.company}</b>
              </td>
              {r.vals.map((v, i) => (
                <td key={i}>
                  {v
                    ? new Intl.NumberFormat("ar-EG", {
                        maximumFractionDigits: 0,
                      }).format(v)
                    : "—"}
                </td>
              ))}
              <td>
                <b>{money(r.vals.reduce((s, v) => s + v, 0))}</b>
              </td>
            </tr>
          ))}
          <tr className="total-row">
            <td>إجمالي الشهر</td>
            {fiscalMonths(year).map((m, i) => {
              const v = rows.reduce((s, r) => s + r.vals[i], 0);
              return (
                <td key={m.label}>
                  {v
                    ? new Intl.NumberFormat("ar-EG", {
                        maximumFractionDigits: 0,
                      }).format(v)
                    : "—"}
                </td>
              );
            })}
            <td>
              {money(
                rows.reduce(
                  (sum, r) => sum + r.vals.reduce((s, v) => s + v, 0),
                  0,
                ),
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
