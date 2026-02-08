import { Component } from '@angular/core';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { SqlTestComponent } from '../../sql-test/sql-test.component';

@Component({
  selector: 'app-admin-sql',
  standalone: true,
  imports: [AdminLayoutComponent, SqlTestComponent],
  template: `
    <app-admin-layout>
      <app-sql-test></app-sql-test>
    </app-admin-layout>
  `,
})
export class AdminSqlComponent {}
