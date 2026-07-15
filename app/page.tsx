"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Sign = { id: string; location: string; start: string; end: string; cost: number };
type Installment = { id: string; label: string; due: string; amount: number; kind: "deposit" | "installment" };
type Payment = { id: string; date: string; amount: number; note: string };
type Contract = { id: string; company: string; title: string; start: string; signs: Sign[]; installments: Installment[]; payments: Payment[]; notes: string };

const KEY = "ad-expense-planner-v1";
const monthsAr = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const money = (n: number) => new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n) + " ج.م";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const today = () => new Date().toISOString().slice(0, 10);

const seed: Contract[] = [{
  id: "demo", company: "شركة الأفق للإعلان", title: "حملة صيف 2026", start: "2026-07-01", notes: "بيانات تجريبية — يمكن حذف العقد والبدء ببياناتك.",
  signs: [
    { id: "s1", location: "طريق المطار", start: "2026-07-15", end: "2027-01-14", cost: 120000 },
    { id: "s2", location: "ميدان رئيسي", start: "2026-08-01", end: "2027-01-31", cost: 60000 },
  ],
  installments: [
    { id: "i1", label: "دفعة التعاقد", due: "2026-07-01", amount: 30000, kind: "deposit" },
    { id: "i2", label: "القسط الأول", due: "2026-08-01", amount: 50000, kind: "installment" },
    { id: "i3", label: "القسط الثاني", due: "2026-10-01", amount: 50000, kind: "installment" },
    { id: "i4", label: "القسط الثالث", due: "2026-12-01", amount: 50000, kind: "installment" },
  ], payments: [{ id: "p1", date: "2026-07-01", amount: 30000, note: "دفعة التعاقد" }],
}];

function allocate(c: Contract) {
  let paid = c.payments.reduce((s, p) => s + p.amount, 0);
  return [...c.installments].sort((a, b) => a.due.localeCompare(b.due)).map(i => {
    const applied = Math.min(paid, i.amount); paid -= applied;
    const remaining = i.amount - applied;
    const overdue = remaining > 0 && i.due < today();
    return { ...i, applied, remaining, status: remaining === 0 ? "مدفوع" : applied > 0 ? "مدفوع جزئيًا" : overdue ? "متأخر" : "مستحق" };
  });
}

export default function Home() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"dashboard" | "contracts" | "payments" | "reports">("dashboard");
  const [year, setYear] = useState(new Date().getFullYear());
  const [modal, setModal] = useState<"contract" | "payment" | null>(null);
  const [selected, setSelected] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const saved = localStorage.getItem(KEY); setContracts(saved ? JSON.parse(saved) : seed); setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(contracts)); }, [contracts, ready]);

  const allRows = useMemo(() => contracts.flatMap(c => allocate(c).map(i => ({ ...i, company: c.company, contractId: c.id, title: c.title }))), [contracts]);
  const monthData = useMemo(() => monthsAr.map((name, idx) => {
    const rows = allRows.filter(r => Number(r.due.slice(0, 4)) === year && Number(r.due.slice(5, 7)) === idx + 1);
    return { name, rows, due: rows.reduce((s, r) => s + r.amount, 0), paid: rows.reduce((s, r) => s + r.applied, 0), remaining: rows.reduce((s, r) => s + r.remaining, 0) };
  }), [allRows, year]);
  const totalContracted = contracts.reduce((s, c) => s + c.installments.reduce((x, i) => x + i.amount, 0), 0);
  const totalPaid = contracts.reduce((s, c) => s + c.payments.reduce((x, p) => x + p.amount, 0), 0);
  const overdue = allRows.filter(r => r.due < today()).reduce((s, r) => s + r.remaining, 0);
  const dueThisMonth = monthData[new Date().getMonth()]?.remaining || 0;

  function savePayment(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const fd = new FormData(e.currentTarget); const id = String(fd.get("contract")); const amount = Number(fd.get("amount")); if (!id || amount <= 0) return; setContracts(v => v.map(c => c.id === id ? { ...c, payments: [...c.payments, { id: uid(), date: String(fd.get("date")), amount, note: String(fd.get("note") || "") }] } : c)); setModal(null); }
  function backup() { const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), contracts }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `نسخة-احتياطية-${today()}.json`; a.click(); URL.revokeObjectURL(a.href); }
  function restore(f?: File) { if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(String(r.result)); if (Array.isArray(d.contracts)) setContracts(d.contracts); else alert("ملف غير صالح"); } catch { alert("تعذر قراءة الملف"); } }; r.readAsText(f); }

  if (!ready) return <main className="loading">جارٍ تجهيز النظام…</main>;
  const nav = [{ id: "dashboard", label: "لوحة المتابعة", icon: "◫" }, { id: "contracts", label: "العقود واليافطات", icon: "▤" }, { id: "payments", label: "المدفوعات", icon: "◉" }, { id: "reports", label: "التقارير السنوية", icon: "▦" }] as const;

  return <div className="app" dir="rtl">
    <aside className="sidebar print-hide">
      <div className="brand"><span className="brandmark">م</span><div><strong>مخطط المصروف</strong><small>الدعاية والإعلانات</small></div></div>
      <nav>{nav.map(n => <button key={n.id} className={view === n.id ? "active" : ""} onClick={() => setView(n.id)}><span>{n.icon}</span>{n.label}</button>)}</nav>
      <div className="side-actions"><button onClick={backup}>↓ نسخ احتياطي</button><button onClick={() => fileRef.current?.click()}>↑ استعادة البيانات</button><input ref={fileRef} type="file" accept=".json" hidden onChange={e => restore(e.target.files?.[0])}/><small>البيانات محفوظة على هذا الجهاز</small></div>
    </aside>
    <main className="main">
      <header className="topbar print-hide"><div><h1>{nav.find(n => n.id === view)?.label}</h1><p>نظرة واضحة على التزامات شركات الدعاية والسداد</p></div><div className="header-actions"><button className="secondary" onClick={() => setModal("payment")}>تسجيل دفعة</button><button className="primary" onClick={() => setModal("contract")}>＋ عقد جديد</button></div></header>

      {view === "dashboard" && <>
        <section className="stats">
          <article><span className="stat-icon green">✓</span><div><small>إجمالي المدفوع</small><b>{money(totalPaid)}</b><em>من {money(totalContracted)}</em></div></article>
          <article><span className="stat-icon blue">◷</span><div><small>المطلوب هذا الشهر</small><b>{money(dueThisMonth)}</b><em>{monthsAr[new Date().getMonth()]}</em></div></article>
          <article><span className="stat-icon red">!</span><div><small>إجمالي المتأخرات</small><b>{money(overdue)}</b><em>{allRows.filter(r => r.status === "متأخر" || (r.due < today() && r.remaining)).length} قسط</em></div></article>
          <article><span className="stat-icon gold">▤</span><div><small>العقود النشطة</small><b>{contracts.length}</b><em>{contracts.reduce((s, c) => s + c.signs.length, 0)} يافطة</em></div></article>
        </section>
        <section className="panel timeline"><div className="panel-head"><div><h2>الخريطة الزمنية للسداد</h2><p>المطلوب والمتبقي خلال سنة {year}</p></div><select value={year} onChange={e => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map(y => <option key={y}>{y}</option>)}</select></div>
          <div className="months">{monthData.map((m, i) => <article className={i === new Date().getMonth() && year === new Date().getFullYear() ? "current" : ""} key={m.name}><div className="month-name">{m.name}</div><b>{money(m.due)}</b><div className="bar"><i style={{ width: `${m.due ? m.paid / m.due * 100 : 0}%` }}/></div><small>{m.due ? `متبقي ${money(m.remaining)}` : "لا توجد التزامات"}</small></article>)}</div>
        </section>
        <section className="panel"><div className="panel-head"><div><h2>الاستحقاقات القريبة</h2><p>مرتبة من الأقدم إلى الأحدث</p></div><button className="text-btn" onClick={() => setView("payments")}>عرض الكل ←</button></div><DueTable rows={allRows.filter(r => r.remaining > 0).slice(0, 6)} /></section>
      </>}

      {view === "contracts" && <section className="content-stack"><div className="section-title"><div><h2>العقود واليافطات</h2><p>{contracts.length} عقد مسجل</p></div><button className="primary" onClick={() => setModal("contract")}>＋ إضافة عقد</button></div>{contracts.map(c => <article className="contract-card" key={c.id}><div className="contract-top"><div><span className="company-dot">{c.company.slice(0, 1)}</span><div><h3>{c.company}</h3><p>{c.title} · بدأ {c.start}</p></div></div><button className="danger-link" onClick={() => confirm("حذف هذا العقد؟") && setContracts(v => v.filter(x => x.id !== c.id))}>حذف</button></div><div className="contract-grid"><div><small>قيمة العقد</small><b>{money(c.installments.reduce((s, i) => s + i.amount, 0))}</b></div><div><small>المدفوع</small><b>{money(c.payments.reduce((s, p) => s + p.amount, 0))}</b></div><div><small>المتبقي</small><b>{money(c.installments.reduce((s, i) => s + i.amount, 0) - c.payments.reduce((s, p) => s + p.amount, 0))}</b></div><div><small>عدد اليافطات</small><b>{c.signs.length}</b></div></div><div className="signs">{c.signs.map(s => <div key={s.id}><span>📍 {s.location}</span><small>{s.start} — {s.end}</small><b>{money(s.cost)}</b></div>)}</div>{c.notes && <p className="note">{c.notes}</p>}</article>)}</section>}

      {view === "payments" && <section className="panel"><div className="panel-head"><div><h2>جدول الأقساط والمدفوعات</h2><p>يُوزّع كل سداد على أقدم استحقاق تلقائيًا</p></div><button className="primary" onClick={() => setModal("payment")}>＋ تسجيل دفعة</button></div><DueTable rows={allRows} /></section>}

      {view === "reports" && <section className="report"><div className="section-title print-hide"><div><h2>التقرير السنوي</h2><p>ملخص التزامات كل شركة وإجماليات الشهور</p></div><div><select value={year} onChange={e => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map(y => <option key={y}>{y}</option>)}</select><button className="primary" onClick={() => window.print()}>طباعة / حفظ PDF</button></div></div><div className="print-title"><h1>تقرير مصروف الدعاية والإعلانات</h1><p>السنة المالية {year} · تاريخ التقرير {today()}</p></div><div className="panel report-table"><table><thead><tr><th>الشركة</th>{monthsAr.map(m => <th key={m}>{m}</th>)}<th>الإجمالي</th></tr></thead><tbody>{contracts.map(c => { const rows = allocate(c); const vals = monthsAr.map((_, i) => rows.filter(r => Number(r.due.slice(0, 4)) === year && Number(r.due.slice(5, 7)) === i + 1).reduce((s, r) => s + r.amount, 0)); return <tr key={c.id}><td>{c.company}</td>{vals.map((v, i) => <td key={i}>{v ? new Intl.NumberFormat("ar-EG").format(v) : "—"}</td>)}<td><b>{new Intl.NumberFormat("ar-EG").format(vals.reduce((s, v) => s + v, 0))}</b></td></tr>})}<tr className="total-row"><td>إجمالي الشهر</td>{monthData.map(m => <td key={m.name}>{m.due ? new Intl.NumberFormat("ar-EG").format(m.due) : "—"}</td>)}<td>{new Intl.NumberFormat("ar-EG").format(monthData.reduce((s, m) => s + m.due, 0))}</td></tr></tbody></table></div><div className="report-summary"><span>إجمالي السنة <b>{money(monthData.reduce((s, m) => s + m.due, 0))}</b></span><span>المدفوع <b>{money(monthData.reduce((s, m) => s + m.paid, 0))}</b></span><span>المتبقي <b>{money(monthData.reduce((s, m) => s + m.remaining, 0))}</b></span></div></section>}
    </main>

    {modal === "contract" && <Modal title="إضافة عقد جديد" close={() => setModal(null)}><ContractForm onSave={c => { setContracts(v => [...v, c]); setModal(null); }}/></Modal>}
    {modal === "payment" && <Modal title="تسجيل دفعة جديدة" close={() => setModal(null)}><form onSubmit={savePayment} className="form"><label>العقد<select name="contract" required value={selected} onChange={e => setSelected(e.target.value)}><option value="">اختر الشركة والعقد</option>{contracts.map(c => <option key={c.id} value={c.id}>{c.company} — {c.title}</option>)}</select></label>{selected && <div className="balance-box">الرصيد المتبقي: <b>{money(Math.max(0, contracts.find(c => c.id === selected)!.installments.reduce((s, i) => s + i.amount, 0) - contracts.find(c => c.id === selected)!.payments.reduce((s, p) => s + p.amount, 0)))}</b></div>}<div className="form-grid"><label>قيمة الدفعة<input name="amount" type="number" min="1" required/></label><label>تاريخ السداد<input name="date" type="date" defaultValue={today()} required/></label><label className="wide">بيان / ملاحظة<input name="note" placeholder="مثال: تحويل بنكي"/></label></div><button className="primary submit">تسجيل السداد</button></form></Modal>}
  </div>;
}

function DueTable({ rows }: { rows: ReturnType<typeof allocate>[number][] & any[] }) { return <div className="table-wrap"><table><thead><tr><th>الشركة</th><th>البيان</th><th>تاريخ الاستحقاق</th><th>قيمة القسط</th><th>المسدّد</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>{rows.length ? rows.map(r => <tr key={r.id}><td><b>{r.company}</b><small>{r.title}</small></td><td>{r.label}</td><td>{r.due}</td><td>{money(r.amount)}</td><td>{money(r.applied)}</td><td>{money(r.remaining)}</td><td><span className={`badge ${r.status === "مدفوع" ? "ok" : r.status === "متأخر" ? "late" : r.status === "مدفوع جزئيًا" ? "partial" : "due"}`}>{r.status}</span></td></tr>) : <tr><td colSpan={7} className="empty">لا توجد استحقاقات مسجلة</td></tr>}</tbody></table></div> }
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="overlay" onMouseDown={e => e.target === e.currentTarget && close()}><div className="modal"><div className="modal-head"><h2>{title}</h2><button onClick={close}>×</button></div>{children}</div></div> }

function ContractForm({ onSave }: { onSave: (c: Contract) => void }) {
  const blankSign = (): Sign => ({ id: uid(), location: "", start: today(), end: "", cost: 0 });
  const blankInst = (): Installment => ({ id: uid(), label: "قسط", due: today(), amount: 0, kind: "installment" });
  const [signs, setSigns] = useState<Sign[]>([blankSign()]); const [mode, setMode] = useState<"auto" | "manual">("auto"); const [manual, setManual] = useState<Installment[]>([blankInst()]);
  const total = signs.reduce((s, x) => s + Number(x.cost || 0), 0);
  function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const fd = new FormData(e.currentTarget); const start = String(fd.get("start")); const deposit = Number(fd.get("deposit") || 0); const depositDate = String(fd.get("depositDate") || start); let installments: Installment[] = []; const limit = new Date(start + "T12:00:00"); limit.setFullYear(limit.getFullYear() + 1); if (signs.some(s => new Date(s.end + "T12:00:00") > limit || s.end < s.start)) { alert("مدة اليافطة يجب ألا تتجاوز 12 شهرًا من تاريخ التعاقد، وأن يكون تاريخ النهاية بعد البداية."); return; }
    if (deposit > 0) installments.push({ id: uid(), label: "دفعة التعاقد", due: depositDate, amount: deposit, kind: "deposit" });
    if (mode === "manual") installments.push(...manual.filter(i => i.amount > 0 && i.due)); else { const count = Math.max(1, Number(fd.get("count") || 1)); const firstDue = String(fd.get("firstDue") || start); const remaining = Math.max(0, total - deposit); const each = remaining / count; for (let x = 0; x < count; x++) { const d = new Date(firstDue + "T12:00:00"); d.setMonth(d.getMonth() + x); installments.push({ id: uid(), label: `القسط ${x + 1}`, due: d.toISOString().slice(0, 10), amount: x === count - 1 ? remaining - each * (count - 1) : each, kind: "installment" }); } }
    if (installments.some(i => new Date(i.due + "T12:00:00") > limit)) { alert("موعد أي دفعة يجب ألا يتجاوز 12 شهرًا من تاريخ التعاقد."); return; } const scheduled = installments.reduce((s, i) => s + Number(i.amount), 0); if (Math.abs(scheduled - total) > .01) { alert(`إجمالي الدفعات (${money(scheduled)}) لا يساوي قيمة اليافطات (${money(total)}).`); return; }
    onSave({ id: uid(), company: String(fd.get("company")), title: String(fd.get("title")), start, notes: String(fd.get("notes") || ""), signs, installments, payments: [] }); }
  return <form onSubmit={submit} className="form"><div className="form-grid"><label>شركة الإعلان<input name="company" required/></label><label>اسم العقد / الحملة<input name="title" required/></label><label>تاريخ التعاقد<input name="start" type="date" required defaultValue={today()}/></label><label>ملاحظات<input name="notes"/></label></div>
    <div className="subhead"><b>اليافطات داخل العقد</b><button type="button" className="text-btn" onClick={() => setSigns(v => [...v, blankSign()])}>＋ إضافة يافطة</button></div>
    {signs.map(s => <div className="row-editor signs-editor" key={s.id}><label>الموقع<input required value={s.location} onChange={e => setSigns(v => v.map(x => x.id === s.id ? { ...x, location: e.target.value } : x))}/></label><label>من<input type="date" required value={s.start} onChange={e => setSigns(v => v.map(x => x.id === s.id ? { ...x, start: e.target.value } : x))}/></label><label>إلى<input type="date" required value={s.end} onChange={e => setSigns(v => v.map(x => x.id === s.id ? { ...x, end: e.target.value } : x))}/></label><label>التكلفة<input type="number" min="1" required value={s.cost || ""} onChange={e => setSigns(v => v.map(x => x.id === s.id ? { ...x, cost: Number(e.target.value) } : x))}/></label>{signs.length > 1 && <button type="button" className="remove" onClick={() => setSigns(v => v.filter(x => x.id !== s.id))}>×</button>}</div>)}
    <div className="total-box">إجمالي قيمة اليافطات <b>{money(total)}</b></div><div className="form-grid"><label>دفعة التعاقد<input name="deposit" type="number" min="0" defaultValue="0"/></label><label>تاريخ دفعة التعاقد<input name="depositDate" type="date" defaultValue={today()}/></label></div>
    <div className="tabs"><button type="button" className={mode === "auto" ? "active" : ""} onClick={() => setMode("auto")}>توزيع تلقائي</button><button type="button" className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>إدخال يدوي</button></div>
    {mode === "auto" ? <div className="form-grid"><label>عدد الأقساط الباقية<input name="count" type="number" min="1" max="12" defaultValue="1"/></label><label>تاريخ أول قسط<input name="firstDue" type="date" defaultValue={today()}/></label></div> : <>{manual.map(i => <div className="row-editor installment-editor" key={i.id}><label>البيان<input value={i.label} onChange={e => setManual(v => v.map(x => x.id === i.id ? { ...x, label: e.target.value } : x))}/></label><label>التاريخ<input type="date" required value={i.due} onChange={e => setManual(v => v.map(x => x.id === i.id ? { ...x, due: e.target.value } : x))}/></label><label>المبلغ<input type="number" min="1" required value={i.amount || ""} onChange={e => setManual(v => v.map(x => x.id === i.id ? { ...x, amount: Number(e.target.value) } : x))}/></label>{manual.length > 1 && <button type="button" className="remove" onClick={() => setManual(v => v.filter(x => x.id !== i.id))}>×</button>}</div>)}<button type="button" className="text-btn add-row" onClick={() => setManual(v => [...v, blankInst()])}>＋ إضافة قسط</button></>}
    <button className="primary submit">حفظ العقد وإنشاء جدول السداد</button></form>;
}
