import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TransactionService } from '../../services/transaction.service';
import { TransactionModel } from '../../models/transaction';

type Period = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'ALL';

interface BreakdownItem {
  label: string;
  amount: number;
  percent: number;
  color: string;
}

interface MonthBar {
  label: string;
  income: number;
  expenses: number;
  incomeHeight: number;   // % of chart height
  expensesHeight: number; // % of chart height
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {

  private transactionService = inject(TransactionService);
  private cdr = inject(ChangeDetectorRef);

  transactions: TransactionModel[] = [];
  isLoading = false;
  errorMessage = '';

  /* ---------------- Period filter ---------------- */

  periodOptions: { value: Period; label: string }[] = [
    { value: 'THIS_MONTH', label: 'This Month' },
    { value: 'LAST_MONTH', label: 'Last Month' },
    { value: 'THIS_YEAR', label: 'This Year' },
    { value: 'ALL', label: 'All Time' },
  ];
  selectedPeriod: Period = 'THIS_MONTH';

  /* ---------------- Computed dashboard data ---------------- */

  balance = 0;
  income = 0;
  expenses = 0;
  netSavings = 0;
  savingsRate: number | null = null;

  incomeChange: number | null = null;
  expensesChange: number | null = null;
  savingsChange: number | null = null;
  comparisonLabel = '';

  recentTransactions: TransactionModel[] = [];

  breakdown: BreakdownItem[] = [];
  breakdownGradient = '#e2e8f0';

  monthBars: MonthBar[] = [];

  private readonly palette = ['#10b981', '#3b82f6', '#fb923c', '#8b5cf6', '#ec4899', '#94a3b8'];

  ngOnInit(): void {
    this.loadTransactions();
  }

  /* ---------------- Load ---------------- */

  loadTransactions(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.transactionService
      .getTransactions()
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (transactions) => {
          this.transactions = transactions ?? [];
          this.recompute();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading dashboard data:', error);
          this.errorMessage =
            error.status === 0
              ? 'Cannot connect to the backend. Check the backend connection (CORS).'
              : 'Failed to load dashboard data.';
          this.cdr.detectChanges();
        },
      });
  }

  /* ---------------- Calculations ---------------- */

  onPeriodChange(): void {
    this.recompute();
  }

  private recompute(): void {
    // All-time balance (not affected by the period filter)
    const all = this.sum(this.transactions);
    this.balance = all.income - all.expenses;

    // Current period
    const range = this.rangeFor(this.selectedPeriod, 0);
    const current = this.transactions.filter((t) => this.inRange(t, range));
    const cur = this.sum(current);

    this.income = cur.income;
    this.expenses = cur.expenses;
    this.netSavings = cur.income - cur.expenses;
    this.savingsRate = cur.income > 0 ? (this.netSavings / cur.income) * 100 : null;

    // Previous period (for % change)
    const prevRange = this.rangeFor(this.selectedPeriod, 1);
    if (prevRange) {
      const prev = this.sum(this.transactions.filter((t) => this.inRange(t, prevRange)));
      this.incomeChange = this.pctChange(cur.income, prev.income);
      this.expensesChange = this.pctChange(cur.expenses, prev.expenses);
      this.savingsChange = this.pctChange(
        cur.income - cur.expenses,
        prev.income - prev.expenses
      );
    } else {
      this.incomeChange = this.expensesChange = this.savingsChange = null;
    }
    this.comparisonLabel = this.comparisonLabelFor(this.selectedPeriod);

    this.buildBreakdown(current);
    this.buildRecent();
    this.buildMonthBars();
  }

  private sum(list: TransactionModel[]): { income: number; expenses: number } {
    let income = 0;
    let expenses = 0;

    for (const t of list) {
      const amount = this.amountOf(t);
      if (this.typeOf(t) === 'INCOME') {
        income += amount;
      } else if (this.typeOf(t) === 'EXPENSE') {
        expenses += amount;
      }
    }
    return { income, expenses };
  }

  private buildBreakdown(current: TransactionModel[]): void {
    const totals = new Map<string, number>();

    for (const t of current) {
      if (this.typeOf(t) !== 'EXPENSE') {
        continue;
      }
      const label = this.formatLabel(t.paymentMethod) || 'Other';
      totals.set(label, (totals.get(label) ?? 0) + this.amountOf(t));
    }

    const totalExpenses = Array.from(totals.values()).reduce((a, b) => a + b, 0);

    if (totalExpenses <= 0) {
      this.breakdown = [];
      this.breakdownGradient = '#e2e8f0';
      return;
    }

    let rows = Array.from(totals.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);

    // keep the top 5, group the rest as "Other"
    if (rows.length > 6) {
      const rest = rows.slice(5).reduce((s, r) => s + r.amount, 0);
      rows = [...rows.slice(0, 5), { label: 'Other', amount: rest }];
    }

    this.breakdown = rows.map((r, i) => ({
      label: r.label,
      amount: r.amount,
      percent: (r.amount / totalExpenses) * 100,
      color: this.palette[i % this.palette.length],
    }));

    let cursor = 0;
    const stops = this.breakdown.map((b) => {
      const from = cursor;
      cursor += b.percent;
      return `${b.color} ${from}% ${cursor}%`;
    });
    this.breakdownGradient = `conic-gradient(${stops.join(', ')})`;
  }

  private buildRecent(): void {
    this.recentTransactions = [...this.transactions]
      .sort((a, b) => {
        const da = this.parseDate(a.date)?.getTime() ?? 0;
        const db = this.parseDate(b.date)?.getTime() ?? 0;
        return db - da;
      })
      .slice(0, 5);
  }

  private buildMonthBars(): void {
    const now = new Date();
    const months: { year: number; month: number; label: string; income: number; expenses: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleString('en-US', { month: 'short' }),
        income: 0,
        expenses: 0,
      });
    }

    for (const t of this.transactions) {
      const d = this.parseDate(t.date);
      if (!d) {
        continue;
      }
      const bucket = months.find((m) => m.year === d.getFullYear() && m.month === d.getMonth());
      if (!bucket) {
        continue;
      }
      if (this.typeOf(t) === 'INCOME') {
        bucket.income += this.amountOf(t);
      } else if (this.typeOf(t) === 'EXPENSE') {
        bucket.expenses += this.amountOf(t);
      }
    }

    const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expenses)));

    this.monthBars = months.map((m) => ({
      label: m.label,
      income: m.income,
      expenses: m.expenses,
      incomeHeight: m.income > 0 ? Math.max(4, (m.income / max) * 100) : 0,
      expensesHeight: m.expenses > 0 ? Math.max(4, (m.expenses / max) * 100) : 0,
    }));
  }

  /* ---------------- Helpers ---------------- */

  private rangeFor(period: Period, back: number): { start: Date; end: Date } | null {
    const now = new Date();

    switch (period) {
      case 'THIS_MONTH':
        return {
          start: new Date(now.getFullYear(), now.getMonth() - back, 1),
          end: new Date(now.getFullYear(), now.getMonth() - back + 1, 1),
        };
      case 'LAST_MONTH':
        return {
          start: new Date(now.getFullYear(), now.getMonth() - 1 - back, 1),
          end: new Date(now.getFullYear(), now.getMonth() - back, 1),
        };
      case 'THIS_YEAR':
        return {
          start: new Date(now.getFullYear() - back, 0, 1),
          end: new Date(now.getFullYear() - back + 1, 0, 1),
        };
      default:
        // ALL: no range for the current period and no previous period to compare against
        return back === 0 ? { start: new Date(0), end: new Date(8640000000000000) } : null;
    }
  }

  private inRange(t: TransactionModel, range: { start: Date; end: Date } | null): boolean {
    if (!range) {
      return false;
    }
    const d = this.parseDate(t.date);
    return !!d && d >= range.start && d < range.end;
  }

  private comparisonLabelFor(period: Period): string {
    switch (period) {
      case 'THIS_MONTH': return 'vs last month';
      case 'LAST_MONTH': return 'vs the month before';
      case 'THIS_YEAR': return 'vs last year';
      default: return '';
    }
  }

  private pctChange(current: number, previous: number): number | null {
    if (previous === 0) {
      return null;
    }
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  private amountOf(t: TransactionModel): number {
    const n = Number(t.amount);
    return Number.isFinite(n) ? n : 0;
  }

  private typeOf(t: TransactionModel): string {
    return (t.type ?? '').toString().toUpperCase();
  }

  // 'YYYY-MM-DD' is parsed as a local date to avoid timezone shifts
  private parseDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }
    const str = String(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
    const d = match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // 'MOBILE_MONEY' -> 'Mobile Money'
  formatLabel(value?: string | null): string {
    if (!value) {
      return '';
    }
    return value
      .toString()
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  abs(value: number): number {
    return Math.abs(value);
  }
}