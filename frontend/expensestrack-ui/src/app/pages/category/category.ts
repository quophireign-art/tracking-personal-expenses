import { ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs';
import { CategoryService } from '../../services/category.service';
import { CategoryModel } from '../../models/category';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './category.html',
  styleUrl: './category.css',
})
export class Category implements OnInit {
  private categoryService = inject(CategoryService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('categoryForm') categoryForm?: NgForm;

  categories: CategoryModel[] = [];

  errorMessage = '';
  successMessage = '';

  showForm = false;
  editingId: string | null = null;
  isSaving = false;
  isLoading = false;

  // delete state
  deleteTarget: CategoryModel | null = null;
  isDeleting = false;

  // search + pagination state
  searchTerm = '';
  currentPage = 1;
  pageSize = 5;
  pageSizeOptions = [5, 10, 20];

  category: CategoryModel = this.emptyForm();

  ngOnInit(): void {
    this.loadCategories();
  }

  private emptyForm(): CategoryModel {
    return {
      name: '',
      type: '',
    };
  }

  /* ---------------- Summary counts ---------------- */

  get incomeCount(): number {
    return this.categories.filter((c) => c.type === 'INCOME').length;
  }

  get expenseCount(): number {
    return this.categories.filter((c) => c.type === 'EXPENSE').length;
  }

  /* ---------------- Search + pagination ---------------- */

  get filteredCategories(): CategoryModel[] {
    const term = this.searchTerm.trim().toLowerCase();

    if (!term) {
      return this.categories;
    }

    return this.categories.filter(
      (c) =>
        (c.name ?? '').toLowerCase().includes(term) ||
        (c.type ?? '').toLowerCase().includes(term)
    );
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredCategories.length / this.pageSize));
  }

  get pagedCategories(): CategoryModel[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredCategories.slice(start, start + this.pageSize);
  }

  get startIndex(): number {
    return this.filteredCategories.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get endIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredCategories.length);
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
    this.category = this.emptyForm();
    this.showForm = true;
    this.successMessage = '';
    this.errorMessage = '';
  }

  editCategory(item: CategoryModel): void {
    if (!item.id) {
      return;
    }

    this.editingId = item.id;
    this.category = { ...item };
    this.showForm = true;
    this.successMessage = '';
    this.errorMessage = '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.category = this.emptyForm();
    this.errorMessage = '';
  }

  /* ---------------- Create / Update ---------------- */

  saveCategory(): void {
    if (this.isSaving) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isSaving = true;

    const categoryData: CategoryModel = { ...this.category };
    const wasEditing = !!this.editingId;

    const request$ = this.editingId
      ? this.categoryService.updateCategory(this.editingId, categoryData)
      : this.categoryService.createCategory(categoryData);

    request$
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          this.successMessage = wasEditing
            ? 'Category updated successfully.'
            : 'Category inserted successfully.';

          this.cancelForm();
          this.cdr.detectChanges();

          this.loadCategories();
        },

        error: (error) => {
          console.error('Error saving category:', error);

          if (error.status === 0) {
            this.errorMessage = 'Cannot connect to the backend. Check your backend connection (CORS).';
          } else if (error.status === 409) {
            this.errorMessage = 'A category with this name already exists.';
          } else {
            this.errorMessage = error.error?.message || 'Failed to save category.';
          }

          this.cdr.detectChanges();
        },
      });
  }

  /* ---------------- Delete ---------------- */

  confirmDelete(item: CategoryModel): void {
    this.deleteTarget = item;
  }

  cancelDelete(): void {
    if (this.isDeleting) {
      return;
    }
    this.deleteTarget = null;
  }

  deleteCategory(): void {
    const target = this.deleteTarget;

    if (!target?.id || this.isDeleting) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isDeleting = true;

    this.categoryService
      .deleteCategory(target.id)
      .pipe(
        finalize(() => {
          this.isDeleting = false;
          this.deleteTarget = null;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          // if the deleted category was open in the form, close it
          if (this.editingId === target.id) {
            this.cancelForm();
          }

          this.categories = this.categories.filter((c) => c.id !== target.id);
          this.clampPage();
          this.successMessage = 'Category deleted successfully.';
          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error('Error deleting category:', error);

          if (error.status === 0) {
            this.errorMessage = 'Cannot connect to the backend. Check your backend connection (CORS).';
          } else if (error.status === 404) {
            this.errorMessage = 'This category no longer exists.';
            this.loadCategories();
          } else {
            this.errorMessage = error.error?.message || 'Failed to delete category.';
          }

          this.cdr.detectChanges();
        },
      });
  }

  /* ---------------- Load ---------------- */

  loadCategories(): void {
    this.isLoading = true;

    // NOTE: rename getCategories() if your CategoryService uses a different method name
    this.categoryService
      .getCategories()
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.clampPage();
          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error('Error loading categories:', error);
          this.errorMessage = 'Failed to load categories.';
          this.cdr.detectChanges();
        },
      });
  }
}