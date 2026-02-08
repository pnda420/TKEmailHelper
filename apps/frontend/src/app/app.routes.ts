import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { AboutComponent } from './components/about/about.component';
import { ImprintComponent } from './components/imprint/imprint.component';
import { PolicyComponent } from './components/policy/policy.component';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { ProfileComponent } from './components/profile/profile.component';
import { AdminUsersComponent } from './components/admin/admin-users/admin-users.component';
import { AdminLogsComponent } from './components/admin/admin-logs/admin-logs.component';
import { AdminAiUsageComponent } from './components/admin/admin-ai-usage/admin-ai-usage.component';
import { AdminAiConfigComponent } from './components/admin/admin-ai-config/admin-ai-config.component';
import { EmailListComponent } from './components/emails/email-list.component';
import { EmailTemplatesComponent } from './components/email-templates/email-templates.component';
import { EmailReplyComponent } from './components/email-reply/email-reply.component';
import { EmailHistoryComponent } from './components/email-history/email-history.component';
import { AdminSqlComponent } from './components/admin/admin-sql/admin-sql.component';

const pageMainName = 'TK Email Helper';
export const routes: Routes = [
    { path: '', component: HomeComponent, title: pageMainName, data: { description: 'Email Helper Dashboard - Verwalte deine E-Mails effizient mit KI-Unterstützung.' } },
    { path: 'about', component: AboutComponent, title: pageMainName + ' | Über uns', data: { description: 'Über TK Email Helper.' } },
    { path: 'imprint', component: ImprintComponent, title: pageMainName + ' | Impressum', data: { description: 'Impressum.' } },
    { path: 'policy', component: PolicyComponent, title: pageMainName + ' | Datenschutz', data: { description: 'Datenschutzerklärung.' } },
    { path: 'login', component: LoginComponent, title: pageMainName + ' | Login', data: { description: 'Login.' } },
    { path: 'profile', component: ProfileComponent, title: pageMainName + ' | Profil', data: { description: 'Dein Profil.' } },
    { path: 'register', component: RegisterComponent, title: pageMainName + ' | Register', data: { description: 'Registrieren.' } },
    { path: 'emails', component: EmailListComponent, canActivate: [authGuard], title: pageMainName + ' | Posteingang', data: { description: 'E-Mail Posteingang.' } },
    { path: 'emails/:id/reply', component: EmailReplyComponent, canActivate: [authGuard], title: pageMainName + ' | Antworten', data: { description: 'E-Mail beantworten.' } },
    { path: 'history', component: EmailHistoryComponent, canActivate: [authGuard], title: pageMainName + ' | Verlauf', data: { description: 'E-Mail Verlauf – Gesendet & Papierkorb.' } },
    { path: 'templates', component: EmailTemplatesComponent, canActivate: [authGuard], title: pageMainName + ' | Vorlagen', data: { description: 'E-Mail Vorlagen verwalten.' } },
    { path: 'admin', redirectTo: 'admin/logs', pathMatch: 'full' },
    { path: 'admin/logs', component: AdminLogsComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Logs', data: { description: 'Error Logs & Monitoring.' } },
    { path: 'admin/users', component: AdminUsersComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Users', data: { description: 'Admin Users verwalten.' } },
    { path: 'admin/ai-usage', component: AdminAiUsageComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | AI Usage', data: { description: 'AI Usage & Kosten Monitoring.' } },
    { path: 'admin/ai-config', component: AdminAiConfigComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Antwort-Regeln', data: { description: 'Antwort-Regeln verwalten.' } },
    { path: 'admin/sql', component: AdminSqlComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | SQL', data: { description: 'SQL Query Tool.' } },
];