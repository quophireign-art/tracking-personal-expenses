import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full' 
    },
    {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent:() => 
            import ('./pages/dashboard/dashboard').then((m) => m.Dashboard)
        
    },
    {
        path: 'user',
        title: 'Create User',
        loadComponent:() =>
            import ('./pages/user/user').then((m) => m.User)
    },
    {
        path: 'category',
        title: 'Category',
        loadComponent: () =>
            import ('./pages/category/category').then((m) => m.Category)
    },
    {
        path: 'transaction',
        title: 'Transaction',
        loadComponent: () =>
            import('./pages/transaction/transaction').then((m) => m.Transaction)
    },
    {
    path: '**',
    redirectTo: 'dashboard'
    }
];
