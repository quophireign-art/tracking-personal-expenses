import { ChangeDetectorRef, Component, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { TransactionService } from '../../services/transaction.service';
import { finalize } from 'rxjs';
import { CategoryModel } from '../../models/category';
import { TransactionModel } from '../../models/transaction';

@Component({
  selector: 'app-transaction',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transaction.html',
  styleUrl: './transaction.css',
})
export class Transaction {
  private transactionService = inject(TransactionService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('transactionForm') transactionForm?: NgForm;

  transactions: TransactionModel[] = [];

  errorMessage = '';
  successMessage = '';

  showForm = false;
  editingId: string | null = null;
  isSaving = false;
  isLoading = false;

  // delete state
  deleteTarget: TransactionModel | null = null;
  isDeleting = false;

  // search + pagination state
  searchTerm = '';
  currentPage = 1;
  pageSize = 5;
  pageSizeOptions = [5, 10, 20];

  transaction: TransactionModel = this.emptyForm();

  ngOnInit(): void {
    this.loadTransactions();
  }

  private emptyForm(): TransactionModel {
    return {
      type: '',
      amount: '',
      description: '',
      date: '',
      paymentMethod: '',
    };
  }
  /* ---------------- Total Summary -------------------*/
  selectedFilter: 'ALL' | 'INCOME' | 'EXPENSE' = 'ALL';

  get totalIncome() {
    return this.transactions
      .filter((t) => t.type === 'INCOME')
      .reduce((s, t) => s + Number(t.amount), 0);
  }
  get totalExpenses() {
    return this.transactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((s, t) => s + Number(t.amount), 0);
  }
  get balance() {
    return this.totalIncome - this.totalExpenses;
  }

  /* ---------------- Search + pagination ---------------- */

  get filteredTransactions(): TransactionModel[] {
    const term = this.searchTerm.trim().toLowerCase();

    if (!term) {
      return this.transactions;
    }

    return this.transactions.filter(
      (c) =>
        (c.description ?? '').toLowerCase().includes(term) ||
        (c.type ?? '').toLowerCase().includes(term),
    );
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredTransactions.length / this.pageSize));
  }

  get pagedTransactions(): TransactionModel[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredTransactions.slice(start, start + this.pageSize);
  }

  get startIndex(): number {
    return this.filteredTransactions.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get endIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredTransactions.length);
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const maxVisible = 5;

    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  onSearchChange(): void {
    this.currentPage = 1;
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.currentPage = 1;
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) {
      return;
    }
    this.currentPage = page;
  }

  // keeps the current page valid after data changes
  private clampPage(): void {
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
  }

  /* ---------------- Form open / close ---------------- */

  openCreateForm(): void {
    this.editingId = null;
    this.transaction = this.emptyForm();
    this.showForm = true;
    this.successMessage = '';
    this.errorMessage = '';
  }

  editTransaction(item: TransactionModel): void {
    if (!item.id) {
      return;
    }

    this.editingId = item.id;
    this.transaction = { ...item };
    this.showForm = true;
    this.successMessage = '';
    this.errorMessage = '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.transaction = this.emptyForm();
    this.errorMessage = '';
  }

  /* ---------------- Create / Update ---------------- */

  saveTransaction(): void {
    if (this.isSaving) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isSaving = true;

    const transactionData: TransactionModel = { ...this.transaction };
    const wasEditing = !!this.editingId;

    const request$ = this.editingId
      ? this.transactionService.updateTransaction(this.editingId, transactionData)
      : this.transactionService.createTransaction(transactionData);

    request$
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.successMessage = wasEditing
            ? 'Transaction updated successfully.'
            : 'Transaction inserted successfully.';

          this.cancelForm();
          this.cdr.detectChanges();

          this.loadTransactions();
        },

        error: (error) => {
          console.error('Error saving category:', error);

          if (error.status === 0) {
            this.errorMessage =
              'Cannot connect to the backend. Check the backend connection (CORS).';
          } else if (error.status === 409) {
            this.errorMessage = 'Already made Transactions';
          } else {
            this.errorMessage = error.error?.message || 'Failed to insert transactions.';
          }

          this.cdr.detectChanges();
        },
      });
  }

  /* ---------------- Delete ---------------- */

  confirmDelete(item: TransactionModel): void {
    this.deleteTarget = item;
  }

  cancelDelete(): void {
    if (this.isDeleting) {
      return;
    }
    this.deleteTarget = null;
  }

  deleteTransaction(): void {
    const target = this.deleteTarget;

    if (!target?.id || this.isDeleting) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isDeleting = true;

    this.transactionService
      .deleteTransaction(target.id)
      .pipe(
        finalize(() => {
          this.isDeleting = false;
          this.deleteTarget = null;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          if (this.editingId === target.id) {
            this.cancelForm();
          }

          this.transactions = this.transactions.filter((c) => c.id !== target.id);
          this.clampPage();
          this.successMessage = 'Transaction deleted successfully.';
          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error('Error deleting transactions:', error);

          if (error.status === 0) {
            this.errorMessage =
              'Cannot connect to the backend. Check the backend connection (CORS).';
          } else if (error.status === 404) {
            this.errorMessage = 'This transaction no longer exists.';
            this.loadTransactions();
          } else {
            this.errorMessage = error.error?.message || 'Failed to delete transaction.';
          }

          this.cdr.detectChanges();
        },
      });
  }

  /* ---------------- Load ---------------- */

  loadTransactions(): void {
    this.isLoading = true;

    this.transactionService
      .getTransactions()
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (transactions) => {
          this.transactions = transactions;
          this.clampPage();
          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error('Error loading transactions:', error);
          this.errorMessage = 'Failed to load transactions.';
          this.cdr.detectChanges();
        },
      });
  }
}
