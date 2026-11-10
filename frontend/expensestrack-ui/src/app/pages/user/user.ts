import { ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { UserService } from '../../services/user.service';
import { User as UserModel } from '../../models/user';

@Component({
  selector: 'app-user',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './user.html',
  styleUrl: './user.css',
})
export class User implements OnInit {
  private userService = inject(UserService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('userForm') userForm?: NgForm;

  users: UserModel[] = [];

  errorMessage = '';
  successMessage = '';

  editingId: string | null = null;
  isSaving = false;
  isLoading = false;

  // delete state
  deleteTarget: UserModel | null = null;
  isDeleting = false;

  // search + pagination state
  searchTerm = '';
  currentPage = 1;
  pageSize = 5;
  pageSizeOptions = [5, 10, 20];

  user: UserModel = this.emptyForm();

  ngOnInit(): void {
    this.loadUsers();
  }

  private emptyForm(): UserModel {
    return {
      fullname: '',
      email: '',
      password: '',
    };
  }

  /* ---------------- Search + pagination ---------------- */

  get filteredUsers(): UserModel[] {
    const term = this.searchTerm.trim().toLowerCase();

    if (!term) {
      return this.users;
    }

    return this.users.filter(
      (u) =>
        (u.fullname ?? '').toLowerCase().includes(term) ||
        (u.email ?? '').toLowerCase().includes(term)
    );
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
  }

  get pagedUsers(): UserModel[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  get startIndex(): number {
    return this.filteredUsers.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get endIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredUsers.length);
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const maxVisible = 5;

    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
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

  // keeps the current page valid after data changes (e.g. deleting the last row on a page)
  private clampPage(): void {
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
  }

  /* ---------------- Create / Update ---------------- */

  saveUser(): void {
    if (this.isSaving) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isSaving = true;

    const userData: UserModel = { ...this.user };
    const wasEditing = !!this.editingId;

    // when editing, a blank password means "keep the current one"
    if (wasEditing && !userData.password) {
      delete (userData as Partial<UserModel>).password;
    }

    const request$ = this.editingId
      ? this.userService.updateUser(this.editingId, userData)
      : this.userService.createUser(userData);

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
            ? 'User updated successfully.'
            : 'User registered successfully.';

          this.resetForm();
          this.cdr.detectChanges();

          this.loadUsers();
        },

        error: (error) => {
          console.error('Error saving user:', error);

          if (error.status === 0) {
            this.errorMessage = 'Cannot connect to the backend. Check Spring Boot and CORS.';
          } else if (error.status === 409) {
            this.errorMessage = 'A user with this email already exists.';
          } else {
            this.errorMessage = error.error?.message || 'Failed to save user.';
          }

          this.cdr.detectChanges();
        },
      });
  }

  updateUser(item: UserModel): void {
    if (!item.id) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    this.editingId = item.id;
    // password is left blank on purpose; the backend should never send it back
    this.user = { ...item, password: '' };

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  resetForm(): void {
    this.user = this.emptyForm();
    this.editingId = null;
    // clears touched/invalid state so red errors don't show after a successful save
    this.userForm?.resetForm(this.user);
  }

  /* ---------------- Delete ---------------- */

  confirmDelete(item: UserModel): void {
    this.deleteTarget = item;
  }

  cancelDelete(): void {
    if (this.isDeleting) {
      return;
    }
    this.deleteTarget = null;
  }

  deleteUser(): void {
    const target = this.deleteTarget;

    if (!target?.id || this.isDeleting) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.isDeleting = true;

    this.userService
      .deleteUser(target.id)
      .pipe(
        finalize(() => {
          this.isDeleting = false;
          this.deleteTarget = null;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          // if the deleted user was being edited, leave edit mode
          if (this.editingId === target.id) {
            this.resetForm();
          }

          this.users = this.users.filter((u) => u.id !== target.id);
          this.clampPage();
          this.successMessage = 'User deleted successfully.';
          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error('Error deleting user:', error);

          if (error.status === 0) {
            this.errorMessage = 'Cannot connect to the backend. Check Spring Boot and CORS.';
          } else if (error.status === 404) {
            this.errorMessage = 'This user no longer exists.';
            this.loadUsers();
          } else {
            this.errorMessage = error.error?.message || 'Failed to delete user.';
          }

          this.cdr.detectChanges();
        },
      });
  }

  /* ---------------- Load ---------------- */

  loadUsers(): void {
    this.isLoading = true;

    this.userService
      .getUsers()
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (users) => {
          this.users = users;
          this.clampPage();
          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error('Error loading users:', error);
          this.errorMessage = 'Failed to load users.';
          this.cdr.detectChanges();
        },
      });
  }
}