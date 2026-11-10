import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TransactionModel } from '../models/transaction';


@Injectable({
  providedIn: 'root'
})
export class TransactionService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:8081/api/transaction';

  getTransactions(): Observable<TransactionModel[]> {
    return this.http.get<TransactionModel[]>(this.apiUrl);
  }

  getTransaction(id: string): Observable<TransactionModel> {
    return this.http.get<TransactionModel>(`${this.apiUrl}/${id}`);
  }

  createTransaction(user: TransactionModel): Observable<TransactionModel> {
    return this.http.post<TransactionModel>(this.apiUrl, user);
  }

  updateTransaction(id: string, user: TransactionModel): Observable<TransactionModel> {
    return this.http.put<TransactionModel>(`${this.apiUrl}/${id}`, user);
  }

  deleteTransaction(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
