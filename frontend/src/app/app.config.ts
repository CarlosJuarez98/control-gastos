import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { AuthService } from './auth.service';
import { credentialsInterceptor } from './credentials.interceptor';
import { offlineInterceptor } from './offline/offline.interceptor';
import { OfflineService } from './offline/offline.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // offline primero: puede cortocircuitar; credentials después envuelve withCredentials
    provideHttpClient(withInterceptors([offlineInterceptor, credentialsInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(() => {
      const offline = inject(OfflineService);
      offline.init();
      return firstValueFrom(inject(AuthService).me()).then(() => offline.sincronizar());
    }),
  ],
};
