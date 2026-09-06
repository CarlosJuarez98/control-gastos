import { Component, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../api.service';
import { Resumen } from '../../modelos';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './resumen.component.html',
  styleUrl: './resumen.component.css',
})
export class ResumenComponent implements OnInit {
  data?: Resumen;
  error = '';

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.resumen().subscribe({
      next: (r) => (this.data = r),
      error: (e) => (this.error = e?.error?.error || 'No se pudo cargar el resumen'),
    });
  }

  maxCat(): number {
    if (!this.data?.gastosPorCategoria?.length) return 1;
    return Math.max(...this.data.gastosPorCategoria.map((c) => Number(c.total) || 0), 1);
  }
}
