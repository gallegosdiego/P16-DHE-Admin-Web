import { fixedExpensesSeed, moneyFormatter, payrollSeed, receivablesSeed } from "@/lib/mock-data";

const driverBoard = [
  { name: "Juan Perez", toCollect: 180000, toSettle: 90000, settled: 320000 },
  { name: "Laura Sanchez", toCollect: 140000, toSettle: 110000, settled: 290000 },
  { name: "Carlos Torres", toCollect: 50000, toSettle: 40000, settled: 210000 },
];

const statusAging = (days: number) => {
  if (days > 15) return "bg-rose-50 text-issue";
  if (days >= 7) return "bg-amber-50 text-pending";
  return "bg-emerald-50 text-delivered";
};

export default function PagosPage() {
  const totalReceivable = receivablesSeed.reduce((sum, item) => sum + item.amount, 0);
  const totalLiquidate = driverBoard.reduce((sum, item) => sum + item.toSettle, 0);
  const totalSettled = driverBoard.reduce((sum, item) => sum + item.settled, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-bold text-slate-900">Pagos y Finanzas</h1>
        <p className="text-sm text-slate-500">Control de recaudo, cuentas por cobrar y gastos fijos.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Total por cobrar</p><p className="mt-1 text-xl font-bold text-purple-600">{moneyFormatter.format(totalReceivable)}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Por liquidar</p><p className="mt-1 text-xl font-bold text-pending">{moneyFormatter.format(totalLiquidate)}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">Liquidado oficina</p><p className="mt-1 text-xl font-bold text-delivered">{moneyFormatter.format(totalSettled)}</p></article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">¿Quién me debe?</h2>
        <div className="mt-3 space-y-2">
          {[...receivablesSeed].sort((a, b) => b.agingDays - a.agingDays).map((item) => (
            <div key={item.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
              <div>
                <p className="font-semibold text-slate-900">{item.name}</p>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusAging(item.agingDays)}`}>{item.agingDays} días</span>
              </div>
              <strong className="text-slate-900">{moneyFormatter.format(item.amount)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Board de pagos por conductor</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {driverBoard.map((item) => (
            <article key={item.name} className="rounded-lg border border-slate-200 p-3">
              <p className="font-semibold text-slate-900">{item.name}</p>
              <div className="mt-2 space-y-1 text-sm">
                <p>Por cobrar: <strong>{moneyFormatter.format(item.toCollect)}</strong></p>
                <p>Por liquidar: <strong>{moneyFormatter.format(item.toSettle)}</strong></p>
                <p>Liquidado: <strong>{moneyFormatter.format(item.settled)}</strong></p>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="rounded border border-slate-300 px-2 py-1 text-xs">Detalle</button>
                <button className="rounded border border-slate-300 px-2 py-1 text-xs">Marcar recaudo</button>
                <button className="rounded border border-slate-300 px-2 py-1 text-xs">Liquidar</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Gastos fijos</h2>
          <div className="mt-3 space-y-2">
            {fixedExpensesSeed.map((expense) => (
              <div key={expense.name} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">{expense.name}</p>
                <p className="text-sm text-slate-600">{moneyFormatter.format(expense.amount)} · vence {expense.dueDate}</p>
                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${expense.status === "pagado" ? "bg-emerald-50 text-delivered" : "bg-amber-50 text-pending"}`}>
                  {expense.status === "pagado" ? "Pagado" : "Pendiente"}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Nómina empleados</h2>
          <div className="mt-3 space-y-2">
            {payrollSeed.map((employee) => (
              <div key={employee.name} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">{employee.name} · {employee.role}</p>
                <p className="text-sm text-slate-600">{moneyFormatter.format(employee.salary)} · {employee.frequency}</p>
                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${employee.status === "pagado" ? "bg-emerald-50 text-delivered" : "bg-rose-50 text-issue"}`}>
                  {employee.status === "pagado" ? "Pagado" : "Pendiente"}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
