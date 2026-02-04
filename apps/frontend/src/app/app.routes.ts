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
import { EmailListComponent } from './components/emails/email-list.component';
import { EmailTemplatesComponent } from './components/email-templates/email-templates.component';
import { EmailReplyComponent } from './components/email-reply/email-reply.component';
import { SentHistoryComponent } from './components/sent-history/sent-history.component';
import { EmailTrashComponent } from './components/email-trash/email-trash.component';

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
    { path: 'sent', component: SentHistoryComponent, canActivate: [authGuard], title: pageMainName + ' | Gesendet', data: { description: 'Gesendete E-Mails.' } },
    { path: 'trash', component: EmailTrashComponent, canActivate: [authGuard], title: pageMainName + ' | Papierkorb', data: { description: 'Papierkorb.' } },
    { path: 'templates', component: EmailTemplatesComponent, canActivate: [authGuard], title: pageMainName + ' | Vorlagen', data: { description: 'E-Mail Vorlagen verwalten.' } },
    { path: 'admin/users', component: AdminUsersComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Users', data: { description: 'Admin Users verwalten.' } },
];