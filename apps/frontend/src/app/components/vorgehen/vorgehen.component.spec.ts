import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VorgehenComponent } from './vorgehen.component';

describe('VorgehenComponent', () => {
  let component: VorgehenComponent;
  let fixture: ComponentFixture<VorgehenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VorgehenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VorgehenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
