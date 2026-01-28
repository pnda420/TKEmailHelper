import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { AboutComponent } from './components/about/about.component';
import { ContactComponent } from './components/contact/contact.component';
import { ImprintComponent } from './components/imprint/imprint.component';
import { PolicyComponent } from './components/policy/policy.component';
import { ServicesComponent } from './components/services/services.component';
import { ServerStatusComponent } from './components/server-status/server-status.component';
import { VorgehenComponent } from './components/vorgehen/vorgehen.component';
import { MaintenanceComponent } from './components/maintenance/maintenance.component';
import { AdminRequestsComponent } from './components/admin/admin-requests/admin-requests.component';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { ProfileComponent } from './components/profile/profile.component';
import { AdminUsersComponent } from './components/admin/admin-users/admin-users.component';
import { AdminSettingsComponent } from './components/admin/admin-settings/admin-settings.component';
import { BookingComponent } from './components/booking/booking.component';
import { AdminBookingComponent } from './components/admin/admin-booking/admin-booking.component';
import { ItServicesComponent } from './components/it-services/it-services.component';
import { AdminNewsletterComponent } from './components/admin/admin-newsletter/admin-newsletter.component';
import { AdminFaqComponent } from './components/admin/admin-faq/admin-faq.component';
import { AdminServicesComponent } from './components/admin/admin-services/admin-services.component';
import { AdminInvoicesComponent } from './components/admin/admin-invoices/admin-invoices.component';
import { AdminDashboardComponent } from './components/admin/admin-dashboard/admin-dashboard.component';
import { AdminAnalyticsComponent } from './components/admin/admin-analytics/admin-analytics.component';
import { FaqComponent } from './components/faq/faq.component';
import { RemoteSupportComponent } from './components/remote-support/remote-support.component';

const pageMainName = 'Leonards & Brandenburger IT';
export const routes: Routes = [
    { path: '', component: HomeComponent, title: pageMainName, data: { description: 'IT-Dienstleistungen, Webentwicklung und SEO – pragmatisch, transparent und zuverlässig. Leonards & Brandenburger IT hilft Ihnen bei Konzeption, Entwicklung und Betrieb.' } },
    { path: 'services', component: ServicesComponent, title: pageMainName + ' | Dienstleistungen', data: { description: 'Übersicht unserer Leistungen: Websites, All-in-One-Pakete, Full-Stack-Entwicklung und SEO-Optimierung. Klar strukturiert und wirkungsorientiert.' } },
    { path: 'about', component: AboutComponent, title: pageMainName + ' | Über uns', data: { description: 'Erfahren Sie mehr über Leonards & Brandenburger IT: Werte, Arbeitsweise und warum wir Technologie pragmatisch und zielorientiert einsetzen.' } },
    { path: 'contact', component: ContactComponent, title: pageMainName + ' | Kontakt', data: { description: 'Kontaktieren Sie Leonards & Brandenburger IT für ein unverbindliches Erstgespräch. Schnelle Einschätzung ohne Sales-Druck.' } },
    { path: 'imprint', component: ImprintComponent, title: pageMainName + ' | Impressum', data: { description: 'Impressum von Leonards & Brandenburger IT.' } },
    { path: 'server-status', component: ServerStatusComponent, title: pageMainName + ' | Systemstatus', data: { description: 'Systemstatus von Leonards & Brandenburger IT.' } },
    { path: 'process', component: VorgehenComponent, title: pageMainName + ' | Vorgehen', data: { description: 'Vorgehen von Leonards & Brandenburger IT.' } },
    { path: 'faq', component: FaqComponent, title: pageMainName + ' | FAQ', data: { description: 'FAQ von Leonards & Brandenburger IT.' } },
    { path: 'policy', component: PolicyComponent, title: pageMainName + ' | Datenschutz', data: { description: 'Datenschutzerklärung von Leonards & Brandenburger IT.' } },
    { path: 'booking', component: BookingComponent, title: pageMainName + ' | Buchung', data: { description: 'Buchungsseite von Leonards & Brandenburger IT.' } },
    { path: 'login', component: LoginComponent, title: pageMainName + ' | Login', data: { description: 'Login von Leonards & Brandenburger IT.' } },
    { path: 'profile', component: ProfileComponent, title: pageMainName + ' | Profil', data: { description: 'Profil von Leonards & Brandenburger IT.' } },
    { path: 'register', component: RegisterComponent, title: pageMainName + ' | Register', data: { description: 'Register von Leonards & Brandenburger IT.' } },
    { path: 'it-services', component: ItServicesComponent, title: pageMainName + ' | IT-Services', data: { description: 'IT-Services von Leonards & Brandenburger IT.' } },
    { path: 'remote-support', component: RemoteSupportComponent, title: pageMainName + ' | Remote Support', data: { description: 'AnyDesk Remote-Verbindung für schnellen IT-Support. Laden Sie hier die Software herunter.' } },

    { path: 'admin', component: AdminDashboardComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Dashboard', data: { description: 'Admin Dashboard von Leonards & Brandenburger IT.' } },
    { path: 'admin/requests', component: AdminRequestsComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Requests', data: { description: 'Admin Requests von Leonards & Brandenburger IT.' } },
    { path: 'admin/users', component: AdminUsersComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Users', data: { description: 'Admin Users von Leonards & Brandenburger IT.' } },
    { path: 'admin/booking', component: AdminBookingComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Booking', data: { description: 'Admin Booking von Leonards & Brandenburger IT.' } },
    { path: 'admin/settings', component: AdminSettingsComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Settings', data: { description: 'Admin Settings von Leonards & Brandenburger IT.' } },
    { path: 'admin/newsletter', component: AdminNewsletterComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Newsletter', data: { description: 'Admin Newsletter von Leonards & Brandenburger IT.' } },
    { path: 'admin/faq', component: AdminFaqComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin FAQ', data: { description: 'Admin FAQ Verwaltung von Leonards & Brandenburger IT.' } },
    { path: 'admin/services', component: AdminServicesComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Services', data: { description: 'Admin Services Verwaltung von Leonards & Brandenburger IT.' } },
    { path: 'admin/invoices', component: AdminInvoicesComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Rechnungen', data: { description: 'Admin Rechnungsverwaltung von Leonards & Brandenburger IT.' } },
    { path: 'admin/analytics', component: AdminAnalyticsComponent, canActivate: [authGuard, adminGuard], title: pageMainName + ' | Admin Analytics', data: { description: 'Analytics Dashboard von Leonards & Brandenburger IT.' } },
];