import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { Admin } from './admin';

describe('Admin base', () => {
  it('muestra un estado honesto sin CRUD ni datos de ejemplo', async () => {
    TestBed.configureTestingModule({
      imports: [Admin],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            session: signal(null),
            isAdmin: signal(true),
            configurationPending: signal(false),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(Admin);
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent?.trim()).toBe(
      'Panel de administración',
    );
    expect(element.textContent).toContain('Sin CRUD todavía');
    expect(element.textContent).toContain('No se muestran contadores');
  });
});
